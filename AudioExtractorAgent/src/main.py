import sys
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# --- Path Setup for Database ---
DB_PATH = r"d:\code\Inspecta\DataStore"
if DB_PATH not in sys.path:
    sys.path.append(DB_PATH)

try:
    from database import IncidentRepository
except ImportError:
    print(f"Error: Could not import database from {DB_PATH}. Ensure the path is correct.")
    sys.exit(1)

from audio_utils import extract_audio

# --- Configuration ---
DB_DSN = "dbname=inspection_platform user=dev_user password=dev_password host=localhost port=5432"

DATA_DIR = r"d:\code\Inspecta\Data"
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

app = FastAPI()
repo = IncidentRepository(DB_DSN)

class ExtractAudioRequest(BaseModel):
    incident_id: str
    company_id: int

@app.post("/extract_audio")
async def extract_audio_endpoint(request: ExtractAudioRequest):
    """
    Extracts audio from the video associated with the incident.
    Saves audio to disk and updates DB with relative path.
    """
    print(f"Processing incident: {request.incident_id} for company: {request.company_id}")
    
    # 1. Get incident details from DB
    try:
        incident = repo.get_incident(request.company_id, request.incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        
        video_url = incident.get('video_url')
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

    # 4. Update Database
    try:
        # User Requirement: The relative path (from Data folder) will be save in DB as Audio URL
        repo.update_incident_audio(request.company_id, request.incident_id, audio_filename)
    except Exception as e:
         print(f"DB Update Error: {e}")
         raise HTTPException(status_code=500, detail=f"Failed to update database: {str(e)}")

    return {
        "status": "success",
        "incident_id": request.incident_id,
        "audio_url": audio_filename
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
