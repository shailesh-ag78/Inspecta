from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from workflow import workflow
import uvicorn
import shutil
import os
import uuid

app = FastAPI()

TEMP_DIR = r"D:\code\Inspecta\Executor\temp_uploads"
if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

@app.post("/execute")
async def execute(
    file: UploadFile = File(...),
    task_type: str = Form("transcribe") # Default to transcribe
):
    try:
        # 1. Save file to temp
        original_filename = file.filename
        file_ext = os.path.splitext(original_filename)[1]
        temp_filename = f"{uuid.uuid4()}{file_ext}"
        temp_file_path = os.path.join(TEMP_DIR, temp_filename)
        
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 2. Invoke LangGraph Workflow
        # The workflow entrypoint is a CompiledGraph (Runnable).
        # We invoke it with the input dictionary.
        
        input_data = {
            "file_path": temp_file_path,
            "filename": original_filename,
            "task_type": task_type
        }
        
        # invoke() is the standard method for LangGraph runnables
        result = workflow.invoke(input_data)
        
        # 3. Cleanup
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            
        return JSONResponse(content=result)

    except Exception as e:
        # Cleanup on error
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
