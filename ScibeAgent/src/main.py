from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import PlainTextResponse
from scribe_agent import ScribeAgent
from audio_utils import extract_audio
import uvicorn
import shutil
import os
import uuid

app = FastAPI()
agent = ScribeAgent()
REMOVE_AUDIO = False
TEMP_DIR = r"D:\code\Inspecta\ScibeAgent\temp_uploads"
if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

@app.post("/transcribe", response_class=PlainTextResponse)
async def transcribe(file: UploadFile = File(...)):
    try:
        # Save upload to temp file
        file_ext = os.path.splitext(file.filename)[1]
        #temp_filename = f"{uuid.uuid4()}{ile_ext}"
        temp_filename = os.path.basename(file.filename)
        temp_file_path = os.path.join(TEMP_DIR, temp_filename)
        
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        processing_file_path = temp_file_path
        
        # Check if video (simple extension check)
        video_extensions = ['.mp4', '.mov', '.avi', '.mkv']
        if file_ext.lower() in video_extensions:
            # Extract audio
            try:
                audio_path = extract_audio(temp_file_path)
                processing_file_path = audio_path # Use the extracted audio for transcription
            except Exception as e:
                # Cleanup and raise
                if (os.path.exists(temp_file_path) &  REMOVE_AUDIO):
                    os.remove(temp_file_path)
                raise HTTPException(status_code=500, detail=f"Audio extraction failed: {str(e)}")

        # Transcribe
        try:
            with open(processing_file_path, "rb") as f:
                result = agent.transcribe_audio(f, os.path.basename(processing_file_path))
        finally:
            # Cleanup temp files
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            if processing_file_path != temp_file_path and os.path.exists(processing_file_path):
                os.remove(processing_file_path)

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
