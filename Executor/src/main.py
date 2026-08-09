from asyncio import transports
import asyncio
import os
import logging
import datetime
import sys

# This MUST happen before any async code or loop initialization
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    # Force uvicorn to use SelectorEventLoop on Windows
    try:
        import uvicorn.loops.asyncio
        def _asyncio_setup(use_subprocess: bool = False):
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        def _asyncio_loop_factory(use_subprocess: bool = False):
            return lambda: asyncio.SelectorEventLoop()
        # Patch both potential uvicorn attributes to cover all uvicorn versions
        uvicorn.loops.asyncio.asyncio_setup = _asyncio_setup
        uvicorn.loops.asyncio.asyncio_loop_factory = _asyncio_loop_factory
    except Exception:
        pass

import uuid
from fastapi import FastAPI, HTTPException, Request, Query
import dotenv
import uvicorn
from pathlib import Path

from .workflowexecutor import WorkflowExecutor, firebase_token_var
from langsmith_config import get_langsmith_config
from pydantic import BaseModel, Field
from google.cloud import storage
from urllib.parse import urlparse
from typing import Optional, Tuple, Dict, Any, List

from contextlib import asynccontextmanager

import datetime
import google.auth.transport.requests
from google.cloud import storage
import firebase_admin
from firebase_admin import credentials, auth
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

INSPCTA_FILE_BUCKET = "inspecta-file-bucket"
UPLOADS_FOLDER = "uploads"
ALLOWED_TYPES = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png"
}
ALLOWED_VIDEO_TYPES = [".mp4", ".mov"]
ALLOWED_AUDIO_TYPES = [".mp3", ".wav"]
ALLOWED_IMAGE_TYPES = [".jpg", ".png"]

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
dotenv.load_dotenv(dotenv_path=env_path)
ENV_MODE = os.getenv("ENV_MODE", "local").lower()
logger.info(f"🚀 Starting Executor with ENV_MODE={ENV_MODE}")

# Define your local root (where files actually live on your PC)
LOCAL_STORAGE_ROOT = os.path.abspath(os.getenv("LOCAL_STORAGE_ROOT", r"G:\code\Inspecta\Data"))

gcs_client = None

def extract_bucket_and_blob_from_gs(gs_uri: str) -> Tuple[str, str]:
    """
    Splits a gs:// URI into bucket_name and blob_name.
    """
    # Parse the URI using standard URL rules
    parsed = urlparse(gs_uri)
    
    # Check if the protocol is correct
    if parsed.scheme != "gs":
        raise ValueError("URI scheme must be 'gs'")
        
    bucket_name = parsed.netloc
    # Strip the leading slash from the path to get the exact blob name
    blob_name = parsed.path.lstrip("/")
    
    return bucket_name, blob_name


# --- 1. Lifecycle Management ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    if sys.platform == "win32":
        loop = asyncio.get_event_loop()

    # Initialize LangSmith at startup
    langsmith_config = get_langsmith_config()
    logger.info("✅ LangSmith configured")
    
    # 1. Initialize GCS Client once (Singleton)
    global gcs_client
    if ENV_MODE.startswith("local"):
        datastore_path = Path(__file__).parent.parent.parent / "DataStore"
        gcp_key_file = (datastore_path / "gcp-key.json").resolve()
        gcs_client = storage.Client.from_service_account_json(gcp_key_file)
    else:
        gcs_client = storage.Client()

    logger.info("✅ GCS Client initialized")

    # Initialize the Executor as a Singleton
    # It will stay in memory to handle parallel requests
    #db_dsn = "postgresql://postgres:passwd@localhost:5433/inspecta_db"
    #db_dsn = "postgresql://neondb_owner:npg_U8BPRXgnzT6L@ep-floral-hat-ajkt7oqc.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require"
    db_dsn = os.getenv("DATABASE_URL", "postgresql://postgres:passwd@localhost:5432/inspecta_db")
    executor = await WorkflowExecutor.create(db_dsn)
    
    # Attach to app state so routes can access it
    app.state.executor = executor
    logger.info("✅ WorkflowExecutor initialized")
    
    yield
    # Cleanup logic (if any) goes here
    # --- SHUTDOWN ---
    logger.info("🛑 Shutdown initiated. Cleaning up resources...")

    # 1. Stop the Checkpointer (LangGraph)
    # This closes the specific pool used for AI state management
    try:
        if hasattr(executor, 'close'):
            await executor.close()
        logger.info("✅ Checkpointer pool closed.")
    except Exception as e:
        logger.warning(f"⚠️ Error closing checkpointer: {e}")

    # 2. Handle In-Flight Tasks (Optional but recommended)
    # Give background AI tasks 5 seconds to finish their current node
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    if tasks:
        logger.info(f"⏳ Waiting for {len(tasks)} background tasks to settle...")
        await asyncio.wait(tasks, timeout=5.0)

    logger.info("👋 Shutdown complete.")

app = FastAPI(lifespan=lifespan)

# Initialize Firebase Admin SDK
target_ui_project = os.getenv("UI_PROJECT_ID", "inspecta-ai")
print(f"🎯 Initializing UI Firebase for project: {target_ui_project}")
try:
    if not firebase_admin._apps:
        # datastore_path = Path(__file__).parent.parent.parent / "DataStore"
        # cert_path = datastore_path / "inspecta-360-firebase-adminsdk-fbsvc-bd599894b5.json"
        # if cert_path.exists():
        #     cred = credentials.Certificate(str(cert_path))
        #     firebase_admin.initialize_app(cred)
        #     logger.info("✅ Firebase Admin initialized with local credentials in Executor")
        # else:
        #     firebase_admin.initialize_app()
        #     logger.info("✅ Firebase Admin initialized with Default Credentials in Executor")
        firebase_admin.initialize_app(options={
                'projectId': target_ui_project
            })
        print(f"✅ Firebase Admin initialized for cross-project audience: {target_ui_project}")
except Exception as e:
    logger.error(f"❌ Firebase initialization error in Executor: {e}")

@app.middleware("http")
async def verify_firebase_token(request: Request, call_next):
    # Extract Firebase Token strictly from X-Firebase-Token header
    firebase_token = request.headers.get("X-Firebase-Token")
    token_ctx_token = firebase_token_var.set(firebase_token)

    try:
        try:
            # Verify with Firebase
            decoded_token = auth.verify_id_token(firebase_token)
            
            # Extract the SECURE company_id and company_storage_id from token claims
            request.state.company_id = decoded_token.get("company_id")
            request.state.company_storage_id = decoded_token.get("company_storage_id")
        except Exception as e:
            # If token is fake or expired, we don't set the company_id
            request.state.company_id = None
            request.state.company_storage_id = None
            print(f"❌ Token verification failed: {e}")
            
        return await call_next(request)
    finally:
        firebase_token_var.reset(token_ctx_token)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # This will print the exact field, location, and reason for the 400/422 error to your logs
    print(f"FastAPI Validation Failed for {request.url}. Errors: {exc.errors()}")
    return JSONResponse(
        status_code=400,
        content={"detail": exc.errors(), "body": exc.body},
    )

# --- The UI Endpoints ---
# Schema for the incoming request
class InspectionCreateRequest(BaseModel):
    site_id: int = Field(..., gt=0, description="The unique ID of the site being inspected")
    inspector_id: Optional[int] = Field(None, description="The ID of the person performing the inspection")
    friendly_name: Optional[str] = Field(None, description="Friendly Name of the inspection")

@app.post("/inspections")
async def create_inspection_endpoint(
    data: InspectionCreateRequest,
    request: Request
    ):
    """
    UI Endpoint: Initializes a new inspection session.
    The company_id is pulled from the authenticated session/state.
    """
    # Extract company_id (Grab the Token from the 'Authorization' Header)
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
            friendly_name=data.friendly_name
        )
        
        return {
            "status": "success",
            "inspection_id": inspection_id,
            "message": "New inspection created"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class IncidentUploadRequest(BaseModel):
    # Mandatory fields
    inspector_id: int
    file_url: str = Field(..., description="Full GCS path, e.g., gs://<bucket_name>/f83k-92js/uploads/file.mp4")
    # additional_file_urls: Optional[list[str]] = Field(None, description="List of GCS paths for additional files")
    gps_coordinates: Optional[Tuple[float, float]] = None # (lat, long)
    translation_language: Optional[str] = Field(None, description="Language to be used for translation of title and description of tasks, e.g., hindi, marathi")
    incident_type: Optional[int] = 0
    images: Optional[List[Dict[str, Any]]] = None

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

    logger.info(f"[Request] Primary file : {data.file_url}")
    logger.info(f"[Request] Additional image urls : {data.images}")

    image_file_urls = []
    file_size = 0
    if data.images:
        image_file_urls.extend(data.images)
          
    if ENV_MODE == "local":
        # Resolve the path to its absolute form to handle any "../" tricks
        data.file_url = os.path.abspath(os.path.normpath(data.file_url)).replace("/", "\\")
        for index, image_url in enumerate(data.images):
            image_file_urls[index]["url"] = os.path.abspath(os.path.normpath(image_url["url"])).replace("/", "\\")

        # Define the ONLY allowed directory for this company
        allowed_prefix = os.path.join(LOCAL_STORAGE_ROOT, company_storage_id, UPLOADS_FOLDER)
    else:
        # Check GCS Metadata: Does the file actually exist and have a same size?
        # This prevents the AI from trying to process a 'missing' or 'fake' file.
        # File name example : "gs://inspecta-file-bucket/f83k-92js/uploads/a1b2-c3d4.mp4"
        #Format : full_gcp_path = f"gs://{INSPCTA_FILE_BUCKET}/{company_storage_id}/UPLOADS_FOLDER/{filename}"
        # Define the ONLY allowed directory for this company
        #if not data.file_url.startswith(f"gs://{INSPCTA_FILE_BUCKET}/{company_storage_id}/{UPLOADS_FOLDER}/"):
        allowed_prefix =  f"gs://{INSPCTA_FILE_BUCKET}/{company_storage_id}/{UPLOADS_FOLDER}/"

    if not data.file_url.startswith(allowed_prefix):
        raise HTTPException(status_code=403, detail="Security Violation: Invalid storage path.")
    
    # Check Security Violation for additional files also
    for image_file in image_file_urls:
        if not image_file["url"].startswith(allowed_prefix):
            raise HTTPException(status_code=403, detail=f"Security Violation: Invalid storage path for {image_file}")
        # ToDo: Check file type to ensure only supported format of image files are passed
        # ToDo: Check for file size or any other checks.

    # 2. Check File name and size
    file_size = 0
    if ENV_MODE == "local":
        # 2. Local File Metadata Check (Existence and Size)
        if not os.path.exists(data.file_url):
            raise HTTPException(status_code=404, detail="File not found on local disk.")
        file_size = os.path.getsize(data.file_url)
    else:
        # 2. GCS File Metadata Check (Existence and Size)
        #gs_uri = "gs://inspecta-file-bucket/CompanyStorage1/uploads/my-file.mp4"
        bucket_name, blob_name = extract_bucket_and_blob_from_gs(data.file_url)
        bucket = gcs_client.bucket(bucket_name)
        blob = bucket.get_blob(blob_name)  # blob = {company_storage_id}/UPLOADS_FOLDER/{filename}"
        if not blob:
            raise HTTPException(status_code=404, detail="File not found.")
        file_size = blob.size or 0

    if file_size and file_size > (300 * 1024 * 1024):
        raise HTTPException(status_code=413, detail="File too large (Max 300MB).")  

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
        file_url=data.file_url,
        existing_incident_id = None,
        translation_language=data.translation_language,
        gps_coordinates=data.gps_coordinates,
        incident_type=data.incident_type if data.incident_type is not None else 0,
        images=image_file_urls
    )

    return {
        "status": "Success",
        "message": "Audio / Video received and processing started.",
        "incident_id": incident_id
    }
   
@app.get("/incidents/recent")
async def get_recent_incidents(
    request: Request,
    days: int = Query(7, description="Number of days of history to fetch"),
    limit: int = Query(10, description="Maximum number of incidents to fetch")
):
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    executor: WorkflowExecutor = request.app.state.executor
    
    try:
        # 1. Fetch recent incidents from repository
        incidents = await executor.get_recent_incidents(company_id, days, limit)
        logger.info(f"Fetched {len(incidents)} recent incidents")
        # 2. Get status for each incident
        results = []
        for inc in incidents:
            incident_id = str(inc.get("id"))
            inspection_id = str(inc.get("inspection_id"))

            try:
                status_data = await executor.get_status(company_id, incident_id)
                status = status_data.get("status")
                display_message = status_data.get("display_message")
            except Exception as status_err:
                logger.error(f"Could not get status for recent incident {incident_id}: {status_err}")
                status = "failed"
                display_message = "Step - Failed: Failed to process incident"
            
            uploaded_at = inc.get("created_at")
            if isinstance(uploaded_at, (datetime.datetime, datetime.date)):
                uploaded_at_str = uploaded_at.isoformat()
            else:
                uploaded_at_str = str(uploaded_at) if uploaded_at else ""

            video_url = inc.get("video_url") or ""
            file_type = "unknown"
            if video_url:
                parts = video_url.rsplit('.', 1)
                extension = "." + parts[-1].lower() if len(parts) > 1 else ""
                if extension in ALLOWED_VIDEO_TYPES:
                    file_type = "video"
                elif extension in ALLOWED_AUDIO_TYPES:
                    file_type = "audio"
                elif extension in ALLOWED_IMAGE_TYPES:
                    file_type = "image"

            inc_type_int = inc.get("incident_type", 0)
            if inc_type_int is None:
                inc_type_int = 0
            incident_type_str = "fieldnote" if inc_type_int == 1 else "incident"

            results.append({
                "id": incident_id,
                "incidentId": incident_id,
                "inspectionId": inspection_id,
                "uploadedAt": uploaded_at_str,
                "incident_status": status,   # Status could be one of these values : processing / completed / failed
                "displayMessage": display_message,
                "incident_media": file_type,
                "incident_type": inc_type_int
            })
        
        return {"status": "Success", "data": results}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Forbidden")
    except Exception as e:
        logger.error(f"Error fetching recent incidents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/incidents/{incident_id}/status")
async def get_status_endpoint(incident_id: str, request: Request):
    # Extract company_id (Grab the Token from the 'Authorization' Header)
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    executor: WorkflowExecutor = request.app.state.executor
    
    try:
        status_data = await executor.get_status(company_id, incident_id)
        status = status_data.get("status")
        display_message = status_data.get("display_message")
        return {
            "status": "Success",
            "incident_status": status, # Status could be one of these values : processing / completed / failed
            "display_message": display_message
        }
    except PermissionError:
        raise HTTPException(status_code=403, detail="Forbidden")
    except Exception as e:
        logger.error(f"Error fetching status for incident {incident_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# UI calls this method to create a new place where to upload the file
@app.get("/get-upload-url")
async def get_upload_url(request: Request, fileType: str):
    # Extract company_storage_id (Grab the Token from the 'Authorization' Header)
    company_storage_id = getattr(request.state, "company_storage_id", None)
    if company_storage_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    if not fileType:
        raise HTTPException(status_code=400, detail="Missing fileType")
    if fileType not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    """
    Server-side generation of the destination.
    The UI never decides the path.
    """
    # 1. Standard Logic (Same for both)
    ext = ALLOWED_TYPES.get(fileType, ".mp4")
    unique_name = f"{uuid.uuid4()}{ext}"
    
    # This is the "relative" path inside the bucket or root folder
    blob_name = f"{company_storage_id}/{UPLOADS_FOLDER}/{unique_name}"

    if ENV_MODE == "local":
        # 2. Local Logic: Return the absolute path on your hard drive
        full_path = os.path.join(LOCAL_STORAGE_ROOT, blob_name)
        
        # Ensure the directory exists so the "Executor" or UI doesn't fail
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        # We return the path as the "url" so the UI/Executor knows where to look
        return {
            "status": "Success",
            "upload_url": full_path, 
            "blob_name": blob_name,
            "storage_type": "local"
        }
    else:
        # 3. GCP Logic
        global gcs_client
        gcs_client = storage.Client()
        bucket = gcs_client.bucket(INSPCTA_FILE_BUCKET)
        blob = bucket.blob(blob_name)

        # 2. Extract the credentials that the client is actively using
        creds = gcs_client._credentials
        # ---- SCENARIO A: Local Development (JSON Key File is Present) ----
        # If the credentials have a private key, sign completely OFFLINE (instant, no network hops)
        if hasattr(creds, 'private_key') and creds.private_key:
            url = blob.generate_signed_url(
                version="v4",
                expiration=datetime.timedelta(minutes=15),
                method="PUT",
                content_type=fileType
            )
        # ---- SCENARIO B: Cloud Run Production (Token-Based Managed Identity) ----
        # If no private key exists, refresh the metadata token and use the remote IAM SignBlob API
        else:
            # 1. Define the explicit scope required for IAM infrastructure interactions
            #CLOUD_PLATFORM_SCOPE = ['https://www.googleapis.com/auth/iam'] # Set this preferably
            CLOUD_PLATFORM_SCOPE = ['https://www.googleapis.com/auth/cloud-platform']

            # 2. Force the credentials object to request the required scope footprint
            credentials, project = google.auth.default(scopes=CLOUD_PLATFORM_SCOPE)

            auth_req = google.auth.transport.requests.Request()
            credentials.refresh(auth_req)
            
            url = blob.generate_signed_url(
                version="v4",
                expiration=datetime.timedelta(minutes=15),
                method="PUT",
                content_type=fileType,
                service_account_email=credentials.service_account_email,
                access_token=credentials.token
            )

        return {
            "status": "Success",
            "upload_url": url, 
            "blob_name": blob_name,
            "storage_type": "gcs"
        }
        
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8004)
