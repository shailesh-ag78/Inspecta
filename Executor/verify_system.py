import sys
import os
import asyncio
from unittest.mock import MagicMock
import shutil
import importlib.util

# --- Path Setup ---
sys.path.append(r"d:\code\Inspecta\DataStore")
sys.path.append(r"d:\code\Inspecta\AudioExtractorAgent\src")
sys.path.append(r"d:\code\Inspecta\TranscriptionAgent\src")

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod

try:
    from database import IncidentRepository, Industry
    
    # Load Main Modules
    audio_main = load_module("audio_agent_main", r"d:\code\Inspecta\AudioExtractorAgent\src\main.py")
    extract_audio_endpoint = audio_main.extract_audio_endpoint
    ExtractAudioRequest = audio_main.ExtractAudioRequest

    trans_main = load_module("trans_agent_main", r"d:\code\Inspecta\TranscriptionAgent\src\main.py")
    generate_tasks_endpoint = trans_main.generate_tasks_endpoint
    GenerateTasksRequest = trans_main.GenerateTasksRequest
    
except ImportError as e:
    print(f"Import Error: {e}. Please ensure requirements are installed.")
    sys.exit(1)

# --- Mocking ---
print("Setting up Mocks...")

# Mock GroqClient
mock_groq = MagicMock()
mock_groq.transcribe.return_value = {"text": "Verified transcript: The panel is cracked. Please repair it."}
audio_main.groq_client = mock_groq

# Mock extract_audio
audio_main.extract_audio = MagicMock(return_value=r"d:\code\Inspecta\Data\verified_test.mp3")

# Mock OpenAIService
mock_openai = MagicMock()
mock_openai.generate_tasks_from_transcript.return_value = [
    {
        "task_title": "Repair Panel",
        "task_description": "The panel is cracked as per incident.",
        "task_original_description": "The panel is cracked.",
        "severity_id": 1,
        "status_id": 1,
        "task_type_id": 2
    }
]
trans_main.openai_service = mock_openai

# --- DB Setup ---
# --- DB Setup ---
DB_DSN = "dbname=inspection_platform user=dev_user password=dev_password host=localhost port=5432"
repo = IncidentRepository(DB_DSN)

async def verify():
    print("----------------------------------------------------------------")
    print("Starting Verification Workflow")
    print("----------------------------------------------------------------")

    # 1. Setup Data Paths
    data_dir = r"d:\code\Inspecta\Data"
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
    
    dummy_video_path = os.path.join(data_dir, "verify_video.mp4")
    with open(dummy_video_path, "w") as f:
        f.write("dummy content")

    # 2. Create Inspection & Incident
    print("\n[Step 1] Creating Test Inspection & Incident in DB...")
    try:
        # A. Create Inspection
        inspection_id = repo.create_inspection(company_id=1, site_id=1)
        print(f"✅ Inspection Created ID: {inspection_id}")

        # B. Create Incident
        incident_id = repo.create_incident(
            company_id=1,
            inspection_id=inspection_id,
            inspector_id=1, 
            site_id=1,
            video_url=dummy_video_path,
            gps_coordinates=(18.5204, 73.8567), # Pune
            metadata={"source": "verification_script"}
        )
        print(f"✅ Incident Created ID: {incident_id}")
    except Exception as e:
        print(f"❌ Failed to create inspection/incident: {e}")
        return

    # 3. Test AudioExtractor
    print("\n[Step 2] Testing AudioExtractorAgent...")
    try:
        req = ExtractAudioRequest(incident_id=str(incident_id), company_id=1)
        res = await extract_audio_endpoint(req)
        
        if res['status'] == 'success' and 'verified_test.mp3' in res['audio_url']:
             print("✅ Audio Extraction API succeed")
        else:
             print(f"❌ Unexpected API Response: {res}")
             
             
        with repo.session(1) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT metadata FROM incidents WHERE id=%s", (incident_id,))
                meta = cur.fetchone()[0]
                if meta.get('transcript') == "Verified transcript: The panel is cracked. Please repair it.":
                    print("✅ Database updated with Transcript")
                else:
                    print(f"❌ Transcript mismatch in DB: {meta}")

    except Exception as e:
        print(f"❌ AudioExtractor Failed: {e}")

    # 4. Test Transcription Agent
    print("\n[Step 3] Testing TranscriptionAgent...")
    try:
        req = GenerateTasksRequest(incident_id=str(incident_id), company_id=1)
        res = await generate_tasks_endpoint(req)
        
        if res['status'] == 'success' and res['task_count'] == 1:
            print("✅ Task Generation API succeed")
        else:
            print(f"❌ Unexpected API Response: {res}")
            
        tasks = repo.get_tasks_for_incident(1, str(incident_id))
        if len(tasks) == 1 and tasks[0]['task_title'] == "Repair Panel":
             print("✅ Task persisted in DB correctly")
        else:
             print(f"❌ Tasks in DB mismatch: {tasks}")

    except Exception as e:
        print(f"❌ TranscriptionAgent Failed: {e}")

    print("\n----------------------------------------------------------------")
    print("Verification Complete")
    print("----------------------------------------------------------------")

if __name__ == "__main__":
    asyncio.run(verify())
