import sys
import os
from pathlib import Path

# Windows asyncio event loop fix for Psycopg
# Must be set BEFORE importing asyncio-dependent libraries
if sys.platform == 'win32':
    import asyncio
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

# Add DataStore to path so we can import postgresdb
datastore_path = Path(__file__).parent.parent.parent / "DataStore"
sys.path.append(str(datastore_path))

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import firebase_admin
from firebase_admin import credentials, auth
import asyncio
import dotenv
from postgresdb import IncidentRepository, TaskStatus, TaskSeverity, TaskType, Industry
import shutil
from google.cloud import storage

# Load environment variables from .env file
env_path = Path(__file__).parent / ".env"
dotenv.load_dotenv(dotenv_path=env_path)

ENV_MODE = os.getenv("ENV_MODE", "local")
INSPCTA_FILE_BUCKET = os.getenv("INSPCTA_FILE_BUCKET", "inspecta-file-bucket")
UPLOADS_FOLDER = os.getenv("UPLOADS_FOLDER", "uploads")
TIMEOUT= os.getenv("TIMEOUT", "60")
BASE_EXECUTOR_URL = os.getenv("BASE_EXECUTOR_URL", "http://localhost:8004")

import urllib.request
import json

app = FastAPI(
    title="Inspecta UI Backend API",
    description="Backend API for Inspecta UI that wraps DataStore postgresdb.py",
    version="1.0.0"
)

# ============ CORS Configuration ============
# Do not change the sequence. This shall happen before custom middleware @app.middleware("http")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_origin_regex=r"https://.*\.web\.app|https://.*\.firebaseapp\.com",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)
print("✅ CORS Middleware configured for local and Firebase hosting")

# ============ Authentication ============

@app.middleware("http")
async def verify_firebase_token(request: Request, call_next):
    # 1. Skip verification for OPTIONS requests (CORS preflight)
    # These don't carry Authorization headers and are handled by CORSMiddleware
    if request.method == "OPTIONS" or request.url.path == "/health":
        return await call_next(request)

    try:
        # 2. Grab the Token from the 'Authorization' Header
        auth_header = request.headers.get("Authorization", "")
        
        if not auth_header:
            print(f"⚠️ No Authorization header sent from client for {request.url.path}")

        if not auth_header.startswith("Bearer "):
            print(f"⚠️ No Bearer token found for {request.method} {request.url.path}")
            request.state.company_id = None
            return await call_next(request)

        id_token = auth_header.replace("Bearer ", "")
        
        # 3. Verify with Firebase
        decoded_token = auth.verify_id_token(id_token)
        
        request.state.company_id = decoded_token.get("company_id")
        request.state.company_storage_id = decoded_token.get("company_storage_id")
        print(f"✅ Authenticated: Company {request.state.company_id}")
    except Exception as e:
        print(f"❌ Token verification failed: {e}")
        request.state.company_id = None
        request.state.company_storage_id = None
        
    return await call_next(request)

# ============ Global repository ============
repository: Optional[IncidentRepository] = None

@app.on_event("startup")
async def startup_event():
    """Initialize connection pool and repository on application startup"""
    global repository
    
    dsn  = os.getenv("db_dsn", "postgresql://postgres:passwd@localhost:5432/inspecta_db")
    #dsn  = os.getenv("db_dsn", "postgresql://neondb_owner:npg_U8BPRXgnzT6L@ep-floral-hat-ajkt7oqc.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require")

    # Initialize Firebase Admin SDK
    try:
        cert_path = datastore_path / "inspecta-360-firebase-adminsdk-fbsvc-bd599894b5.json"
        if not firebase_admin._apps:
            cred = credentials.Certificate(str(cert_path))
            firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin initialized")
    except Exception as e:
        print(f"❌ Firebase initialization error: {e}")

    # Initialize repository with connection pool
    repository = IncidentRepository(dsn=dsn)
    #await repository.open()
    
    print("✅ Connection pool initialized and ready")

@app.on_event("shutdown")
async def shutdown_event():
    """Close connection pool on application shutdown"""
    global repository
    
    if repository and hasattr(repository, 'close'):
        await repository.close()
        print("✅ Repository closed")


# ============ Pydantic Models ============

class TaskInput(BaseModel):
    task_title: str
    task_description: Optional[str] = None
    task_original_description: Optional[str] = None
    video_url: Optional[str] = None
    video_start_ms: Optional[int] = 0
    video_end_ms: Optional[int] = 0
    task_artifacts: Optional[List[Any]] = []
    status_id: Optional[int] = TaskStatus.PENDING
    severity_id: Optional[int] = TaskSeverity.REGULAR
    task_type_id: Optional[int] = TaskType.VERIFY

class IncidentInput(BaseModel):
    inspection_id: str
    inspector_id: int
    video_url: str
    audio_url: Optional[str] = None
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = {}

class TaskUpdateInput(BaseModel):
    task_title: str
    task_description: str

class TaskReviewInput(BaseModel):
    comments: str
    status_id: int

class SiteInput(BaseModel):
    site_name: str
    address: str

# ============ Health Check ============

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "Inspecta UI Backend"}


# ============ Utility Functions ============

def CallExecutorService(executor_service_url, method, headers: dict, payload: Optional[dict]):
    print(f"Calling Executor at {executor_service_url} with payload {payload}")
    try:
        if payload is None:
            payload = {}
            
        req = urllib.request.Request(   
            executor_service_url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method=method
        )
        
        # Timeout at 60s as expected for the timeboxed submission
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            resp_data = json.loads(response.read().decode("utf-8"))
            if resp_data.get("status") == "success":
                return resp_data
            else:
                raise HTTPException(status_code=500, detail=resp_data.get("message", "Failed to call Executor Service"))
                
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        try:
            error_json = json.loads(error_msg)
            detail = error_json.get("detail", error_msg)
        except Exception:
            detail = error_msg
        print(f"Executor HTTP Error ({e.code}): {detail}")
        raise HTTPException(status_code=e.code, detail=f"Executor error: {detail}")
    except Exception as e:
        print(f"Error calling Executor: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to connect to Executor: {str(e)}")


# ============ Incidents Endpoints ============

@app.get("/api/incidents")
async def get_incidents_for_site_or_inspection(
    request: Request,
    siteId: int = Query(None, description="Site ID"),
    inspectionId: str = Query(None, description="Inspection ID")
):
    """Fetch incidents for a given site or inspection"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        if not siteId and not inspectionId:
            raise HTTPException(status_code=400, detail="Either siteId or inspectionId is required")
        
        if inspectionId:
            print(f"Received GET /api/incidents request for inspectionId {inspectionId} and companyId {company_id}")
            incidents = await repository.get_incidents_for_inspection(inspectionId, company_id)
        else:
            print(f"Received GET /api/incidents request for siteId {siteId} and companyId {company_id}")
            # ToDO: Implement get_incidents_for_site in repository if not already done
            # or reuse get_site_inspection_combinations() by making SiteId as optional input
            incidents = await repository.get_incidents_for_site(siteId, company_id)
        
        print(f"✅ Fetched {len(incidents)} incidents")
        return {"status": "success", "data": incidents}
    except Exception as e:
        print(f"❌ Error fetching incidents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/incidents/{incidentId}")
async def get_incident(
    incidentId: str,
    request: Request
):
    """Fetch a specific incident"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        # Verify ownership
        owns = await repository.verify_incident_ownership(company_id, incidentId)
        if not owns:
            raise HTTPException(status_code=403, detail="Incident not found or access denied")
        
        incident = await repository.get_incident(company_id, incidentId)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        
        return {"status": "success", "data": incident}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/incidents")
async def create_incident(
    request: Request,
    incident: IncidentInput = None
):
    """Create a new incident"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        gps_coords = None
        if incident.gps_lat is not None and incident.gps_lon is not None:
            gps_coords = (incident.gps_lat, incident.gps_lon)
        
        incident_id = await repository.create_incident(
            company_id=company_id,
            inspection_id=incident.inspection_id,
            inspector_id=incident.inspector_id,
            video_url=incident.video_url,
            gps_coordinates=gps_coords,
            audio_url=incident.audio_url,
            metadata=incident.metadata
        )
        
        return {"status": "success", "data": {"incident_id": incident_id}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/incidents/{incidentId}/audio")
async def update_incident_audio(
    incidentId: str,
    request: Request,
    audio_url: str = Query(..., description="Audio URL path")
):
    """Update incident audio URL"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        # Verify ownership
        owns = await repository.verify_incident_ownership(company_id, incidentId)
        if not owns:
            raise HTTPException(status_code=403, detail="Incident not found or access denied")
        
        await repository.update_incident_audio(company_id, incidentId, audio_url)
        
        return {"status": "success", "message": "Audio URL updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/incidents/{incidentId}/progress")
async def get_incident_progress(
    incidentId: str,
    request: Request
):
    """Fetch incident progress (audio URL)"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        progress = await repository.get_incident_progress(company_id, incidentId)
        return {"status": "success", "data": progress}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============ Tasks Endpoints ============

@app.get("/api/incidents/{incidentId}/tasks")
async def get_tasks_for_incident(
    incidentId: str,
    request: Request
):
    """Fetch all tasks for an incident"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        tasks = await repository.get_tasks_for_incident(company_id, incidentId)
        return {"status": "success", "data": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/incidents/{incidentId}/tasks/bulk")
async def bulk_add_tasks(
    incidentId: str,
    request: Request,
    inspectionId: str = Query(..., description="Inspection ID"),
    tasks: List[TaskInput] = None
):
    """Bulk add tasks to an incident"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        # Verify incident ownership
        owns = await repository.verify_incident_ownership(company_id, incidentId)
        if not owns:
            raise HTTPException(status_code=403, detail="Incident not found or access denied")
        
        # Convert to dict format expected by repository
        tasks_data = [task.dict() for task in tasks]
        
        await repository.bulk_add_incident_tasks(
            company_id=company_id,
            incident_id=incidentId,
            inspection_id=inspectionId,
            tasks=tasks_data
        )
        
        return {"status": "success", "message": f"Added {len(tasks)} tasks"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/tasks/{taskId}")
async def update_task(
    taskId: str,
    request: Request,
    task_update: TaskUpdateInput = None
):
    """Update a task's title and description"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        updated = await repository.update_task(
            company_id=company_id,
            task_id=taskId,
            title=task_update.task_title,
            description=task_update.task_description
        )
        
        return {"status": "success", "data": updated}
    except Exception as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail="Task not found")
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/tasks/{taskId}/review")
async def update_task_review(
    taskId: str,
    request: Request,
    review: TaskReviewInput = None
):
    """Update a task after expert review"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        updated = await repository.update_task_review(
            company_id=company_id,
            task_id=taskId,
            comments=review.comments,
            status_id=review.status_id
        )

        return {"status": "success", "data": updated}
    except Exception as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail="Task not found")
        raise HTTPException(status_code=500, detail=str(e))

# ============ Sites Endpoints ============

@app.get("/api/sites")
async def get_sites(request: Request):
    """Fetch all sites for a company"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        sites = await repository.get_sites_for_company(company_id)
        
        # Format sites for JSON response - ensure all fields are JSON-serializable
        formatted_sites = []
        for site in sites:
            formatted_site = {
                "id": str(site.get('id', '')),
                "name": site.get('site_name', ''),
                "address": site.get('address', ''),
                "company_id": site.get('company_id'),
                "industry_id": site.get('industry_id'),
                "gps_coordinates": site.get('gps_coordinates')  # Will be None or dict
            }
            formatted_sites.append(formatted_site)
        
        return {"status": "success", "data": formatted_sites}
    except Exception as e:
        print(f"❌ Error fetching sites: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sites")
async def create_site(
    request: Request,
    site: SiteInput
):
    """Create a new site"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        site_id = await repository.create_site(company_id, site.site_name, site.address)
        return {"status": "success", "data": {"site_id": site_id}}
    except Exception as e:
        print(f"❌ Error creating site: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============ Site-Inspection Endpoints ============

@app.get("/api/site-inspections")
async def get_site_inspections(request: Request):
    """Fetch all Site-Inspection combinations for a company"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        combinations = await repository.get_site_inspection_combinations(company_id)
        
        # Format combinations for JSON response
        formatted_combinations = []
        for combo in combinations:
            formatted_combo = {
                "site_id": str(combo.get('site_id', '')),
                "site_name": combo.get('site_name', ''),
                "address": combo.get('address', ''),
                "inspection_id": str(combo.get('inspection_id', '')) if combo.get('inspection_id') else None,
                "inspection_friendly_name": str(combo.get('inspection_friendly_name', '')) if combo.get('inspection_friendly_name') else None,
                "inspection_created_at": combo.get('inspection_created_at').isoformat() if combo.get('inspection_created_at') else None
            }
            formatted_combinations.append(formatted_combo)
        
        print(f"✅ Fetched {len(formatted_combinations)} site-inspection combinations for companyId {company_id}")
        return {"status": "success", "data": formatted_combinations}
    except Exception as e:
        print(f"❌ Error fetching site-inspections: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ============ Company Endpoints ============

@app.get("/api/companyinfo")
async def get_company_info(
    request: Request
):
    """Fetch company information"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        company = await repository.get_company_info(company_id)
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
        
        return {"status": "success", "data": company}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============ Inspection Endpoints ============

def fill_auth_headers(request: Request, headers: dict):
    """Fill auth headers for executor service"""
    auth_header = request.headers.get("Authorization")
    if auth_header:
        headers["Authorization"] = auth_header
    
    company_id = getattr(request.state, "company_id", None)
    company_storage_id = getattr(request.state, "company_storage_id", None)
    if company_id is not None:
        headers["X-Company-Id"] = str(company_id)
    if company_storage_id is not None:
        headers["X-Storage-Id"] = str(company_storage_id)
    
    headers["Content-Type"] = "application/json"
    
    return headers

def upload_file_data(file_path, real_upload_path, blob_name):
    if(ENV_MODE == "local"):
        # In a local scenario, the UI would upload the file to 'real_upload_path'.
        # For this test, we manually copy it to simulate a successful upload.    
        shutil.copy(file_path, real_upload_path)
        print("✅ Simulated file upload to local storage.")
    else:
        # Upload to GCS
        gcs_client = storage.Client()
        bucket = gcs_client.bucket(INSPCTA_FILE_BUCKET)
        blob = bucket.blob(blob_name)
        blob.upload_from_filename(file_path)
        print(f"✅ Uploaded to GCS: {file_path}")


@app.post("/api/inspections")
async def create_inspection(
    request: Request,
    siteId: int = Query(..., description="Site ID"),
    friendlyName: Optional[str] = Query(None, description="Friendly Name of the inspection")
):
    """Create a new inspection"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        print(f"Received CREATE /api/inspections request for siteId {siteId}, friendlyName {friendlyName} ")
        headers = {}
        headers = fill_auth_headers(request, headers)
        
        # Prepare headers to forward auth context (specifically for RLS mappings)        
        INSPECTOR_ID = 1  #  TBD : Ideally shall take inspector id from Request.state (shall come from Firebase custom claim) 
        payload = {
            "site_id": siteId,
            "inspector_id": INSPECTOR_ID,
            "friendly_name": friendlyName
        }
        executor_service_url = BASE_EXECUTOR_URL + "/inspections"
        resp_data = CallExecutorService(executor_service_url, "POST", headers, payload)
        inspection_id = resp_data.get("inspection_id")
        return {"status": "success", "data": {"inspection_id": inspection_id}}
                        
    except Exception as e:
        print(f"Error calling Executor: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to connect to Executor: {str(e)}")

@app.get("/api/inspections/{inspectionId}/verify")
async def verify_inspection_ownership(
    inspectionId: str,
    request: Request
):
    """Verify inspection ownership"""
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        owns = await repository.verify_inspection_ownership(company_id, inspectionId)
        
        return {"status": "success", "data": {"owns": owns}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/inspections/{inspection_id}/upload-incident")
async def upload_incident(
    request: Request,           # Request Object (Mandatory),
    inspection_id: str          # Path Parameter (Mandatory)
):
    company_id = getattr(request.state, "company_id", None)
    if company_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    company_storage_id = getattr(request.state, "company_storage_id", None)
    if company_storage_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    try:
        print(f"Received request for Uploading incident for inspection {inspection_id}")
        headers = {}
        headers = fill_auth_headers(request, headers)

        print("\n------------------ [STEP 1] Get Real Upload URL ------------------")
        request_headers= headers.copy() 
        request_headers["Content-Type"] = "video/mp4"  # Specific Content type is needed to fetch URL
        executor_service_url = BASE_EXECUTOR_URL + "/get-upload-url"
        resp_data = CallExecutorService(executor_service_url, "GET", request_headers, None)
        real_upload_path = resp_data.get("upload_url")
        blob_name = resp_data.get("blob_name")
        print(f"✅ Received Upload Path: {real_upload_path} and  Received Blob Name: {blob_name}")
        
        INSPECTOR_ID = 1  #  TBD : Ideally shall take inspector id from Request.state (shall come from Firebase custom claim) 
        print("\n------------------ [STEP 2] Upload File ------------------")
        file_path = ""  # To Do: This shall be replaced by the file name on local machine 
        upload_file_data(file_path, real_upload_path, blob_name)

        executor_service_url =  BASE_EXECUTOR_URL + "/get-upload-url"
        resp_data = CallExecutorService(executor_service_url, "GET", headers, None)

        print("\n------------------ [STEP 3] Trigger Real Incident Upload & LangGraph ------------------")
        file_url_payload = f"gs://{INSPCTA_FILE_BUCKET}/{blob_name}" if ENV_MODE != "local" else real_upload_path
        incident_payload = {
            "inspector_id": INSPECTOR_ID,
            "file_url": file_url_payload
        }
        executor_service_url =  BASE_EXECUTOR_URL + f"/inspections/{inspection_id}/upload-incident"
        resp_data = CallExecutorService(executor_service_url, "POST", headers, incident_payload)
        incident_id = resp_data.get("incident_id")
        return {"status": "success", "data": {"incident_id": incident_id}}
                        
    except Exception as e:
        print(f"Error calling Executor: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to connect to Executor: {str(e)}")

# @app.get("/incidents/{incident_id}/status")
# async def get_status_endpoint(incident_id: str, request: Request):

# @app.get("/get-upload-url")
# async def get_upload_url(request: Request):

# ============ Enums Endpoints (for frontend reference) ============

@app.get("/api/enums/task-statuses")
async def get_task_statuses():
    """Get available task statuses"""
    return {
        "status": "success",
        "data": {
            "PENDING": int(TaskStatus.PENDING),
            "IN_PROGRESS": int(TaskStatus.IN_PROGRESS),
            "EXPERT_REVIEW": int(TaskStatus.EXPERT_REVIEW),
            "COMPLETED": int(TaskStatus.COMPLETED),
            "FAILED": int(TaskStatus.FAILED),
        }
    }

@app.get("/api/enums/task-types")
async def get_task_types():
    """Get available task types"""
    return {
        "status": "success",
        "data": {
            "INSTALL": int(TaskType.INSTALL),
            "REPAIR": int(TaskType.REPAIR),
            "VERIFY": int(TaskType.VERIFY),
            "CLEAR": int(TaskType.CLEAR),
        }
    }

@app.get("/api/enums/task-severities")
async def get_task_severities():
    """Get available task severities"""
    return {
        "status": "success",
        "data": {
            "SEVERE": int(TaskSeverity.SEVERE),
            "REGULAR": int(TaskSeverity.REGULAR),
            "LOW": int(TaskSeverity.LOW),
        }
    }

@app.get("/api/enums/industries")
async def get_industries():
    """Get available industries"""
    return {
        "status": "success",
        "data": {
            "SOLAR": int(Industry.SOLAR),
            "OIL_GAS": int(Industry.OIL_GAS),
            "TELECOM": int(Industry.TELECOM),
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("BACKEND_PORT", 8080))
    )
