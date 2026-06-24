# =======================  To Debug in VSCODE interactively : move to G:\code\Inspecta\Executor\src and Press F5   =======================
# =======================  If you want to use GCP then execute command : gcloud auth application-default login   =======================
# $env:GOOGLE_APPLICATION_CREDENTIALS="G:\code\Inspecta\deployment\inspecta-360-firebase-adminsdk-fbsvc-bd599894b5.json"
# gcloud storage buckets add-iam-policy-binding gs://inspecta-file-bucket --member="serviceAccount:firebase-adminsdk-fbsvc@inspecta-360.iam.gserviceaccount.com" --role="roles/storage.objectAdmin"
# ====================================================


from google.cloud import storage
import asyncio
import os
import sys

# Set up paths so we can import 'src' as a package. 
# This prevents "ImportError: attempted relative import with no known parent package" from main.py
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from src.main import app
from pathlib import Path
import shutil
from urllib.parse import urlparse
from typing import Tuple

# 1. Configuration Constants
# Ensure these match your actual local setup
#TEST_VIDEO_PATH = r"G:\code\Inspecta\Data\test_data\Farm_Video1.mp4"
TEST_VIDEO_PATH = r"G:\code\Inspecta\data\test_data\test_videos"

INSPCTA_FILE_BUCKET = "inspecta-file-bucket"
UPLOADS_FOLDER = "uploads"

COMPANY_ID = "1"
STORAGE_ID = "CompanyStorage1"
INSPECTOR_ID = "1"
SITE_ID = "1"
#INSPECTION_ID = ""
INSPECTION_ID = "95a1e321-08c1-4aac-a9f1-1ce4304109fd"
ENV_MODE = "production"

def extract_bucket_and_blob(http_url: str) -> Tuple[str, str]:
    """
    Parses a GCS HTTP URL and returns a tuple of (bucket_name, blob_name).
    Strips out all query parameters and signatures automatically.
    """
    # 1. Parse the URL to isolate the network path
    parsed_url = urlparse(http_url)
    
    # 2. Clean and split the path
    # Removes leading slash and splits only at the first slash
    path_parts = parsed_url.path.strip("/").split("/", 1)
    
    if len(path_parts) < 2:
        raise ValueError("Invalid GCS HTTP URL structure.")
        
    bucket_name = path_parts[0]
    blob_name = path_parts[1]
    
    return bucket_name, blob_name


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

        # print("\n------------------ [STEP 1] Create Real Inspection ------------------")
        if(not INSPECTION_ID):
            inspection_payload = {"site_id": SITE_ID, "inspector_id": INSPECTOR_ID}
            resp_insp = client.post("/inspections", json=inspection_payload, headers=headers)
            assert resp_insp.status_code == 200, f"Failed to create inspection: {resp_insp.text}"
            inspection_id = resp_insp.json()["inspection_id"]
            print(f"✅ Created Inspection: {inspection_id}")
        else:
            inspection_id = INSPECTION_ID
            print(f"✅ Using Existing Inspection: {inspection_id}")

        incident_ids = {}
        # Use rglob("*") to recursively find all files and directories
        # and filter for only files using .is_file()
        files_to_process = [str(f.resolve()) for f in Path(TEST_VIDEO_PATH).glob('*') if f.suffix.lower() in ['.mp4', '.mp3']]
        for file_path in files_to_process:
            print(f"\n--- Processing file: {file_path} ---")
        
            print("\n------------------ [STEP 2] Get Real Upload URL ------------------")
            request_headers = headers.copy()
            request_headers["Content-Type"] = "video/mp4"  # Ensure content type is set for JSON responses
            resp_url = client.get("/get-upload-url", headers=request_headers)
            assert resp_url.status_code == 200
            upload_data = resp_url.json()
            real_upload_path = upload_data["upload_url"]
            blob_name = upload_data["blob_name"]
            print(f"✅ Received Upload Path: {real_upload_path}")
        
            if(ENV_MODE == "local"):
                # In a real scenario, the UI would upload the file to 'real_upload_path'.
                # For this test, we manually copy it to simulate a successful upload.    
                shutil.copy(file_path, real_upload_path)
                print("✅ Simulated file upload to local storage.")
            else:
                # Upload to GCS
                gcs_client = storage.Client()
                bucket = gcs_client.bucket(INSPCTA_FILE_BUCKET)
                #blob = bucket.blob(f"{UPLOADS_FOLDER}/{blob_name}")
                blob = bucket.blob(blob_name)
                blob.upload_from_filename(file_path)
                print(f"✅ Uploaded to GCS: {file_path}")

            print("\n------------------ [STEP 3] Trigger Real Incident Upload & LangGraph ------------------")
            file_url_payload = f"gs://{INSPCTA_FILE_BUCKET}/{blob_name}" if ENV_MODE != "local" else real_upload_path
            incident_payload = {
                "inspector_id": INSPECTOR_ID,
                "file_url": file_url_payload
            }
            resp_inc = client.post(
                f"/inspections/{inspection_id}/upload-incident", 
                json=incident_payload, 
                headers=headers
            )
            assert resp_inc.status_code == 200, f"Failed to upload incident: {resp_inc.text}"
            incident_id = resp_inc.json()["incident_id"]
            print(f"✅ Incident Created: {incident_id}. LangGraph thread started")

            file_name = os.path.basename(file_path)
            incident_ids[file_name] = incident_id
            
        print(f"Found {len(incident_ids)} incidents:")
        for file_name, incident_id in incident_ids.items():
            print(f"\n------------------ Poll Status for {file_name} ({incident_id}) (Wait for Processing) ------------------")
            # Since LangGraph runs in a background task, we poll the status
            import time
            max_attempts = 15
            finished = False
            for i in range(max_attempts):
                time.sleep(4) # Give nodes time to process
                resp_status = client.get(f"/incidents/{incident_id}/status", headers=headers)
                status_data = resp_status.json()
                
                print(f"Attempt {i+1}: Status = {status_data['status']} - {status_data['display_message']}")
                
                if status_data["is_finished"]:
                    finished = True
                    break
        
            assert finished, f"Workflow for {file_name} did not complete within the timeout period."
            print(f"✅ End-to-End Workflow Successful for {file_name}!")

if __name__ == "__main__":
    # Note: Using pytest to run this is recommended, but you can call it directly
    # Force SelectorEventLoop for Windows compatibility
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    try:
        test_full_workflow_integration()
    except Exception as e:
        print(f"❌ Integration Test Failed: {e}")