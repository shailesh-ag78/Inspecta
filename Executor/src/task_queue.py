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

class IncidentTaskPayload(BaseModel):
    incident_id: str
    company_id: int
    company_storage_id: str
    inspection_id: str
    translation_language: Optional[str] = ""
    inspector_id: Optional[int] = None

# Using global to hold the background task queue in local_gcp/local mode
_local_background_tasks = set()

def _get_service_account_email() -> Optional[str]:
    """Helper to retrieve GCP service account email from environment, credentials, or metadata server."""
    # 1. Check environment variable
    sa_email = os.getenv("GCP_SA_EMAIL")
    if sa_email:
        return sa_email
        
    # 2. Check default credentials
    try:
        import google.auth
        credentials, _ = google.auth.default()
        if hasattr(credentials, "service_account_email") and credentials.service_account_email:
            return credentials.service_account_email
    except Exception as e:
        logger.warning(f"Could not get service account email from default credentials: {e}")
        
    # 3. Query metadata server (GCP environment)
    try:
        import urllib.request
        req = urllib.request.Request(
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
            headers={"Metadata-Flavor": "Google"}
        )
        with urllib.request.urlopen(req, timeout=2) as response:
            return response.read().decode("utf-8").strip()
    except Exception as e:
        logger.warning(f"Could not get service account email from metadata server: {e}")
        
    return None

def enqueue_incident_task(payload: IncidentTaskPayload, executor=None):
    """
    Enqueues a task to process an incident.
    In 'local_gcp' or 'local' mode, this runs it directly as an asyncio task to simulate Cloud Tasks.
    In 'gcp' mode, it pushes to Google Cloud Tasks.
    """
    env_mode = os.getenv("ENV_MODE", "local").lower()
    
    if env_mode == "local":
        # Local development fallback: execute directly using an asyncio background task
        logger.info(f"[{env_mode}] Simulating Cloud Tasks enqueue for incident {payload.incident_id}")
        
        async def _local_task_runner():
            try:
                if not executor:
                    logger.error("Executor is required for local task simulation")
                    return
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
        executor_url = os.getenv("EXECUTOR_BASE_URL", "https://executor-service-860462670211.us-central1.run.app")
        target_url = f"{executor_url.rstrip('/')}/internal/process/incident"

        # Get Service Account email to construct the Cloud Tasks OIDC token configuration
        sa_email = _get_service_account_email()
        
        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": target_url,
                "headers": {"Content-Type": "application/json"},
                "body": payload.model_dump_json().encode(),
            }
        }
        
        if sa_email:
            task["http_request"]["oidc_token"] = {"service_account_email": sa_email}
            logger.info(f"Using Cloud Tasks managed OIDC token with service account: {sa_email}")
        else:
            # Fallback: manually fetch an OIDC token now and pass it in the Authorization header.
            # Warning: this enqueued token will expire if the task sits in the queue or fails and retries.
            try:
                auth_req = google.auth.transport.requests.Request()
                parsed = urlparse(target_url)
                base_audience = f"{parsed.scheme}://{parsed.netloc}"
                token = id_token.fetch_id_token(auth_req, audience=base_audience)
                task["http_request"]["headers"]["Authorization"] = f"Bearer {token.strip()}"
                logger.warning("No Service Account email found. Using fallback OIDC token in Authorization header.")
            except Exception as token_err:
                logger.error(f"Failed to fetch OIDC token for fallback authorization: {token_err}")
        
        response = client.create_task(request={"parent": parent, "task": task})
        logger.info(f"[gcp] Successfully enqueued task {response.name} for incident {payload.incident_id}")
        
    except Exception as e:
        logger.error(f"Failed to enqueue Cloud Task for incident {payload.incident_id}: {e}", exc_info=True)

