import os
import json
import logging
import asyncio
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from google.cloud import tasks_v2
from urllib.parse import urlparse, quote
from google.oauth2 import id_token
import google.auth.transport.requests

logger = logging.getLogger(__name__)

# Note: video_url is removed from payload as it's already in the DB state
class IncidentTaskPayload(BaseModel):
    incident_id: str
    company_id: int
    company_storage_id: str
    inspection_id: str
    translation_language: Optional[str] = ""
    inspector_id: Optional[int] = None

# Using global to hold the background task queue in local_gcp/local mode
_local_background_tasks = set()

def enqueue_incident_task(payload: IncidentTaskPayload):
    """
    Enqueues a task to process an incident.
    In 'local_gcp' or 'local' mode, this runs it directly as an asyncio task to simulate Cloud Tasks.
    In 'gcp' mode, it pushes to Google Cloud Tasks.
    """
    env_mode = os.getenv("ENV_MODE", "local").lower()
    
    if env_mode == "local":
        # Local development fallback: execute directly using an asyncio background task
        logger.info(f"[{env_mode}] Simulating Cloud Tasks enqueue for incident {payload.incident_id}")
        
        # We must import inside to avoid circular dependencies if task_queue is imported by main/workflowexecutor
        from main import app
        
        async def _local_task_runner():
            try:
                executor = app.state.executor
                await executor.process_incident(payload)
            except Exception as e:
                logger.error(f"Local simulated task failed for incident {payload.incident_id}: {e}", exc_info=True)
                
        # Fire and forget
        task = asyncio.create_task(_local_task_runner())
        _local_background_tasks.add(task)
        task.add_done_callback(_local_background_tasks.discard)
        return

    # Production / GCP Mode
    try:        
        # Create path where task needs to be created
        client = tasks_v2.CloudTasksClient()      
        project = os.getenv("GCP_PROJECT_ID")
        location = os.getenv("GCP_LOCATION", "us-central1")
        queue_name = os.getenv("CLOUD_TASKS_QUEUE_NAME", "inspecta-incident-queue")        
        parent = client.queue_path(project, location, queue_name)

        # Form executor service URL where the task will be delivered
        executor_url = os.getenv("EXECUTOR_BASE_URL", "https://executor-service.example.com")
        target_url = f"{executor_url.rstrip('/')}/internal/process/incident"

        # Get OIDC token
        auth_req = google.auth.transport.requests.Request()
        parsed = urlparse(target_url)
        base_audience = f"{parsed.scheme}://{parsed.netloc}"
        token = id_token.fetch_id_token(auth_req, audience=base_audience)
        oidc_token = token.strip() 

        
        # We need a service account email for OIDC auth in Cloud Tasks
        # In UI backend it uses ADC, for Cloud Tasks we explicitly set the SA email for OIDC
        # sa_email = os.getenv("GCP_SA_EMAIL")
        # if not sa_email:
        #      # Try to get it from default credentials
        #      import google.auth
        #      credentials, _ = google.auth.default()
        #      if hasattr(credentials, "service_account_email"):
        #          sa_email = credentials.service_account_email
        #      else:
        #          logger.error("GCP_SA_EMAIL is not set and could not determine from ADC.")
        #          return
                 
        # task = {
        #     "http_request": {
        #         "http_method": tasks_v2.HttpMethod.POST,
        #         "url": target_url,
        #         "oidc_token": {"service_account_email": sa_email},
        #         "headers": {"Content-Type": "application/json"},
        #         "body": payload.model_dump_json().encode(),
        #     }
        # }

        # Create Task object
        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": target_url,
                "oidc_token": oidc_token,
                "headers": {"Content-Type": "application/json"},
                "body": payload.model_dump_json().encode(),
            }
        }
        
        response = client.create_task(request={"parent": parent, "task": task})
        logger.info(f"[gcp] Successfully enqueued task {response.name} for incident {payload.incident_id}")
        
    except Exception as e:
        logger.error(f"Failed to enqueue Cloud Task for incident {payload.incident_id}: {e}", exc_info=True)
