import asyncio
import os
import sys
import pytest
from fastapi.testclient import TestClient
from main import app
#from database import IncidentRepository

# 1. Configuration Constants
# Ensure these match your actual local setup
#DB_DSN = os.getenv("DATABASE_URL", "dbname=inspecta_local user=postgres password=passwd host=localhost port=5432")
#DB_DSN = os.getenv("DATABASE_URL", "postgresql://postgres:passwd@localhost:5432/inspecta_local")
#TEST_VIDEO_PATH = r"D:\code\Inspecta\Data\test_data\Farm_Video1.mp4"
TEST_VIDEO_PATH = r"D:\code\Inspecta\Data\test_data\SampleVideoFile1.mp4"
COMPANY_ID = "1"
STORAGE_ID = "CompanyStorage1"

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
        resp_insp = client.post("/inspections", json=inspection_payload, headers=headers)
        
        # assert resp_insp.status_code == 200, f"Failed to create inspection: {resp_insp.text}"
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

        # Ensure the test file actually exists at the source
        if not os.path.exists(TEST_VIDEO_PATH):
            pytest.fail(f"Test video missing at {TEST_VIDEO_PATH}")

        # In a real scenario, the UI would upload the file to 'real_upload_path'.
        # For this test, we manually copy it to simulate a successful upload.
        import shutil
        shutil.copy(TEST_VIDEO_PATH, real_upload_path)
        print("✅ Simulated file upload to local storage.")

        print("\n--- [STEP 3] Trigger Real Incident Upload & LangGraph ---")
        incident_payload = {
            "inspector_id": 1,
            "file_url": real_upload_path,
            "site_id": 1
        }
        resp_inc = client.post(
            f"/inspections/{inspection_id}/upload-incident", 
            json=incident_payload, 
            headers=headers
        )
        
        assert resp_inc.status_code == 200, f"Failed to upload incident: {resp_inc.text}"
        incident_id = resp_inc.json()["incident_id"]
        print(f"✅ Incident Created: {incident_id}. LangGraph thread started")

        print("\n--- [STEP 4] Poll Status (Wait for Processing) ---")
        # Since LangGraph runs in a background task, we poll the status
        import time
        max_attempts = 10
        finished = False
        
        for i in range(max_attempts):
            time.sleep(2) # Give nodes time to process
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