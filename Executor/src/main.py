import os
import datetime
from fastapi import FastAPI, UploadFile, File, Form, Request, BackgroundTasks
from contextlib import asynccontextmanager
from database import IncidentRepository
from executor import WorkflowExecutor
from pydantic import BaseModel, Field
from google.cloud import storage
from pydantic import BaseModel, Field
from typing import Optional, Tuple

SUPPORTED_EXTENSIONS = {'.mp4', '.mov'}
INSPCTA_FILE_BUCKET = "inspecta-file-bucket"
UPLOADS_FOLDER = "uploads"
ALLOWED_TYPES = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav"
}

# --- 1. Lifecycle Management ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # This runs ONCE when the server starts
    db_dsn = os.getenv("DATABASE_URL", "dbname=yourdb user=postgres password=pass host=localhost")
    
    # Initialize Repository
    repo = IncidentRepository(db_dsn)
    
    # Initialize the Executor as a Singleton
    # It will stay in memory to handle parallel requests
    executor = WorkflowExecutor(repo=repo, db_connection_string=db_dsn)
    
    await executor.setup_workflow()
    
    # Attach to app state so routes can access it
    app.state.executor = executor
    
    yield
    # Cleanup logic (if any) goes here
    # --- SHUTDOWN ---
    print("🛑 Shutdown initiated. Cleaning up resources...")

    # 1. Stop the Checkpointer (LangGraph)
    # This closes the specific pool used for AI state management
    try:
        # Most async checkpointers have an aclose() or similar mechanism
        # or are handled when the connection pool they use is closed.
        if hasattr(executor.checkpointer, 'aclose'):
            await executor.checkpointer.aclose()
        print("✅ Checkpointer pool closed.")
    except Exception as e:
        print(f"⚠️ Error closing checkpointer: {e}")

    # 2. Close the Main Repository Pool
    try:
        # Assuming your IncidentRepository has a close_all() method
        repo.close_all_connections()
        print("✅ Business DB pool closed.")
    except Exception as e:
        print(f"⚠️ Error closing repository: {e}")

    # 3. Handle In-Flight Tasks (Optional but recommended)
    # Give background AI tasks 5 seconds to finish their current node
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    if tasks:
        print(f"⏳ Waiting for {len(tasks)} background tasks to settle...")
        await asyncio.wait(tasks, timeout=5.0)

    print("👋 Shutdown complete.")

app = FastAPI(lifespan=lifespan)

from firebase_admin import auth

@app.middleware("http")
async def verify_firebase_token(request: Request, call_next):
    # 1. Grab the Token from the 'Authorization' Header
    id_token = request.headers.get("Authorization", "").replace("Bearer ", "")
    
    try:
        # 2. Verify with Firebase
        decoded_token = auth.verify_id_token(id_token)
        
        # 3. Extract the SECURE company_id from the token claims
        # This CANNOT be faked by the UI
        request.state.company_id = decoded_token.get("company_id")
        request.state.company_storage_id = decoded_token.get("company_storage_id")
        
    except Exception:
        # If token is fake or expired, we don't set the company_id
        request.state.company_id = None
        request.state.company_storage_id = None
        
    return await call_next(request)

# --- The UI Endpoints ---
# Schema for the incoming request
class InspectionCreateRequest(BaseModel):
    site_id: int = Field(..., gt=0, description="The unique ID of the site being inspected")
    inspector_id: int = Field(..., gt=0, description="The ID of the person performing the inspection")

@app.post("/inspections")
async def create_inspection_endpoint(
    data: InspectionCreateRequest,
    request: Request
):
    """
    UI Endpoint: Initializes a new inspection session.
    The company_id is pulled from the authenticated session/state.
    """
    # Extract auth_company_id (Grab the Token from the 'Authorization' Header)
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # 1. Access the Singleton Executor
    executor: WorkflowExecutor = request.app.state.executor
    
    try:
        # 2. Call the Executor to handle validation and creation
        inspection_id = await executor.create_new_inspection(
            company_id=company_id,
            site_id=data.site_id,
            inspector_id=data.inspector_id
        )
        
        return {
            "status": "success",
            "inspection_id": inspection_id,
            "message": "New inspection initialized"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class IncidentUploadRequest(BaseModel):
    # Mandatory fields
    inspector_id: int
    file_url: str = Field(..., description="Full GCS path, e.g., gs://inspecta-file-bucket/f83k-92js/uploads/file.mp4")
    # Optional fields (defaulting to None)
    site_id: Optional[int] = None
    gps_coordinates: Optional[Tuple[float, float]] = None # (lat, long)

@app.post("/inspections/{inspection_id}/upload-incident")
async def upload_incident_endpoint(
    inspection_id: str,        # Path Parameter (Mandatory)
    request: Request,          # Request Object (Mandatory)
    data: IncidentUploadRequest # JSON Body (Mandatory)
):
    # Extract company_id (Grab the Token from the 'Authorization' Header)
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Extract company_storage_id (Grab the Token from the 'Authorization' Header)
    company_storage_id = getattr(request.state, "company_storage_id", None)
    if company_storage_id is None:
        raise HTTPException(status_code=401, detail="Invalid storage")

    # 1. Check GCS Metadata: Does the file actually exist and have a sane size?
    # This prevents the AI from trying to process a 'missing' or 'fake' file.

    # File name example : "gs://inspecta-file-bucket/f83k-92js/uploads/a1b2-c3d4.mp4"

    #Format : full_gcp_path = f"gs://{INSPCTA_FILE_BUCKET}/{company_storage_id}/UPLOADS_FOLDER/{filename}"
    if not data.file_url.startswith(f"gs://{INSPCTA_FILE_BUCKET}/{company_storage_id}/{UPLOADS_FOLDER}/"):
        raise HTTPException(status_code=403, detail="Security Violation: Invalid storage path.")

    # 2. Check File name and size
    blob_name = data.file_url.replace("gs://{INSPCTA_FILE_BUCKET}/", "")
    bucket = storage_client.bucket(INSPCTA_FILE_BUCKET)
    blob = bucket.get_blob(blob_name)
    if not blob:
        raise HTTPException(status_code=404, detail="File not found.")
    if blob.size > (500 * 1024 * 1024):
        raise HTTPException(status_code=413, detail="File too large (Max 500MB).")
        
    """
    Called by Mobile UI (Multipart Form Data).
    Accepts the video file returns incident_id immediately.
    """
    executor: WorkflowExecutor = request.app.state.executor

    # We pass the 'file.file' stream directly to the executor
    # This avoids loading the entire 100MB+ video into RAM at once
    incident_id = await executor.handle_incident_upload(
        company_id=company_id,
        inspection_id=inspection_id,
        inspector_id=data.inspector_id,
        filename=data.file_url,
        site_id=data.site_id,
        gps_coordinates=data.gps_coordinates
    )

    return {
        "status": "Accepted",
        "message": "Audio / Video received and processing started.",
        "incident_id": incident_id,
        "monitoring_url": f"/incidents/{incident_id}/status"
    }

@app.get("/incidents/{incident_id}/status")
async def get_status_endpoint(incident_id: str, request: Request):
    # Extract company_id (Grab the Token from the 'Authorization' Header)
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    executor: Executor = request.app.state.executor
    
    try:
        status_data = await executor.get_status(company_id, incident_id)
        return status_data
    except PermissionError:
        raise HTTPException(status_code=403, detail="Forbidden")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# UI calls this method to create a new place where to upload the file
@app.get("/get-upload-url")
async def get_upload_url():
    # Extract company_storage_id (Grab the Token from the 'Authorization' Header)
    company_storage_id = getattr(request.state, "company_storage_id", None)
    if company_storage_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    content_type = request.headers.get("Content-Type")
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    """
    Server-side generation of the destination.
    The UI never decides the path.
    """
    # 1. Dictate the path (Hardcoded logic)
    # We use a UUID so the user can't guess other filenames
    ext = ALLOWED_TYPES[content_type]
    unique_name = f"{uuid.uuid4()}{ext}"
    blob_name = f"{company_storage_id}/{UPLOADS_FOLDER}/{unique_name}"
    
    # 2. Generate Signed URL (valid for 30 mins)
    bucket = storage_client.bucket(INSPCTA_FILE_BUCKET)
    blob = bucket.blob(blob_name)
    
    url = blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=30),
        method="PUT", # UI must use PUT to upload
        content_type=content_type
    )

    # We return the URL for upload AND the path for the DB
    return {"upload_url": url, "storage_path": blob_name}