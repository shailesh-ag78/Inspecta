import json
import os
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import asynccontextmanager
from pydantic import BaseModel
import uvicorn
from typing import List, Optional, Dict, Any
from pathlib import Path
from google.cloud import storage
import logging
from typing import Tuple
from urllib.parse import urlparse
import dotenv

from .groq_service import GroqService

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
dotenv.load_dotenv(dotenv_path=env_path)

ENV_MODE = os.getenv("ENV_MODE", "local").lower()
logger.info(f"🚀 Starting Executor with ENV_MODE={ENV_MODE}")

# Define your local root (where files actually live on your PC)
# Detect operating system: use '/tmp' for Linux (GCP Cloud Run), and Windows path locally
LOCAL_STORAGE_ROOT = os.path.abspath(os.getenv("LOCAL_STORAGE_ROOT", r"g:\code\Inspecta\Data"))
LOCAL_TEMP_FOLDER = os.path.join(LOCAL_STORAGE_ROOT, "temp")
if not os.path.exists(LOCAL_TEMP_FOLDER):
    os.makedirs(LOCAL_TEMP_FOLDER)

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

groq_service = GroqService()

class TranscribeRequest(BaseModel):
    audio_url: str
    metadata: Optional[Dict[str, Any]] = None # company_name, industry_type, timestamp, etc.

@app.post("/transcribe")
async def transcribe_endpoint(request: TranscribeRequest):
    """
    Transcribes the audio file associated with the incident.
    Reads from storage, writes transcript to local disk.
    """
    audio_url = request.audio_url
    metadata = request.metadata
    # 1. Validation
    if not audio_url:
        raise HTTPException(status_code=400, detail="audio_url is required")
    
    logger.info(f"Transcribing audio_url: {audio_url}, metadata: {metadata}")
    
    gcp_bucket = ""
    if(ENV_MODE == "local"):
        if not os.path.exists(audio_url):
            raise HTTPException(status_code=400, detail=f"Audio file not found at: {audio_url}")
        
        p = Path(audio_url)
        transcibe_file_path = str(p.with_name(f"{p.stem}_transcribe.json"))
        transcibe_url = transcibe_file_path
        audio_url_path = audio_url
    else :
        # Check if file is available on GCS
        # File name example : "gs://inspecta-file-bucket/<company_storage>/uploads/a1b2-c3d4.mp4"
        if not gcs_client:
             raise HTTPException(status_code=500, detail="GCS client not initialized")

        bucket_name, blob_name = extract_bucket_and_blob_from_gs(audio_url)
        bucket = gcs_client.bucket(bucket_name)
        blob = bucket.get_blob(blob_name)   # blob = {company_storage_id}/UPLOADS_FOLDER/{filename}"
        if not blob:
            raise HTTPException(status_code=400, detail=f"Audio file not found at: {audio_url}")
        gcp_bucket = bucket_name    

        filename = blob_name.rsplit("/", 1)[-1]
        name_without_ext = filename.rsplit(".", 1)[0]  # Handle multiple dots correctly (e.g., "video.v1_audio.mp3")
        transcibe_filename = f"{name_without_ext}_transcribe.json"
        transcibe_file_path = os.path.join(LOCAL_TEMP_FOLDER, transcibe_filename)
        transcibe_url = blob_name.rsplit("/", 1)[0] + "/" + transcibe_filename
    
        # Downloading Audio file locally
        temp_audio_file_name = "temp_" + Path(blob_name).name
        audio_url_path = os.path.join(LOCAL_TEMP_FOLDER, temp_audio_file_name)
        logger.info(f"Downloading {audio_url} to {audio_url_path}...")
        blob.download_to_filename(audio_url_path)
        
    # 3. Extract Transcript
    input_metadata = {
        "company_name": metadata.get("company_name", "Unknown Company") if metadata else "",
        "industry": metadata.get("industry", "Unknown Industry") if metadata else "",
        "input_prompt": metadata.get("input_prompt", "") if metadata else "",
    }
    try:
        logger.info(f"Extracting transcript from {audio_url_path} to {transcibe_file_path}")
        transcript_text = transcript_extraction(audio_url_path, transcibe_file_path, input_metadata)
    except Exception as e:
        logger.error(f"Extraction Error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcript extraction failed: {str(e)}")

    # 4. Return Result
    if(ENV_MODE != "local"):
        # Upload Transcript file in GCS storage folder and set transcibe_url
        bucket = gcs_client.bucket(gcp_bucket)
        new_transcibe_blob = bucket.blob(transcibe_url)
        new_transcibe_blob.upload_from_filename(transcibe_file_path)
        # Delete temporary files
        os.remove(audio_url_path)
        os.remove(transcibe_file_path)
        transcibe_url = f"gs://{bucket_name}/{transcibe_url}"
        
    return {
        "status": "success",
        "transcript": transcript_text[:1000],
        "segments_json_url": transcibe_url,
        "metadata": { # Additional information to be returned if any
            "ENV_MODE" : ENV_MODE
        }
    }
    
def generate_whisper_prompt(metadata):
    #Whisper prompt as a "style guide" rather than a set of orders.

    # 1. Define the "Fixed" part of your prompt
    # We use roughly 400-500 characters as a safe buffer for the header/footer
    header = (
        f"Technical Site Inspection for {metadata['company_name']}. "
        f"Subject: {metadata['industry']} audit and assessment. "
    )
    
    footer = (
        "Observations: The inspector is recording real-time notes on site. "
        "All Hindi and Marathi comments are translated into professional technical English. "
        "Every observation, measurement, and actionable item is documented with precision. Transcription: "
    )

    # 2. Handle the Dynamic Keywords with Truncation
    ALLOWED_PROMPT_LENGTH = 790  # Adjust based on model limits and expected system prompt size
    available_space = ALLOWED_PROMPT_LENGTH - len(header) - len(footer) - 25 # 25 for the label
    
    # Truncate the input_prompt to fit the remaining space
    safe_keywords = metadata.get('input_prompt', '')[:available_space]
    
    # 3. Combine using f-string
    final_prompt = f"{header}Technical Vocabulary: {safe_keywords}. {footer}"
    
    return final_prompt

def transcript_extraction(audio_url_path, transcibe_file_path, metadata: dict) -> str:
    """ Transcript the Audio file using Groq Service and save the transcript to disk """

    try:   
        # process_incident handles chunking and merging
        # --- PROMPT LOGIC ---
        # System Prompt: Generated from Company Context
        # system_prompt = (
        #     f"Act like a transcription assistant for Company : {metadata['company_name']}, it is specialized in {metadata['industry']}. "
        #     f"Audio will be mostly in English but it can have some Hindi or Marathi words. Audio may contain technical terms related to {metadata['industry']} inspections. Please transcribe exactly as spoken."
        #     f"Accurately transcribe all spoken words, including industry-specific terminology, site-specific jargon, and any Hindi or Marathi phrases without translation."
        #     f"The output should be strictly in English language."
        #     f"There could be some background noise as well."
        # )
        # system_prompt = (
        #     f"Company : {metadata['company_name']}, it is specialized in {metadata['industry']}."
        #     f"Accurately transcribe all spoken words, including industry-specific terminology, site-specific jargon."
        #     f"Instructions:"
        #     f"Please transcribe exactly as spoken. Do not try to be very creative."
        #     f"Audio will be mostly in English but it can have some Hindi or Marathi words. In such case, trasncribe the sentence in English without changing the meaning."
        #     f"The output should be strictly in English language."
        #     f"There could be some background noise as well."
        # )
        # user_prompt = (
        #      f"{metadata['input_prompt']}"
        #  )        

        # original_prompt = f"{system_prompt}\n{user_prompt}"
        #ALLOWED_PROMPT_LENGTH = 790  # Adjust based on model limits and expected system prompt size
        # logger.info(f"Original Prompt and Length: {original_prompt} : {len(original_prompt)} chars. Using {ALLOWED_PROMPT_LENGTH} characters only")
        # max_user_len = ALLOWED_PROMPT_LENGTH - len(system_prompt) - 1 # 1 for newline separation
        # prompt = f"{system_prompt}\n{user_prompt[:max_user_len]}"

        prompt = generate_whisper_prompt(metadata)
        logger.info(f"Prompt Length: {len(prompt)} chars")

        transcript_dict = groq_service.process_incident_audio(audio_url_path, prompt)
        transcript_text = transcript_dict['text'] if isinstance(transcript_dict, dict) else ""
        if not transcript_text:
            logger.warning(f"Transcription resulted in empty text for {audio_url_path}")
        logger.info(f"Transcription complete (Length: {len(transcript_text)} chars) :  {transcript_text[:50]}...")  # Log first 50 chars for verification
        
        # Save Segment details in the file
        segments = transcript_dict['segments'] if isinstance(transcript_dict, dict) and 'segments' in transcript_dict else []    
        with open(transcibe_file_path, 'w', encoding='utf-8') as f:
            json.dump({
                "segments": segments
            }, f, indent=4, ensure_ascii=False)
        
        return transcript_text
    except Exception as e:
        logger.error(f"Groq Error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
