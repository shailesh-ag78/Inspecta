from langgraph.func import entrypoint, task
from typing import Dict, Any, List, Optional
import requests
import os

# Configuration for Agent URLs
AUDIO_EXTRACTOR_URL = os.getenv("AUDIO_EXTRACTOR_URL", "http://localhost:8000")
TRANSCRIPTION_AGENT_URL = os.getenv("TRANSCRIPTION_AGENT_URL", "http://localhost:8001")

@task
def call_audio_extractor(file_path: str, filename: str) -> str:
    """
    Calls the AudioExtractorAgent to extract audio or transcribe directly.
    In this specific architecture, AudioExtractorAgent seems to have a /transcribeAudio endpoint
    which returns text (simple transcription) or we might just use it to get audio.
    
    Based on exploration:
    AudioExtractorAgent has /extract_audio that returns PlainTextResponse.
    """
    url = f"{AUDIO_EXTRACTOR_URL}/extract_audio"
    
    # We need to send the file.
    # Note: In a real cloud env, we might pass a URL or S3 path.
    # Here we are simulating passing the file by re-uploading it from local temp.
    
    if not os.path.exists(file_path):
        return f"Error: File {file_path} not found."
        
    try:
        with open(file_path, "rb") as f:
            files = {"file": (filename, f, "application/octet-stream")}
            response = requests.post(url, files=files)
            
        if response.status_code == 200:
            return response.text
        else:
            return f"Error {response.status_code}: {response.text}"
    except Exception as e:
        return f"Exception calling AudioExtractor: {str(e)}"

@task
def call_transcription_agent(file_path: str, filename: str, task_type: str = "transcribe") -> Dict[str, Any]:
    """
    Calls the TranscriptionAgent to transcribe or translate.
    Endpoints: /transcribe_incidents or /translate_incidents
    """
    endpoint = "transcribe_incidents" if task_type == "transcribe" else "translate_incidents"
    url = f"{TRANSCRIPTION_AGENT_URL}/{endpoint}"
    
    if not os.path.exists(file_path):
        return {"error": f"File {file_path} not found."}
        
    try:
        with open(file_path, "rb") as f:
            # The API expects a list of files
            files = [("files", (filename, f, "application/octet-stream"))]
            response = requests.post(url, files=files)
            
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"Error {response.status_code}: {response.text}"}
    except Exception as e:
        return {"error": f"Exception calling TranscriptionAgent: {str(e)}"}

@entrypoint()
def workflow(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Orchestration logic.
    Inputs:
      - file_path: str
      - filename: str
      - task_type: str (transcribe, translate, extract_audio)
    """
    file_path = inputs.get("file_path")
    filename = inputs.get("filename")
    task_type = inputs.get("task_type", "transcribe")
    
    results = {}
    
    # Routing Logic
    # If task is 'simple_transcribe' (maybe audio extractor does this?), use AudioExtractor
    # If task is 'incident_transcribe' or 'translate', use TranscriptionAgent
    
    # Validating task type against available agents
    
    if task_type == "simple_transcribe":
        # call_audio_extractor returns a Future-like object (Task) in LangGraph functional? 
        # Actually with @task, it returns a value when awaited or resolved by the graph runner.
        # In the functional API, we call it like a function.
        extractor_result = call_audio_extractor(file_path, filename).result()
        results["simple_transcription"] = extractor_result
        
    elif task_type in ["transcribe", "translate"]:
        transcription_result = call_transcription_agent(file_path, filename, task_type).result()
        results["incident_data"] = transcription_result
    
    else:
        results["error"] = f"Unknown task_type: {task_type}"
        
    return results
