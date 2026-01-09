import sys
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from typing import List

# --- Path Setup for Database ---
DB_PATH = r"d:\code\Inspecta\DataStore"
if DB_PATH not in sys.path:
    sys.path.append(DB_PATH)

try:
    from database import InspectionRepository
except ImportError:
    print(f"Error: Could not import database from {DB_PATH}. Ensure the path is correct.")
    sys.exit(1)

from openai_service import OpenAIService

# --- Configuration ---
DB_DSN = "dbname=inspection_platform user=dev_user password=dev_password host=localhost port=5432"

app = FastAPI()
openai_service = OpenAIService()
repo = InspectionRepository(DB_DSN)

class GenerateTasksRequest(BaseModel):
    inspection_id: str
    industry_id: int

@app.post("/generate_tasks")
async def generate_tasks_endpoint(request: GenerateTasksRequest):
    """
    Generates actionable tasks from the inspection transcript using OpenAI
    and stores them in the database.
    """
    print(f"Generating tasks for inspection: {request.inspection_id}, industry: {request.industry_id}")
    
    # 1. Fetch transcript from DB
    try:
        with repo.session(request.industry_id) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT metadata FROM inspections WHERE id = %s", 
                    (request.inspection_id,)
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Inspection not found")
                
                metadata = row['metadata'] or {}
                transcript = metadata.get('transcript')
                
                if not transcript:
                    raise HTTPException(status_code=400, detail="No transcript found for this inspection. Run AudioExtractorAgent first.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"DB Fetch Error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    # 2. Generate Tasks via OpenAI
    try:
        tasks = openai_service.generate_tasks_from_transcript(transcript)
        print(f"Generated {len(tasks)} tasks.")
    except Exception as e:
        print(f"OpenAI Error: {e}")
        raise HTTPException(status_code=500, detail=f"Task generation failed: {str(e)}")

    # 3. Store Tasks in DB
    if not tasks:
        return {"status": "success", "message": "No tasks generated.", "task_count": 0}

    try:
        # bulk_add_tasks expects inspection_id and list of dicts
        repo.bulk_add_tasks(request.industry_id, request.inspection_id, tasks)
    except Exception as e:
        print(f"DB Insert Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to store tasks: {str(e)}")

    return {
        "status": "success",
        "inspection_id": request.inspection_id,
        "task_count": len(tasks)
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
