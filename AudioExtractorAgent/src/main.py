import sys
import os
import uuid
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from typing import Optional, Dict, Any

from audio_utils import extract_audio

# --- Configuration ---
DATA_DIR = r"d:\code\Inspecta\Data"
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

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
    if not os.path.exists(video_url):
         # If it's a web URL, we might need different handling, but assuming local path based on context
         # If it is meant to be a remote URL to download, that logic isn't present in utils yet.
         # For now, we assume local path or mounted volume.
         raise HTTPException(status_code=400, detail=f"Video file not found at: {video_url}")

    # 2. Determine Output Path   
    video_filename = os.path.basename(video_url)
    base_name, _ = os.path.splitext(video_filename)
    audio_filename = f"{base_name}_{uuid.uuid4().hex[:8]}.mp3"
    audio_path = os.path.join(DATA_DIR, audio_filename)

    # 3. Extract Audio
    try:
        print(f"Extracting audio from {video_url} to {audio_path}")
        audio_extraction(video_url, audio_path)
    except Exception as e:
        print(f"Extraction Error: {e}")
        raise HTTPException(status_code=500, detail=f"Audio extraction failed: {str(e)}")

    # 4. Return Result
    return {
        "status": "success",
        "video_url": video_url,
        "audio_url": audio_path,
        "metadata_received": metadata
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
