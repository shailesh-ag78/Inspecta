import os
from fastapi import FastAPI, UploadFile, File, Form, Request, BackgroundTasks
from contextlib import asynccontextmanager
from database import IncidentRepository
from executor import WorkflowExecutor

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

app = FastAPI(lifespan=lifespan)

# --- 2. The UI Endpoint ---
@app.post("/inspections/{inspection_id}/upload-incident")
async def upload_incident_endpoint(
    inspection_id: str,
    company_id: int = Form(...),
    inspector_id: int = Form(...),
    file: UploadFile = File(...),
    request: Request = None
):
    """
    Called by Mobile UI (Multipart Form Data).
    Accepts the video file and metadata, returns incident_id immediately.
    """
    executor: WorkflowExecutor = request.app.state.executor

    # We pass the 'file.file' stream directly to the executor
    # This avoids loading the entire 100MB+ video into RAM at once
    incident_id = await executor.handle_incident_upload(
        company_id=company_id,
        inspection_id=inspection_id,
        inspector_id=inspector_id,
        file_stream=file.file,
        filename=file.filename
    )

    return {
        "status": "Accepted",
        "message": "Video received and AI processing started.",
        "incident_id": incident_id,
        "monitoring_url": f"/incidents/{incident_id}/status"
    }

# Schema for the incoming request
class InspectionCreateRequest(BaseModel):
    site_id: int
    inspector_id: int

@app.post("/inspections")
async def create_inspection_endpoint(
    data: InspectionCreateRequest,
    request: Request
):
    """
    UI Endpoint: Initializes a new inspection session.
    The company_id is pulled from the authenticated session/state.
    """
    # 1. Access the Singleton Executor
    executor: WorkflowExecutor = request.app.state.executor
    
    # 2. Extract auth_company_id (Assuming it was set in a Middleware or Auth dependency)
    # For now, we simulate pulling it from the request state
    auth_company_id = getattr(request.state, "company_id", None)
    
    if auth_company_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        # 3. Call the Executor to handle validation and creation
        inspection_id = await executor.create_new_inspection(
            company_id=auth_company_id,
            site_id=data.site_id,
            inspector_id=data.inspector_id
        )
        
        return {
            "status": "success",
            "inspection_id": inspection_id,
            "message": "New inspection session initialized"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))