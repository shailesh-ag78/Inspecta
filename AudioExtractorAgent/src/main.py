import sys
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# --- Path Setup for Database ---
# Assuming DataStore is at d:\code\Inspecta\DataStore relative to current setup
# We append it to sys.path to import database.py
DB_PATH = r"d:\code\Inspecta\DataStore"
if DB_PATH not in sys.path:
    sys.path.append(DB_PATH)

try:
    from database import IncidentRepository
except ImportError:
    print(f"Error: Could not import database from {DB_PATH}. Ensure the path is correct.")
    sys.exit(1)

from audio_utils import extract_audio
from groq_client import GroqClient

# --- Configuration ---
DB_DSN = "dbname=inspection_platform user=dev_user password=dev_password host=localhost port=5432"

# DATA_DIR = r"d:\code\Inspecta\Data"
# if not os.path.exists(DATA_DIR):
#     os.makedirs(DATA_DIR)

app = FastAPI()
groq_client = GroqClient()
repo = IncidentRepository(DB_DSN)

class ExtractAudioRequest(BaseModel):
    incident_id: str
    company_id: int

@app.post("/extract_audio")
async def extract_audio_endpoint(request: ExtractAudioRequest):
    """
    Extracts audio from the video associated with the incident,
    transcribes it using Groq, and updates the database.
    """
    print(f"Processing incident: {request.incident_id} for company: {request.company_id}")
    
    # 1. Get incident details from DB
    try:
        incident = repo.get_incident(request.company_id, request.incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        
        video_url = incident.get('video_url')
        current_metadata = incident.get('metadata') or {}
    except Exception as e:
        print(f"DB Error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    if not video_url:
        raise HTTPException(status_code=400, detail="No video_url found for this incident")

    # 2. Determine paths
    if not os.path.exists(video_url):
         raise HTTPException(status_code=400, detail=f"Video file not found at: {video_url}")

    audio_filename = f"{request.incident_id}.mp3"
    audio_path = os.path.join(DATA_DIR, audio_filename)

    # 3. Extract Audio
    try:
        print(f"Extracting audio from {video_url} to {audio_path}")
        extract_audio(video_url, audio_path)
    except Exception as e:
        print(f"Extraction Error: {e}")
        raise HTTPException(status_code=500, detail=f"Audio extraction failed: {str(e)}")

    # 4. Transcribe
    try:
        print("Transcribing audio...")
        transcript_result = groq_client.transcribe(audio_path)
        transcript_text = transcript_result.get("text", "")
    except Exception as e:
        print(f"Transcription Error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    # 5. Update Database
    try:
        # Update metadata with transcript
        current_metadata['transcript'] = transcript_text
        repo.update_incident_audio(request.company_id, request.incident_id, audio_path, current_metadata)
    except Exception as e:
         print(f"DB Update Error: {e}")
         raise HTTPException(status_code=500, detail=f"Failed to update database: {str(e)}")

    return {
        "status": "success",
        "incident_id": request.incident_id,
        "audio_url": audio_path,
        "transcript_preview": transcript_text[:100] + "..." if transcript_text else ""
    }

# Fix missing Json import for step 5
from psycopg2.extras import Json

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
