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
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Set this in your environment or .env file: ENV_MODE=local
env_path = Path(__file__).parent.parent / ".env"
dotenv.load_dotenv(dotenv_path=env_path)

ENV_MODE = os.getenv("ENV_MODE", "local").lower()
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
MODEL_TEMPERATURE = float(os.getenv("MODEL_TEMPERATURE", "0.2"))
logger.info(f"🚀 Starting Executor with {env_path} ENV_MODE={ENV_MODE}   {MODEL} (temp={MODEL_TEMPERATURE})")

# Detect operating system: use '/tmp' for Linux (GCP Cloud Run), and Windows path locally
default_root = "/tmp" if os.name != "nt" else r"g:\code\Inspecta\Data"
LOCAL_STORAGE_ROOT = os.path.abspath(os.getenv("LOCAL_STORAGE_ROOT", default_root))
LOCAL_TEMP_FOLDER = os.path.join(LOCAL_STORAGE_ROOT, "temp")
if not os.path.exists(LOCAL_TEMP_FOLDER):
    os.makedirs(LOCAL_TEMP_FOLDER)

from typing import Tuple
from urllib.parse import urlparse
def extract_bucket_and_blob_from_gs(gs_uri: str) -> Tuple[str, str]:
    """
    Splits a gs:// URI into bucket_name and blob_name.
    """
    # Parse the URI using standard URL rules
    parsed = urlparse(gs_uri)
    
    # Check if the protocol is correct
    if parsed.scheme != "gs":
        raise ValueError("URI scheme must be 'gs'")
        
    bucket_name = parsed.netloc
    # Strip the leading slash from the path to get the exact blob name
    blob_name = parsed.path.lstrip("/")
    
    return bucket_name, blob_name
    
gcs_client = None
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    logger.info("🔧 Initializing resources...")
    
    # Initialize GCS client if in non-local mode
    global gcs_client
    if ENV_MODE.startswith("local"):
        datastore_path = Path(__file__).parent.parent.parent / "DataStore"
        gcp_key_file = (datastore_path / "gcp-key.json").resolve()
        gcs_client = storage.Client.from_service_account_json(gcp_key_file)
    else:
        gcs_client = storage.Client()
    if not gcs_client:
            logger.error(f"❌ Failed to initialize GCS client")
            raise RuntimeError("GCS client not initialized")
    logger.info("✅ GCS Client initialized")    
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
    
    gcp_bucket = ""
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
        bucket_name, blob_name = extract_bucket_and_blob_from_gs(transcript_segments_json_url)
        bucket = gcs_client.bucket(bucket_name)
        blob = bucket.get_blob(blob_name)   # blob = {company_storage_id}/UPLOADS_FOLDER/{filename}"
        if not blob:
            raise HTTPException(status_code=400, detail=f"Transcript segments file not found at: {transcript_segments_json_url}")
        gcp_bucket = bucket_name

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
        # Upload Task json file in GCS storage folder and set transcript_url
        bucket = gcs_client.bucket(gcp_bucket)
        new_transcipt_blob = bucket.blob(tasks_url)
        new_transcipt_blob.upload_from_filename(tasks_file_path)
        # Delete temporary files
        os.remove(transcript_url_path)
        os.remove(tasks_file_path)
        tasks_url = f"gs://{bucket_name}/{tasks_url}"
        
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
