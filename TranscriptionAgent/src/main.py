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

from groq_service import GroqService

# --- Configuration ---
DB_DSN = "dbname=inspection_platform user=dev_user password=dev_password host=localhost port=5432"
DATA_DIR = r"d:\code\Inspecta\Data"

app = FastAPI()
groq_service = GroqService()
repo = IncidentRepository(DB_DSN)

class TranscribeRequest(BaseModel):
    incident_id: str
    company_id: int

@app.post("/transcribe")
async def transcribe_endpoint(request: TranscribeRequest):
    """
    Transcribes the audio file associated with the incident.
    Reads from local disk, writes transcript to local disk.
    """
    print(f"Transcribing incident: {request.incident_id}, company: {request.company_id}")
    
    # 1. Locate Audio File
    # Convention: Data/<incident_id>.mp3
    audio_filename = f"{request.incident_id}.mp3"
    audio_path = os.path.join(DATA_DIR, audio_filename)
    
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=400, detail=f"Audio file not found at: {audio_path}")

    # 2. Transcribe via Groq
    try:
        # process_incident handles chunking and merging
        # Defaults to "transcribe" mode
        result = groq_service.process_incident(audio_path, task_type="transcribe")
        transcript_text = result.get("text", "")
        
        if not transcript_text:
             raise HTTPException(status_code=500, detail="Transcription resulted in empty text.")
             
        print(f"Transcription complete (Length: {len(transcript_text)} chars)")
        
    except Exception as e:
        print(f"Groq Error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    # 3. Save Transcript to Disk
    transcript_filename = f"{request.incident_id}.txt"
    transcript_path = os.path.join(DATA_DIR, transcript_filename)
    
    try:
        with open(transcript_path, "w", encoding="utf-8") as f:
            f.write(transcript_text)
        print(f"Saved transcript to {transcript_path}")
    except Exception as e:
         print(f"Disk Write Error: {e}")
         raise HTTPException(status_code=500, detail=f"Failed to save transcript: {str(e)}")

    return {
        "status": "success",
        "incident_id": request.incident_id,
        "transcript_path": transcript_path
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
