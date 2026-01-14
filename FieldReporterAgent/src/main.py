import sys
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from typing import List

# --- Path Setup for Database ---
# Assuming DataStore is at d:\code\Inspecta\DataStore relative to current setup
DB_PATH = r"d:\code\Inspecta\DataStore"
if DB_PATH not in sys.path:
    sys.path.append(DB_PATH)

try:
    from database import IncidentRepository
except ImportError:
    print(f"Error: Could not import database from {DB_PATH}. Ensure the path is correct.")
    sys.exit(1)

from openai_service import OpenAIService

# --- Configuration ---
DB_DSN = "dbname=inspection_platform user=dev_user password=dev_password host=localhost port=5432"
DATA_DIR = r"d:\code\Inspecta\Data"

app = FastAPI()
openai_service = OpenAIService()
repo = IncidentRepository(DB_DSN)

class GenerateTasksRequest(BaseModel):
    incident_id: str
    company_id: int

@app.post("/generate_tasks")
async def generate_tasks_endpoint(request: GenerateTasksRequest):
    """
    Generates actionable tasks from the incident transcript (stored on disk)
    and stores them in the database.
    """
    print(f"Generating tasks for incident: {request.incident_id}, company: {request.company_id}")
    
    # 1. Fetch incident details (to get inspection_id)
    try:
        incident = repo.get_incident(request.company_id, request.incident_id)
        if not incident:
             raise HTTPException(status_code=404, detail="Incident not found")
        
        inspection_id = incident.get('inspection_id')
    except Exception as e:
        print(f"DB Fetch Error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    # 2. Read Transcript from Disk
    transcript_path = os.path.join(DATA_DIR, f"{request.incident_id}.txt")
    if not os.path.exists(transcript_path):
        raise HTTPException(status_code=400, detail=f"Transcript file not found at: {transcript_path}")

    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read transcript file: {str(e)}")

    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript file is empty.")

    # 3. Generate Tasks via OpenAI
    try:
        tasks = openai_service.generate_tasks_from_transcript(transcript)
        print(f"Generated {len(tasks)} tasks.")
    except Exception as e:
        print(f"OpenAI Error: {e}")
        raise HTTPException(status_code=500, detail=f"Task generation failed: {str(e)}")

    # 4. Store Tasks in DB
    if not tasks:
        return {"status": "success", "message": "No tasks generated.", "task_count": 0}

    try:
        repo.bulk_add_incident_tasks(request.company_id, request.incident_id, inspection_id, tasks)
        
    except Exception as e:
        print(f"DB Insert Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to store tasks: {str(e)}")

    return {
        "status": "success",
        "incident_id": request.incident_id,
        "task_count": len(tasks),
        "tasks_preview": [t.get('task_title') for t in tasks[:3]]
    }

if __name__ == "__main__":
    # Using port 8002 for FieldReporterAgent (assuming 8000=AudioExtractor/Scribe, 8001=Transcription)
    uvicorn.run(app, host="0.0.0.0", port=8002)
