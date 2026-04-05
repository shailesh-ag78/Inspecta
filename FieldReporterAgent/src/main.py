from asyncio import tasks
import os
import dotenv
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import asynccontextmanager
from pydantic import BaseModel

import uvicorn
from typing import Optional, Dict, Any
from pathlib import Path
from google.cloud import storage
import logging
import json
from .openai_service import OpenAIService

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filename='.\\task_generator.log',
)
logger = logging.getLogger(__name__)

INSPCTA_FILE_BUCKET = "inspecta-file-bucket"
UPLOADS_FOLDER = "uploads"

# Set this in your environment or .env file: ENV_MODE=local
env_path = Path(__file__).parent.parent / ".env"
dotenv.load_dotenv(dotenv_path=env_path)

ENV_MODE = os.getenv("ENV_MODE", "local")
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
MODEL_TEMPERATURE = float(os.getenv("MODEL_TEMPERATURE", "0.2"))
logger.info(f"🚀 Starting Executor with {env_path} ENV_MODE={ENV_MODE}   {MODEL} (temp={MODEL_TEMPERATURE})")

# Define your local root (where files actually live on your PC)
LOCAL_STORAGE_ROOT = os.path.abspath(os.getenv("LOCAL_STORAGE_ROOT", r"G:\code\Inspecta\Data"))
LOCAL_TEMP_FOLDER = os.path.join(LOCAL_STORAGE_ROOT, "temp")
if not os.path.exists(LOCAL_TEMP_FOLDER):
    os.makedirs(LOCAL_TEMP_FOLDER)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    logger.info("🔧 Initializing resources...")
    
    # Initialize GCS client if in non-local mode
    if ENV_MODE != "local":
        try:
            global gcs_client
            gcs_client = storage.Client()
            logger.info("✅ GCS client initialized successfully.")
        except Exception as e:
            logger.error(f"❌ Failed to initialize GCS client: {e}")
            raise RuntimeError("Failed to initialize GCS client") from e
    
    yield  # Run the application
    
    # Shutdown code
    logger.info("🧹 Cleaning up resources...")
    
app = FastAPI(lifespan=lifespan)

openai_service = OpenAIService(logger = logger)
class GenerateTasksRequest(BaseModel):
    transcript_segments_json_url : str
    metadata: Optional[Dict[str, Any]] = None # company_name, industry_type, timestamp, etc.

@app.post("/generate_tasks")
async def generate_tasks_endpoint(request: GenerateTasksRequest):
    """
    Generates actionable tasks from the incident transcript store on storage lcoation
    """
    transcript_segments_json_url = request.transcript_segments_json_url
    metadata = request.metadata
    tasks = []
    
    # 1. Validation
    if not transcript_segments_json_url:
        raise HTTPException(status_code=400, detail="transcript is required")
    
    logger.info(f"Generating tasks for transcript: {transcript_segments_json_url}...")
    
    if(ENV_MODE == "local"):
        if not os.path.exists(transcript_segments_json_url):
            raise HTTPException(status_code=400, detail=f"Transcript segments file not found at: {transcript_segments_json_url}")
    
        p = Path(transcript_segments_json_url)
        tasks_file_path = str(p.with_name(f"{p.stem}_tasks.json"))
        tasks_url = tasks_file_path
        transcript_url_path = transcript_segments_json_url
    else :
        # Check if file is available on GCS
        # File name example : "gs://inspecta-file-bucket/<company_storage>/uploads/a1b2-c3d4.mp4"
        if not gcs_client:
                raise HTTPException(status_code=500, detail="GCS client not initialized")

        #full_gcp_path = f"gs://{INSPCTA_FILE_BUCKET}/{company_storage_id}/UPLOADS_FOLDER/{filename}"    
        blob_name = transcript_segments_json_url.replace(f"gs://{INSPCTA_FILE_BUCKET}/", "")
        bucket = gcs_client.bucket(INSPCTA_FILE_BUCKET)
        blob = bucket.get_blob(blob_name)   # blob = {company_storage_id}/UPLOADS_FOLDER/{filename}"
        if not blob:
            raise HTTPException(status_code=400, detail=f"Transcript segments file not found at: {transcript_segments_json_url}")

        filename = blob_name.rsplit("/", 1)[-1]
        name_without_ext = filename.rsplit(".", 1)[0]  # Handle multiple dots correctly (e.g., "video.v1_audio.mp3")
        tasks_filename = f"{name_without_ext}_tasks.json"
        tasks_file_path = os.path.join(LOCAL_TEMP_FOLDER, tasks_filename)
        tasks_url = blob_name.rsplit("/", 1)[0] + "/" + tasks_filename

        # Downloading Transcript file locally
        temp_transcript_file_name = "temp_" + Path(blob_name).name
        transcript_url_path = os.path.join(LOCAL_TEMP_FOLDER, temp_transcript_file_name)
        logger.info(f"Downloading {transcript_segments_json_url} to {transcript_url_path}...")
        blob.download_to_filename(transcript_url_path)

    # 3. Generating Tasks using the transcript
    input_metadata = {
        "company_name": metadata.get("company_name", "Unknown Company") if metadata else "",
        "industry": metadata.get("industry", "Unknown Industry") if metadata else "",
        "input_prompt": metadata.get("input_prompt", "") if metadata else "",
    }
    try:
        logger.info(f"Generating tasks from {transcript_url_path} to {tasks_file_path}")
        tasks = tasks_generation(transcript_url_path, tasks_file_path, input_metadata)
    except Exception as e:
        logger.error(f"Extraction Error: {e}")
        raise HTTPException(status_code=500, detail=f"Tasks extraction failed: {str(e)}")

    # 4. Return Result
    if(ENV_MODE != "local"):
        # Upload Transcript file in GCS storage folder and set transcibe_url
        bucket = gcs_client.bucket(INSPCTA_FILE_BUCKET)
        new_transcibe_blob = bucket.blob(tasks_url)
        new_transcibe_blob.upload_from_filename(tasks_file_path)
        # Delete temporary files
        os.remove(transcript_url_path)
        os.remove(tasks_file_path)
        
    return {
        "status": "success",
        "tasks_count": len(tasks),
        "tasks_json_url": tasks_url,
        "metadata": { # Additional information to be returned if any
            "ENV_MODE" : ENV_MODE
        }
    }
    
def tasks_generation(transcript_url_path, tasks_file_path, metadata: dict) -> dict:
    """ Generate tasks using the transcript and save them to disk """

    transcript_content = ""
    # Load the JSON properly to ensure it's valid
    with open(transcript_url_path, 'r') as f:
        data = json.load(f)

    # Convert it back to a clean, formatted string for the prompt
    transcript_content = json.dumps(data, indent=2)
    
    try:
        user_prompt = (
            f"Company : {metadata['company_name']}, it is specialized in {metadata['industry']}. "
            f"{metadata['input_prompt']}. "
            f"\n\nHere is the transcript in json format:\n\n{transcript_content}"
        )
        
        # original_prompt = f"{system_prompt}\n{user_prompt}"
        # ALLOWED_PROMPT_LENGTH = 790  # Adjust based on model limits and expected system prompt size
        # logger.info(f"Original Prompt and Length: {original_prompt} : {len(original_prompt)} chars. Using {ALLOWED_PROMPT_LENGTH} characters only")
        # max_user_len = ALLOWED_PROMPT_LENGTH - len(system_prompt) - 1 # 1 for newline separation
        # prompt = f"{system_prompt}\n{user_prompt[:max_user_len]}"
        
        op_tasks = openai_service.generate_tasks_from_transcript(transcript_url_path, user_prompt=user_prompt)
        if not op_tasks:
            logger.warning(f"Task generation resulted in empty dictionary for {transcript_url_path}")            
        
        logger.info(f"Tasks generated: {op_tasks}")
        
        # Save the structured output to a JSON file for later retrieval
        with open(tasks_file_path, "w") as f:
            json.dump(op_tasks, f, indent=4, ensure_ascii=False)
        
        return op_tasks
    except Exception as e:
        logger.error(f"OpenAI Service Error: {e}")
        raise HTTPException(status_code=500, detail=f"Tasks generation failed: {str(e)}")
    

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
