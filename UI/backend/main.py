import sys
import os
from pathlib import Path

# Windows asyncio event loop fix for Psycopg
# Must be set BEFORE importing asyncio-dependent libraries
if sys.platform == 'win32':
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Add DataStore to path so we can import postgresdb
datastore_path = Path(__file__).parent.parent.parent / "DataStore"
sys.path.append(str(datastore_path))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import asyncio
import os
from postgresdb import IncidentRepository, TaskStatus, TaskSeverity, TaskType, Industry

app = FastAPI(
    title="Inspecta UI Backend API",
    description="Backend API for Inspecta UI that wraps DataStore postgresdb.py",
    version="1.0.0"
)

# Enable CORS for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global repository
repository: Optional[IncidentRepository] = None

@app.on_event("startup")
async def startup_event():
    """Initialize connection pool and repository on application startup"""
    global repository
    
    dsn  = os.getenv("db_dsn", "postgresql://postgres:passwd@localhost:5432/inspecta_db")

    # Initialize repository with connection pool
    repository = IncidentRepository(dsn=dsn)
    
    print("✅ Connection pool initialized and ready")

@app.on_event("shutdown")
async def shutdown_event():
    """Close connection pool on application shutdown"""
    global repository
    
    if repository:
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

# ============ Health Check ============

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "Inspecta UI Backend"}

# ============ Incidents Endpoints ============

@app.get("/api/incidents")
async def get_incidents_for_site_or_inspection(
    siteId: int = Query(None, description="Site ID"),
    inspectionId: str = Query(None, description="Inspection ID"),
    companyId: int = Query(..., description="Company ID")
):
    """Fetch incidents for a given site or inspection"""
    try:
        if not siteId and not inspectionId:
            raise HTTPException(status_code=400, detail="Either siteId or inspectionId is required")
        
        if inspectionId:
            print(f"Received GET /api/incidents request for inspectionId {inspectionId} and companyId {companyId}")
            incidents = await repository.get_incidents_for_inspection(inspectionId, companyId)
        else:
            print(f"Received GET /api/incidents request for siteId {siteId} and companyId {companyId}")
            # ToDO: Implement get_incidents_for_site in repository if not already done
            # or reuse get_site_inspection_combinations() by making SiteId as optional input
            incidents = await repository.get_incidents_for_site(siteId, companyId)
        
        print(f"✅ Fetched {len(incidents)} incidents")
        return {"status": "success", "data": incidents}
    except Exception as e:
        print(f"❌ Error fetching incidents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/incidents/{incidentId}")
async def get_incident(
    incidentId: str,
    companyId: int = Query(..., description="Company ID")
):
    """Fetch a specific incident"""
    try:
        # Verify ownership
        owns = await repository.verify_incident_ownership(companyId, incidentId)
        if not owns:
            raise HTTPException(status_code=403, detail="Incident not found or access denied")
        
        incident = await repository.get_incident(companyId, incidentId)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        
        return {"status": "success", "data": incident}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/incidents")
async def create_incident(
    companyId: int = Query(..., description="Company ID"),
    incident: IncidentInput = None
):
    """Create a new incident"""
    try:
        gps_coords = None
        if incident.gps_lat is not None and incident.gps_lon is not None:
            gps_coords = (incident.gps_lat, incident.gps_lon)
        
        incident_id = await repository.create_incident(
            company_id=companyId,
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
    audio_url: str = Query(..., description="Audio URL path"),
    companyId: int = Query(..., description="Company ID")
):
    """Update incident audio URL"""
    try:
        # Verify ownership
        owns = await repository.verify_incident_ownership(companyId, incidentId)
        if not owns:
            raise HTTPException(status_code=403, detail="Incident not found or access denied")
        
        await repository.update_incident_audio(companyId, incidentId, audio_url)
        
        return {"status": "success", "message": "Audio URL updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/incidents/{incidentId}/progress")
async def get_incident_progress(
    incidentId: str,
    companyId: int = Query(..., description="Company ID")
):
    """Fetch incident progress (audio URL)"""
    try:
        progress = await repository.get_incident_progress(companyId, incidentId)
        return {"status": "success", "data": progress}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============ Tasks Endpoints ============

@app.get("/api/incidents/{incidentId}/tasks")
async def get_tasks_for_incident(
    incidentId: str,
    companyId: int = Query(..., description="Company ID")
):
    """Fetch all tasks for an incident"""
    try:
        tasks = await repository.get_tasks_for_incident(companyId, incidentId)
        return {"status": "success", "data": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/incidents/{incidentId}/tasks/bulk")
async def bulk_add_tasks(
    incidentId: str,
    companyId: int = Query(..., description="Company ID"),
    inspectionId: str = Query(..., description="Inspection ID"),
    tasks: List[TaskInput] = None
):
    """Bulk add tasks to an incident"""
    try:
        # Verify incident ownership
        owns = await repository.verify_incident_ownership(companyId, incidentId)
        if not owns:
            raise HTTPException(status_code=403, detail="Incident not found or access denied")
        
        # Convert to dict format expected by repository
        tasks_data = [task.dict() for task in tasks]
        
        await repository.bulk_add_incident_tasks(
            company_id=companyId,
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
    companyId: int = Query(..., description="Company ID"),
    task_update: TaskUpdateInput = None
):
    """Update a task's title and description"""
    try:
        updated = await repository.update_task(
            company_id=companyId,
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
    companyId: int = Query(..., description="Company ID"),
    review: TaskReviewInput = None
):
    """Update a task after expert review"""
    try:
        updated = await repository.update_task_review(
            company_id=companyId,
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
async def get_sites(
    companyId: int = Query(..., description="Company ID")
):
    """Fetch all sites for a company"""
    try:
        sites = await repository.get_sites_for_company(companyId)
        
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

# ============ Site-Inspection Endpoints ============

@app.get("/api/site-inspections")
async def get_site_inspections(
    companyId: int = Query(..., description="Company ID")
):
    """Fetch all Site-Inspection combinations for a company"""
    try:
        combinations = await repository.get_site_inspection_combinations(companyId)
        
        # Format combinations for JSON response
        formatted_combinations = []
        for combo in combinations:
            formatted_combo = {
                "site_id": str(combo.get('site_id', '')),
                "site_name": combo.get('site_name', ''),
                "address": combo.get('address', ''),
                "inspection_id": str(combo.get('inspection_id', '')) if combo.get('inspection_id') else None,
                "inspection_created_at": combo.get('inspection_created_at').isoformat() if combo.get('inspection_created_at') else None
            }
            formatted_combinations.append(formatted_combo)
        
        print(f"✅ Fetched {len(formatted_combinations)} site-inspection combinations for companyId {companyId}")
        return {"status": "success", "data": formatted_combinations}
    except Exception as e:
        print(f"❌ Error fetching site-inspections: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ============ Company Endpoints ============

@app.get("/api/companies/{companyId}")
async def get_company_info(
    companyId: int
):
    """Fetch company information"""
    try:
        company = await repository.get_company_info(companyId)
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
        
        return {"status": "success", "data": company}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============ Inspection Endpoints ============

@app.post("/api/inspections")
async def create_inspection(
    companyId: int = Query(..., description="Company ID"),
    siteId: int = Query(..., description="Site ID")
):
    """Create a new inspection"""
    try:
        inspection_id = await repository.create_inspection(companyId, siteId)
        
        return {"status": "success", "data": {"inspection_id": inspection_id}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/inspections/{inspectionId}/verify")
async def verify_inspection_ownership(
    inspectionId: str,
    companyId: int = Query(..., description="Company ID")
):
    """Verify inspection ownership"""
    try:
        owns = await repository.verify_inspection_ownership(companyId, inspectionId)
        
        return {"status": "success", "data": {"owns": owns}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        port=int(os.getenv("BACKEND_PORT", 8000))
    )
