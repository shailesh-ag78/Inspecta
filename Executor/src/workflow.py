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
    Calls the AudioExtractorAgent to extract audio 
    """
    url = f"{AUDIO_EXTRACTOR_URL}/extract_audio"
    
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
      - org_filename: str
      - task_type: str (transcribe, translate, extract_audio)
    """
    file_path = inputs.get("file_path")
    org_filename = inputs.get("org_filename")
    task_type = inputs.get("task_type", "transcribe")
    
    results = {}
    
    # Routing Logic
    # If task is 'extract_audio', use AudioExtractor
    # If task is 'transcribe' or 'translate', extract Audio and then use TranscriptionAgent
    
    # Validating task type against available agents
    
    if task_type.lower() in ["extract_audio", "transcribe", "translate"]:
        # call_audio_extractor to extract audio.
        extractor_result = call_audio_extractor(file_path, filename)
        results["extracted_audio"] = extractor_result
        # if task_type.lower() == "transcribe":
        #     # call_audio_extractor to extract audio.
        #     # call_transcription_agent to transcribe audio.
        #     # Actually with @task, it returns a value when awaited or resolved by the graph runner.
        #     # In the functional API, we call it like a function.
        #     transcription_result = call_transcription_agent(file_path, filename, task_type)
        #     results["transcription_result"] = transcription_result
        # elif task_type.lower() == "translate":
        #     transcription_result = call_transcription_agent(file_path, filename, task_type)
        #     #results["incident_data"] = transcription_result
    else:
        results["error"] = f"Unknown task_type: {task_type}"
        
    return results
