import sys
import os
import subprocess
import uuid
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from typing import Optional, Dict, Any
from pathlib import Path
from google.cloud import storage

from audio_utils import extract_audio

# Initialize GCS client
# Ensure GOOGLE_APPLICATION_CREDENTIALS is set in environment
try:
    storage_client = storage.Client()
except Exception as e:
    print(f"Warning: Could not initialize GCS client: {e}")
    storage_client = None

# Set this in your environment or .env file: ENV_MODE=local
ENV_MODE = "local" # os.getenv("ENV_MODE", "local")
# Define your local root (where files actually live on your PC)
LOCAL_STORAGE_ROOT = os.path.abspath(r"d:\code\Inspecta\Data")
LOCAL_TEMP_FOLDER = os.path.join(LOCAL_STORAGE_ROOT, "temp")
if not os.path.exists(LOCAL_TEMP_FOLDER):
    os.makedirs(LOCAL_TEMP_FOLDER)

INSPCTA_FILE_BUCKET = "inspecta-file-bucket"
UPLOADS_FOLDER = "uploads"

app = FastAPI()

class AudioExtractionRequest(BaseModel):
    video_url: str
    metadata: Dict[str, Any] # company_name, industry_type, timestamp, etc.

@app.post("/extract_audio")
async def extract_audio_endpoint(request: AudioExtractionRequest):
    """
    Extracts audio from the video_url.
    Saves audio to disk at a specific location.
    Returns the location of audio_url.
    """
    video_url = request.video_url
    metadata = request.metadata

    print(f"Received request to extract audio via POST.")
    print(f"Video URL: {video_url}")
    print(f"Metadata: {metadata}")

    # 1. Validation
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url is required")
    
    # Check if video_url is a local file and exists
    audio_filename = f"{uuid.uuid4().hex[:8]}.mp3"
    if(ENV_MODE == "local"):
        if not os.path.exists(video_url):
            raise HTTPException(status_code=400, detail=f"Video file not found at: {video_url}")
        folder_path = Path(video_url).parent
        video_url_path = video_url
        audio_url_path = os.path.join(folder_path, audio_filename)
    else:
        # Check if file is available on GCS
        if not storage_client:
             raise HTTPException(status_code=500, detail="GCS client not initialized")

        #full_gcp_path = f"gs://{INSPCTA_FILE_BUCKET}/{company_storage_id}/UPLOADS_FOLDER/{filename}"    
        blob_name = video_url.replace(f"gs://{INSPCTA_FILE_BUCKET}/", "")
        bucket = storage_client.bucket(INSPCTA_FILE_BUCKET)
        blob = bucket.get_blob(blob_name)
        if not blob:
            raise HTTPException(status_code=400, detail=f"Video file not found at: {video_url}")
        # Downloading Video file locally
        video_file_name = "temp_" + Path(blob_name).name
        video_url_path = os.path.join(LOCAL_TEMP_FOLDER, video_file_name)
        print(f"Downloading {video_url} to {video_url_path}...")
        blob.download_to_filename(video_url_path)
        audio_url_path = os.path.join(LOCAL_TEMP_FOLDER, audio_filename)
        
    # 3. Extract Audio
    try:
        print(f"Extracting audio from {video_url} to {audio_url_path}")
        audio_extraction(video_url_path, audio_url_path)
    except Exception as e:
        print(f"Extraction Error: {e}")
        raise HTTPException(status_code=500, detail=f"Audio extraction failed: {str(e)}")

    # 4. Return Result
    if(ENV_MODE != "local"):
        # Delete temporary video file
        os.remove(video_url_path)
    
    audio_url = audio_url_path
    # ToDo : Upload Audio file in GCS storage folder and set audio_url
    
    return {
        "status": "success",
        "audio_url": audio_url,
        "metadata": { # Additional information to be returned if any
            "ENV_MODE" : ENV_MODE
        }
    }

def audio_extraction(video_path: str, audio_path: str) -> str:
    """
    Extracts high-quality mono audio from video.
    Ready for single-file transcription.
    """
    # We use mono (ac 1) and 16kHz (ar 16000) for best AI recognition
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-ac", "1", "-ar", "16000", 
        "-acodec", "pcm_s16le", audio_path
    ], check=True, capture_output=True)
    
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
