import asyncio
import os
import sys
from fastapi.testclient import TestClient
from main import app
from pathlib import Path
import shutil
#from database import IncidentRepository

# 1. Configuration Constants
# Ensure these match your actual local setup
#DB_DSN = os.getenv("DATABASE_URL", "dbname=inspecta_local user=postgres password=passwd host=localhost port=5432")
#DB_DSN = os.getenv("DATABASE_URL", "postgresql://postgres:passwd@localhost:5432/inspecta_local")
#TEST_VIDEO_PATH = r"D:\code\Inspecta\Data\test_data\Farm_Video1.mp4"
TEST_VIDEO_PATH = r"D:\code\Inspecta\Data\test_data\Astitva Interior Videos"

COMPANY_ID = "4"
STORAGE_ID = "CompanyStorage4"
INSPECTOR_ID = "2"
SITE_ID = "3"

def test_full_workflow_integration():
    """
    Integration test using the REAL WorkflowExecutor and REAL Database.
    No mocks are used here.
    """
    # Use the TestClient to hit the real FastAPI routes
    with TestClient(app) as client:
        # Headers required for local auth bypass in main.py
        headers = {
            "X-Company-Id": COMPANY_ID, 
            "X-Storage-Id": STORAGE_ID
            #"Content-Type": "video/mp4"
        }

        # print("\n--- [STEP 1] Create Real Inspection ---")
        inspection_payload = {"site_id": 1, "inspector_id": 1}
        
        p = Path(TEST_VIDEO_PATH)

        # Use rglob("*") to recursively find all files and directories
        # and filter for only files using .is_file()
        video_files = [str(f.resolve()) for f in Path(TEST_VIDEO_PATH).glob('*.mp4')]
        incident_ids = []
        for file_path in video_files:
            print(f"\n--- Processing file: {file_path} ---")
            
            resp_insp = client.post("/inspections", json=inspection_payload, headers=headers)
            assert resp_insp.status_code == 200, f"Failed to create inspection: {resp_insp.text}"
            inspection_id = resp_insp.json()["inspection_id"]
            print(f"✅ Created Inspection: {inspection_id}")
            # Temporarily hardcoding an existing inspection ID for testing, since creating a new one may have side effects or require cleanup
            #inspection_id = "27822a7e-d0de-42b1-9316-ee82e359939a"
        
            print("\n--- [STEP 2] Get Real Upload URL ---")
            request_headers = headers.copy()
            request_headers["Content-Type"] = "video/mp4"  # Ensure content type is set for JSON responses
            resp_url = client.get("/get-upload-url", headers=request_headers)
            assert resp_url.status_code == 200
            upload_data = resp_url.json()
            real_upload_path = upload_data["upload_url"]
            print(f"✅ Received Upload Path: {real_upload_path}")
        
            # In a real scenario, the UI would upload the file to 'real_upload_path'.
            # For this test, we manually copy it to simulate a successful upload.    
            shutil.copy(file_path, real_upload_path)
            print("✅ Simulated file upload to local storage.")


            print("\n--- [STEP 3] Trigger Real Incident Upload & LangGraph ---")
            incident_payload = {
                "inspector_id": INSPECTOR_ID,
                "file_url": real_upload_path,
                "site_id": SITE_ID
            }
            resp_inc = client.post(
                f"/inspections/{inspection_id}/upload-incident", 
                json=incident_payload, 
                headers=headers
            )
            assert resp_inc.status_code == 200, f"Failed to upload incident: {resp_inc.text}"
            incident_id = resp_inc.json()["incident_id"]
            print(f"✅ Incident Created: {incident_id}. LangGraph thread started")

            incident_ids.append(incident_id)
            
        print(f"Found {len(incident_ids)} incidents:")
        for incident_id in incident_ids:
            print(f"\n--- Poll Status for {incident_id} (Wait for Processing) ---")
            # Since LangGraph runs in a background task, we poll the status
            import time
            max_attempts = 15
            finished = False
            for i in range(max_attempts):
                time.sleep(3) # Give nodes time to process
                resp_status = client.get(f"/incidents/{incident_id}/status", headers=headers)
                status_data = resp_status.json()
                
                print(f"Attempt {i+1}: Status = {status_data['status']} - {status_data['display_message']}")
                
                if status_data["is_finished"]:
                    finished = True
                    break
        
            assert finished, "Workflow did not complete within the timeout period."
            print("✅ End-to-End Workflow Successful!")

if __name__ == "__main__":
    # Note: Using pytest to run this is recommended, but you can call it directly
    # Force SelectorEventLoop for Windows compatibility
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    try:
        test_full_workflow_integration()
    except Exception as e:
        print(f"❌ Integration Test Failed: {e}")
        
        #can you give me a powershell script that starts all agents and executor in different terminals. Then I will just execute 