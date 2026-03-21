import json
import os
import subprocess
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import asynccontextmanager
from pydantic import BaseModel
import uvicorn
from typing import List, Optional, Dict, Any
from pathlib import Path
from google.cloud import storage
import logging

from .groq_service import GroqService

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filename='.\\audio_extarctor.log',
)
logger = logging.getLogger(__name__)

INSPCTA_FILE_BUCKET = "inspecta-file-bucket"
UPLOADS_FOLDER = "uploads"

# Set this in your environment or .env file: ENV_MODE=local
ENV_MODE = os.getenv("ENV_MODE", "local")
logger.info(f"🚀 Starting Executor with ENV_MODE={ENV_MODE}")

# Define your local root (where files actually live on your PC)
LOCAL_STORAGE_ROOT = os.path.abspath(os.getenv("LOCAL_STORAGE_ROOT", r"d:\code\Inspecta\Data"))
LOCAL_TEMP_FOLDER = os.path.join(LOCAL_STORAGE_ROOT, "temp")
if not os.path.exists(LOCAL_TEMP_FOLDER):
    os.makedirs(LOCAL_TEMP_FOLDER)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    logger.info("🔧 Initializing resources...")
    
    # Initialize GCS client if in non-local mode
    print(f"ENV_MODE: {ENV_MODE}")
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

        #full_gcp_path = f"gs://{INSPCTA_FILE_BUCKET}/{company_storage_id}/UPLOADS_FOLDER/{filename}"    
        blob_name = audio_url.replace(f"gs://{INSPCTA_FILE_BUCKET}/", "")
        bucket = gcs_client.bucket(INSPCTA_FILE_BUCKET)
        blob = bucket.get_blob(blob_name)   # blob = {company_storage_id}/UPLOADS_FOLDER/{filename}"
        if not blob:
            raise HTTPException(status_code=400, detail=f"Audio file not found at: {audio_url}")

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
    #input_prompt = "This is a farm video. Inspcting farming scenarios."
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

    # # 4. Return Result
    if(ENV_MODE != "local"):
        # Upload Transcript file in GCS storage folder and set transcibe_url
        bucket = gcs_client.bucket(INSPCTA_FILE_BUCKET)
        new_transcibe_blob = bucket.blob(transcibe_url)
        new_transcibe_blob.upload_from_filename(transcibe_file_path)
        # Delete temporary files
        os.remove(audio_url_path)
        os.remove(transcibe_file_path)
        
    return {
        "status": "success",
        "transcript": transcript_text,
        "segments_json_url": transcibe_url,
        "metadata": { # Additional information to be returned if any
            "ENV_MODE" : ENV_MODE
        }
    }
    
def transcript_extraction(audio_url_path, transcibe_file_path, metadata: dict) -> str:
    """ Transcript the Audio file using Groq Service and save the transcript to disk """

    try:
        # process_incident handles chunking and merging
        # --- PROMPT LOGIC ---
        # System Prompt: Generated from Company Context
        system_prompt = (
            f"You are a transcription assistant for Company : {metadata['company_name']}, "
            f"A company specializing in the filed of {metadata['industry']}. "
            f"Maintain industry-specific terminology and formal tone."
            f"Audio will be mostly in English but it can have some Hindi or Marathi words. Audio may contain technical terms related to {metadata['industry']} inspections. Please transcribe exactly as spoken."
            f"There could be some background noise as well. Accurately transcribe all spoken words, including technical terms, site-specific jargon, and any Hindi or Marathi phrases without translation. "
        )
        
        # industry_terms = "pipeline, crack, plastering, site safety, shuttering, RCC" # Add your actual terms
        # system_prompt = (
        #     f"Inspection report for {metadata['company_name']} in {metadata['industry']}. "
        #     f"Terminology: {industry_terms}. "
        #     f"हा एक साइट इन्स्पेक्शन रिपोर्ट आहे. (This is a site inspection report). "
        # )

        # User Prompt: Generated from Incident Metadata
        user_prompt = (
            f"हा एक साइट इन्स्पेक्शन रिपोर्ट आहे. (This is a site inspection report). "
            f"इसमें English, Hindi और Marathi का उपयोग किया गया है. The output should be strictly in English language. " + metadata['input_prompt']
        )
        prompt=f"{system_prompt}\n\n{user_prompt}"
        
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
