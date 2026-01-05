from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse
from groq_service import GroqService
import uvicorn
import shutil
import os
import uuid
from typing import List

app = FastAPI()

# Initialize Groq Service
# Note: Ideally API Key should be injected securely. Code relies on env var or internal handling.
groq_service = GroqService()

TEMP_DIR = r"D:\code\Inspecta\TranscriptionAgent\temp_uploads"
if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

async def _process_files(files: List[UploadFile], task_type: str):
    """
    Helper to process list of files for a specific task type.
    """
    final_output = {"incidents": []}

    try:
        for file in files:
            # 1. Save uploaded file to temp
            file_ext = os.path.splitext(file.filename)[1]
            temp_filename = f"{uuid.uuid4()}{file_ext}" # Use UUID to avoid collisions
            temp_file_path = os.path.join(TEMP_DIR, temp_filename)
            
            try:
                with open(temp_file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                
                # 2. Process incident via GroqService
                # We pass the original filename for metadata, but use temp_file_path for reading
                incident_data = groq_service.process_incident(temp_file_path, task_type)
                
                final_output["incidents"].append({
                    "file_name": file.filename,
                    "verbose_json": incident_data
                })

            finally:
                # Cleanup per file
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)

        return final_output

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/transcribe_incidents", response_class=JSONResponse)
async def transcribe_incidents(files: List[UploadFile] = File(...)):
    """
    Transcribes audio files as-is (English with mixed Hindi/Marathi).
    """
    return await _process_files(files, task_type="transcribe")

@app.post("/translate_incidents", response_class=JSONResponse)
async def translate_incidents(files: List[UploadFile] = File(...)):
    """
    Translates audio files into professional English.
    """
    return await _process_files(files, task_type="translate")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
