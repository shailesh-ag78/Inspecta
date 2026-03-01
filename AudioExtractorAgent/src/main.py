import sys
import os
import subprocess
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import asynccontextmanager
from pydantic import BaseModel
import uvicorn
from typing import Optional, Dict, Any
from pathlib import Path
import logging

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

class AudioExtractionRequest(BaseModel):
    video_url: str
    metadata: Optional[Dict[str, Any]] = None # company_name, industry_type, timestamp, etc.

@app.post("/extract_audio")
async def extract_audio_endpoint(request: AudioExtractionRequest):
    """
    Extracts audio from the video_url.
    Saves audio to disk at a specific location.
    Returns the location of audio_url.
    """
    video_url = request.video_url
    metadata = request.metadata

    logger.info(f"Received request to extract audio via POST.")

    # 1. Validation
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url is required")

    logger.info(f"Video URL: {video_url}")
    logger.info(f"Metadata: {metadata}")
    
    # Check if video_url is a local file and exists
    if(ENV_MODE == "local"):
        if not os.path.exists(video_url):
            raise HTTPException(status_code=400, detail=f"Video file not found at: {video_url}")
        
        p = Path(video_url)
        #audio_filename = f"{p.stem}_audio.mp3"
        audio_url_path = str(p.with_name(f"{p.stem}_audio.mp3"))
        video_url_path = video_url
    else:
        # Check if file is available on GCS
        # File name example : "gs://inspecta-file-bucket/<company_storage>/uploads/a1b2-c3d4.mp4"
        if not gcs_client:
             raise HTTPException(status_code=500, detail="GCS client not initialized")

        #full_gcp_path = f"gs://{INSPCTA_FILE_BUCKET}/{company_storage_id}/UPLOADS_FOLDER/{filename}"    
        blob_name = video_url.replace(f"gs://{INSPCTA_FILE_BUCKET}/", "")
        bucket = gcs_client.bucket(INSPCTA_FILE_BUCKET)
        blob = bucket.get_blob(blob_name)   # blob = {company_storage_id}/UPLOADS_FOLDER/{filename}"
        if not blob:
            raise HTTPException(status_code=400, detail=f"Video file not found at: {video_url}")

        filename = blob_name.rsplit("/", 1)[-1]
        name_without_ext = filename.rsplit(".", 1)[0]  # Handle multiple dots correctly (e.g., "video.v1_audio.mp3")
        audio_filename = f"{name_without_ext}_audio.mp3"
        audio_url_path = os.path.join(LOCAL_TEMP_FOLDER, audio_filename)
        audio_url = blob_name.rsplit("/", 1)[0] + "/" + audio_filename
            
        # Downloading Video file locally
        temp_video_file_name = "temp_" + Path(blob_name).name
        video_url_path = os.path.join(LOCAL_TEMP_FOLDER, temp_video_file_name)
        logger.info(f"Downloading {video_url} to {video_url_path}...")
        blob.download_to_filename(video_url_path)
        
    # 3. Extract Audio
    try:
        logger.info(f"Extracting audio from {video_url} to {audio_url_path}")
        audio_extraction(video_url_path, audio_url_path)
    except Exception as e:
        print(f"Extraction Error: {e}")
        raise HTTPException(status_code=500, detail=f"Audio extraction failed: {str(e)}")

    # 4. Return Result
    audio_url = audio_url_path
    if(ENV_MODE != "local"):
        # Upload Audio file in GCS storage folder and set audio_url
        bucket = gcs_client.bucket(INSPCTA_FILE_BUCKET)
        new_audio_blob = bucket.blob(audio_url)
        new_audio_blob.upload_from_filename(audio_url_path)
        # Delete temporary files
        os.remove(video_url_path)
        os.remove(audio_url_path)
    
    return {
        "status": "success",
        "audio_url": audio_url,
        "metadata": { # Additional information to be returned if any
            "ENV_MODE" : ENV_MODE
        }
    }

def audio_extraction(video_url_path: str, audio_url_path: str):
    """
    Extracts high-quality mono audio from video.
    Ready for single-file transcription.
    """
    try:
        # Run ffmpeg command
        # We use mono (ac 1) and 16kHz (ar 16000) for best AI recognition
        subprocess.run([
            "ffmpeg", "-y", "-i", video_url_path,
            "-vn", "-ac", "1", "-ar", "16000", 
            "-acodec", "pcm_s16le", audio_url_path
        ], check=True, capture_output=True)
        
    except subprocess.CalledProcessError as e:
        error_message = e.stderr.decode() if e.stderr else str(e)
        raise RuntimeError(f"ffmpeg failed: {error_message}")
    
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
