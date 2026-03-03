import os
import subprocess
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import asynccontextmanager
from pydantic import BaseModel
import uvicorn
from typing import Optional, Dict, Any
from pathlib import Path
from google.cloud import storage
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
class GenerateTasksRequest(BaseModel):
    transcript: str
    metadata: Optional[Dict[str, Any]] = None # company_name, industry_type, timestamp, etc.

@app.post("/generate_tasks")
async def generate_tasks_endpoint(request: GenerateTasksRequest):
    """
    Generates actionable tasks from the incident transcript store on storage lcoation
    """
    transcript = request.transcript
    metadata = request.metadata
    # 1. Validation
    if not transcript:
        raise HTTPException(status_code=400, detail="transcript is required")
    
    logger.info(f"Generating tasks for transcript: {transcript[:100]}...")
    op_tasks = []
    
    # 4. Store Tasks in DB
    if not op_tasks:
        return {"status": "success", "message": "No tasks generated.", "task_count": 0}

    return {
        "status": "success",
        "transcript": transcript,
        "tasks": op_tasks
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
