from copy import error
from httpx import _content
import os
import sys
import asyncio
from http.client import HTTPException
from importlib import metadata
import json
import logging
from pathlib import Path
import time
from typing import Any, Literal, TypedDict, Annotated, List, Optional
from typing import cast
import httpx
from google.cloud import storage
from google import genai
from pydantic import BaseModel, Field
from typing import Tuple
from urllib.parse import urlparse
import dotenv
from openai import OpenAI
from typing import Dict, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

EXTRACT_AUDIO_NODE = "extract_audio"
TRANSCRIBE_NODE = "transcribe"
GENERATE_TASKS_NODE = "generate_tasks"


# ToDo: Use Ngrok for testing Google Task locally

# Add the project root to sys.path so we can import from the 'datastore' package
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
sys.path.append(os.path.abspath(os.path.dirname(__file__)))
sys.path.append(os.getcwd())

env_path = Path(__file__).parent.parent / ".env"
dotenv.load_dotenv(dotenv_path=env_path)

# Import the Repository
from DataStore.postgresdb import IncidentRepository, TaskStatus, TaskSeverity, TaskType
from .task_queue import IncidentTaskPayload, enqueue_incident_task

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

def get_agent_endpoint(env_var_name: str, default_url: str, suffix: str) -> str:
    base_url = os.getenv(env_var_name, default_url).rstrip("/")
    # If the configured URL already ends with the path suffix, return it directly
    if base_url.endswith(suffix):
        return base_url
    return f"{base_url}{suffix}"

extract_audio_agent_url = get_agent_endpoint("AGENT_AUDIOEXTRACT_URL", "http://localhost:8001", "/extract_audio")
transcribe_agent_url = get_agent_endpoint("AGENT_TRANSCRIBE_URL", "http://localhost:8002", "/transcribe")
task_generator_agent_url = get_agent_endpoint("AGENT_TASKGENERATOR_URL", "http://localhost:8003", "/generate_tasks")

import contextvars
firebase_token_var = contextvars.ContextVar("firebase_token_var", default=None)

def get_google_oidc_token(audience: str) -> Optional[str]:
    """Fetch a Google OIDC ID token for service-to-service authentication in GCP"""
    if os.getenv("ENV_MODE", "local").lower() in ["local", "local_test"]:
        return None
    try:
        import google.auth
        import google.auth.transport.requests
        from google.oauth2 import id_token
        from urllib.parse import urlparse
        
        auth_req = google.auth.transport.requests.Request()
        parsed = urlparse(audience)
        base_audience = f"{parsed.scheme}://{parsed.netloc}"
        token = id_token.fetch_id_token(auth_req, audience=base_audience)
        return token
    except Exception as e:
        logger.warning(f"Could not fetch GCP OIDC token: {e}")
        return None

# Define your external agents
class ExternalAgentProxy:
    def __init__(self, name: str, url: str):
        self.name = name
        self.url = url
        self.tracer = WorkflowTracer()

    async def post(self, payload: dict, incident_id: str = "unknown"):
        """
        Post to external agent with error handling 
        """
        start_time = time.time()
        headers = {}
        
        # Retrieve Firebase token from context variable and inject it in the header
        token = firebase_token_var.get()
        if token:
            headers["X-Firebase-Token"] = token
            
        # Get Google OIDC token for secure service-to-service IAM auth in production
        oidc_token = get_google_oidc_token(self.url)
        if oidc_token:
            headers["Authorization"] = f"Bearer {oidc_token}"

        try:
            # We use a long timeout because agents might take time to process
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(self.url, json=payload, headers=headers)
                resp.raise_for_status()  # Ensure we don't proceed on 500 errors
                result = resp.json()
                
                # Log successful call
                duration_ms = (time.time() - start_time) * 1000
                self.tracer.log_external_agent_call(
                    agent_name=self.name,
                    agent_url=self.url,
                    incident_id=incident_id,
                    request_payload=payload,
                    response=result,
                    duration_ms=duration_ms
                )
                
                return result
                
        except httpx.HTTPStatusError as e:
            duration_ms = (time.time() - start_time) * 1000
            error_msg = f"Agent {self.name} returned {e.response.status_code}: {e.response.text}"
            self.tracer.log_external_agent_call(
                agent_name=self.name,
                agent_url=self.url,
                incident_id=incident_id,
                request_payload=payload,
                error=Exception(error_msg),
                duration_ms=duration_ms
            )
            raise
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            self.tracer.log_external_agent_call(
                agent_name=self.name,
                agent_url=self.url,
                incident_id=incident_id,
                request_payload=payload,
                error=e,
                duration_ms=duration_ms
            )
            raise

# --- 1. Define the State of the Incident ---
# This is the "memory" passed between AI nodes
class IncidentState(TypedDict, total=False):
    company_id: int
    inspection_id: str
    incident_id: str
    video_url: str
    audio_url: str
    transcript_segments_json_url: str
    tasks_json_url: str
    translation_language: str
    analysisfailed: bool
    status: str
    step: str
    error: Optional[str]
# Note : state is a dictionary and it may not have all the keys at the time of initialization.
# Do not use like url = state["audio_url"] 
#   Instead use url = state.get("audio_url", "") 


class WorkflowExecutor:
    @classmethod
    async def create(cls, db_dsn):
        """
        The Factory Method.
        """
        # 1. Internalize Repository Creation
        repo = IncidentRepository(db_dsn)
        await repo.open_pool()
        
        # 2. Return the instance
        return cls(repo)
    
    def __init__(self, repo: IncidentRepository):
        self.repo = repo
        self.tracer = WorkflowTracer()
        # self.langsmith_config = get_langsmith_config()

        # Proxies
        self.extract_audio_agent = ExternalAgentProxy("extract_audio", extract_audio_agent_url)
        self.transcribe_agent = ExternalAgentProxy("transcribe", transcribe_agent_url)
        self.task_generator_agent = ExternalAgentProxy("generate_tasks", task_generator_agent_url)

        # Maintain backgroudn tasks so that Python garbage collector doesn't delete the task mid-execution, 
        # thereby causing incident processing to randomly halt
        self.background_tasks = set()
    
        logger.info("✅ WorkflowExecutor initialized ")

    async def close(self):
        """
        Closes the database connection pools gracefully.
        Called by main.py during server shutdown.
        """
        if self.repo and hasattr(self.repo, 'close_pool'):
            await self.repo.close_pool()
            logger.info("IncidentRepository connection pool closed.")
                        
    # --- UI ENTRY POINT ---
    async def handle_incident_upload(
        self, 
        incident_id: str,
        company_id: int, 
        inspection_id: str, 
        inspector_id: int, 
        file_url: str, 
        company_storage_id: str, 
        translation_language: str = "",
        gps_coordinates: Optional[tuple] = None,  # (lat, long),
        incident_type: int = 0,
        images: Optional[List[dict]] = None
    ) -> str:
        # 1. VERIFY OWNERSHIP FIRST
        # Check if this inspection_id belongs to this company_id
        is_valid = await self.repo.verify_inspection_ownership(company_id, inspection_id)
        if not is_valid:
            raise PermissionError("Security Violation: Inspection ownership mismatch.")
            
        # 2. PERSISTENCE: Create the initial incident record
        logger.info("Images count: %s", len(images) if images else 0)
        logger.info("Image JSON : " + json.dumps(images or []))
        incident_id = await self.repo.create_incident(
            incident_id=incident_id,
            company_id=company_id,
            inspection_id=inspection_id,
            video_url=file_url,
            inspector_id=inspector_id,
            gps_coordinates=gps_coordinates,
            incident_type=incident_type,
            images=images
        )


        # 3. Queue the incident processing
        execution_status: IncidentState = {
            "company_id": company_id,
            "inspection_id": inspection_id,
            "incident_id": incident_id,
            "video_url": file_url,
            "status": "queued",
            "step": "incident_queued",
            "analysisfailed": False
        }
        await self.repo.update_incident_execution_status(company_id, incident_id, execution_status)
        logger.info(f"📝 Incident {incident_id} uploaded and queued for processing")

        # Add Task in the message queue
        payload = IncidentTaskPayload(
            incident_id=incident_id,
            company_id=company_id,
            company_storage_id=company_storage_id,
            inspection_id=inspection_id,
            inspector_id=inspector_id,
            translation_language=translation_language
        )

        enqueue_incident_task(payload, executor=self)

        return incident_id

    # --- STATELESS PYTHON WORKFLOW ---

    async def process_incident(self, payload: IncidentTaskPayload):
        incident_id = payload.incident_id
        company_id = payload.company_id
        
        try:
            incident = await self.repo.get_incident(company_id, incident_id)
            if not incident:
                raise ValueError(f"Incident {incident_id} not found")
                
            execution_status = incident.get("execution_status") or {}
            if isinstance(execution_status, str):
                execution_status = json.loads(execution_status)
                
            video_url = incident.get("video_url")
            audio_url = incident.get("audio_url")
            
            # Step 1: Extract Audio
            if not audio_url:
                execution_status.update({"status": "processing", "step": "extract_audio"})
                await self.repo.update_incident_execution_status(company_id, incident_id, execution_status)
                audio_result = await self._extract_audio_node(execution_status)
                audio_url = audio_result.get("audio_url")
                execution_status.update({"audio_url": audio_url})
                await self.repo.update_incident_execution_status(company_id, incident_id, execution_status)
            else:
                logger.info(f"⏭️ Skipping audio extraction for {incident_id} (already done)")
                
            # Step 2: Transcribe
            transcript_url = execution_status.get("transcript_segments_json_url")
            transcript_length = 0 # Just for reporting purpose
            if not transcript_url:
                execution_status.update({"status": "processing", "step": "transcribe"})
                await self.repo.update_incident_execution_status(company_id, incident_id, execution_status)
                transcribe_result = await self._transcribe_node(execution_status)
                transcript_length = len(transcribe_result.get("transcript", ""))
                transcript_url = transcribe_result.get("transcript_segments_json_url")
                execution_status.update({"transcript_segments_json_url": transcript_url})
                await self.repo.update_incident_execution_status(company_id, incident_id, execution_status)
            else:
                logger.info(f"⏭️ Skipping transcription for {incident_id} (already done)")
                
            # Step 3: Generate Tasks
            tasks_json_url = execution_status.get("tasks_json_url")
            if not tasks_json_url:
                execution_status.update({"status": "processing", "step": "generate_tasks"})
                await self.repo.update_incident_execution_status(company_id, incident_id, execution_status)
                tasks_result = await self._generate_tasks_node(execution_status, transcript_length)
                tasks_json_url = tasks_result.get("tasks_json_url")
                execution_status.update({"tasks_json_url": tasks_json_url})
                await self.repo.update_incident_execution_status(company_id, incident_id, execution_status)
            else:
                logger.info(f"⏭️ Skipping task generation for {incident_id} (already done)")

            execution_status.update({"status": "completed", "step": "incident_completed", 
                                    "analysisfailed": False, "error": None})
            await self.repo.update_incident_execution_status(company_id, incident_id, execution_status)
            logger.info(f"✅ Workflow completed successfully for incident {incident_id}")
            
        except Exception as e:
            logger.error(f"❌ Background Workflow Error for {incident_id}: {e}", exc_info=True)
            try:
                # Re-fetch incident to get latest execution_status if possible
                incident = await self.repo.get_incident(company_id, incident_id)
                execution_status = incident.get("execution_status") or {}
                if isinstance(execution_status, str):
                    execution_status = json.loads(execution_status)
                execution_status.update({"status": "failed", "error": str(e)})
                await self.repo.update_incident_execution_status(company_id, incident_id, execution_status)
            except Exception as db_err:
                logger.error(f"Failed to update execution_status to failed: {db_err}")

    # --- GRAPH NODES (The 'Intelligence' and 'DB Persistence' steps) ---

    async def _extract_audio_node(self, state: IncidentState):
        """Node 1: Extract audio from video file"""
        incident_id = state.get("incident_id")
        node_name = EXTRACT_AUDIO_NODE
        start_time = time.time()
        
        try:
            # 1. Prepare data for external agent
            data = {
                "video_url": state.get("video_url"),
                "metadata": {
                    "company_id": state.get("company_id"),
                    "inspection_id": state.get("inspection_id"),
                    "incident_id": state.get("incident_id")
                }
            }
            
            logger.info(f"🎬 Extracting audio for incident {incident_id}")
            
            # 2. CALL EXTERNAL - LangGraph waits here!
            # It won't move to next step until this returns.
            result = await self.extract_audio_agent.post(
                data, 
                incident_id=incident_id,
            )
            audio_url = result.get("audio_url")
            
            if not audio_url:
                raise ValueError(
                    f"External agent at {self.extract_audio_agent.url} failed to return audio_url. "
                    f"Response: {result}"
                )
                
            # 3. PERSISTENCE: Update the record with the audio path
            await self.repo.update_incident_audio(state.get("company_id"), state.get("incident_id"), audio_url)
            
            duration_ms = (time.time() - start_time) * 1000
            self.tracer.log_node_execution(
                node_name=node_name,
                incident_id=incident_id,
                input_data={"video_url": state.get("video_url")},
                output_data={"audio_url": audio_url},
                duration_ms=duration_ms
            )
            
            logger.info(f"✅ Audio extracted: {audio_url}")
            return {"audio_url": audio_url}
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            self.tracer.log_node_execution(
                node_name=node_name,
                incident_id=incident_id,
                input_data={"video_url": state["video_url"]},
                output_data={},
                duration_ms=duration_ms,
                error=e
            )
            logger.error(f"❌ Audio Extraction failed for {incident_id}: {str(e)}", exc_info=True)
            raise

    async def _transcribe_node(self, state: IncidentState):
        """Node 2: Call Transcription Agent to transcribe audio to text"""
        incident_id = state.get("incident_id")
        node_name = TRANSCRIBE_NODE
        start_time = time.time()
        transcript_segments_json_url = ""
        
        try:
            if not state.get("audio_url"):
                raise ValueError("No audio_url found in state. Audio extraction may have failed.")
            
            # Prepare data for transcription agent
            # Fetch company metadata (name + industry) from the DB so the agent can use it in prompts.
            company_name = f"Unknown Company"  # Fallback if DB lookup fails
            industry = "Unknown Industry"  # Fallback if DB lookup fails
            industry_keywords = []
            try:
                company_info = await self.repo.get_company_info(state.get("company_id"))
                if company_info:
                    company_name = company_info.get("company_name", company_name)
                    industry = company_info.get("industry", industry)
                    industry_keywords = company_info.get("industry_keywords") or []
            except Exception:
                # Best-effort: leave fallbacks in place even if the DB call fails
                pass

            industry_keywords_str = ", ".join([f'\"{k}\"' for k in (industry_keywords or [])])
            input_prompt = f"Industry terms: {industry_keywords_str}"
                
            data = {
                "audio_url": state.get("audio_url"),
                "metadata": {
                    "company_name": company_name,
                    "industry": industry,
                    "input_prompt": input_prompt,
                }
            }
            
            logger.info(f"🎙️ Transcribing audio for incident {incident_id}")
            
            result = await self.transcribe_agent.post(data, incident_id=incident_id)
            transcript = result.get("transcript", "")
            if not transcript:
                raise ValueError(
                    f"External agent at {self.transcribe_agent.url} failed to return transcript. "
                    f"Response: {result}"
                )
                
            transcript_segments_json_url = result.get("segments_json_url", "")
                       
            duration_ms = (time.time() - start_time) * 1000
            self.tracer.log_node_execution(
                node_name=node_name,
                incident_id=incident_id,
                input_data={"audio_url": state.get("audio_url", "")},
                output_data={"transcript_length": len(transcript)},
                duration_ms=duration_ms
            )
            
            logger.info(f"✅ Transcription complete ({len(transcript)} chars, max = 1000), segments URL: {transcript_segments_json_url}")
            return {
                "transcript": transcript,
                "transcript_segments_json_url": transcript_segments_json_url
            }
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            self.tracer.log_node_execution(
                node_name=node_name,
                incident_id=incident_id,
                input_data={"audio_url": state.get("audio_url", "")},
                output_data={"transcript_length": len(transcript)},
                duration_ms=duration_ms,
                error=e
            )
            logger.error(f"❌ Transcription failed: {e}", exc_info=True)
            raise

    async def _generate_tasks_node(self, state: IncidentState, transcript_length):
        """Node 3: Call Task Generator Agent to create inspection tasks"""
        incident_id = state.get("incident_id")
        node_name = GENERATE_TASKS_NODE
        start_time = time.time()
        tasks = []

        try:
            transcript_segments_json_url = state.get("transcript_segments_json_url", "")
            if not transcript_segments_json_url:
                logger.warning(f"⚠️  Empty transcript for {incident_id}. Task generation may be limited.")
                
            # Prepare data for report generation agent
            # Fetch company metadata (name + industry) from the DB so the agent can use it in prompts.
            company_name = f"Unknown Company"  # Fallback if DB lookup fails
            industry = "Unknown Industry"  # Fallback if DB lookup fails
            industry_keywords = []
            try:
                company_info = await self.repo.get_company_info(state.get("company_id"))
                if company_info:
                    company_name = company_info.get("company_name", company_name)
                    industry = company_info.get("industry", industry)
                    industry_keywords = company_info.get("industry_keywords") or []
            except Exception:
                # Best-effort: leave fallbacks in place even if the DB call fails
                pass

            industry_keywords_str = ", ".join([f'\"{k}\"' for k in (industry_keywords or [])])
            input_prompt = f"Industry terms: {industry_keywords_str}"
                
            data = {
                "transcript_segments_json_url": state.get("transcript_segments_json_url"),
                "metadata": {
                    "company_name": company_name,
                    "industry": industry,
                    "input_prompt": input_prompt
                }
            }
            
            logger.info(f"📋 Generating tasks for incident {incident_id}")
            
            result = await self.task_generator_agent.post(data, incident_id=incident_id)
            if(not result):
                raise ValueError(
                    f"External agent at {self.task_generator_agent.url} returned empty response. "
                )
            task_count = result.get("tasks", [])
            logger.info(f"Received {task_count} tasks from agent.")
            
            metadata = result.get("metadata", {})
            env_mode = metadata.get("ENV_MODE", "LOCAL")
            tasks_json_url = result.get("tasks_json_url", "")
            summary, tasks = get_tasklist_from_url(tasks_json_url, 
                                                video_url=state.get("video_url", ""), 
                                                translation_language = state.get("translation_language"),
                                                env_mode=env_mode)
            logger.info(f"Extracted summary from tasks JSON URL {tasks_json_url}")
                
            # PERSISTENCE: Bulk insert final tasks
            await self.repo.bulk_add_incident_tasks(
                company_id=state.get("company_id"),
                incident_id=incident_id,
                inspection_id=state.get("inspection_id"),
                tasks=tasks
            )
            # Update Incident with Summary
            await self.repo.update_incident_summary(company_id=state.get("company_id"), incident_id=incident_id, summary=summary)
            
            duration_ms = (time.time() - start_time) * 1000
            self.tracer.log_node_execution(
                node_name=node_name,
                incident_id=incident_id,
                input_data={"transcript_length": transcript_length},
                output_data={"task_count": len(tasks)},
                duration_ms=duration_ms
            )
            
            logger.info(f"✅ Generated {len(tasks)} task(s) for incident {incident_id}")
            return {"tasks_json_url": tasks_json_url,
                    "generated_tasks": tasks}
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            self.tracer.log_node_execution(
                node_name=node_name,
                incident_id=incident_id,
                input_data={"transcript_length": transcript_length},
                output_data={"task_count": len(tasks)},
                duration_ms=duration_ms,
                error=e
            )
            logger.error(f"❌ Task generation failed: {e}", exc_info=True)
            raise

    async def get_status(self, company_id: int, incident_id: str):
        # 1. SECURITY CHECK (Ownership)
        db_record = await self.repo.get_incident(company_id, incident_id)
        if not db_record:
            raise PermissionError("Unauthorized: Incident does not belong to your company.")

        # 2. STATUS DERIVATION FROM EXECUTION_STATUS
        execution_status = db_record.get("execution_status")
        if not execution_status:
            execution_status = {}
        elif isinstance(execution_status, str):
            try:
                execution_status = json.loads(execution_status)
            except Exception:
                execution_status = {}
        elif not isinstance(execution_status, dict):
            execution_status = {}

        status_key = execution_status.get("status", "processing")
        current_step = execution_status.get("step", "extract_audio")
        
        has_audio = bool(db_record.get("audio_url"))
        has_transcript = bool(execution_status.get("transcript"))
        has_tasks = bool(execution_status.get("generated_tasks"))
        
        if status_key == "failed":
            message = f"Step - Failed: {execution_status.get('error', 'Analysis failed')}"
        elif status_key == "completed":
            if has_tasks:
                message = "Step - Complete: Analysis complete! Tasks generated."
            else:
                message = "Step - Complete: Analysis complete: No tasks were generated."
        else:
            messages = {
                "extract_audio": "Step - Audio: Extracting audio...",
                "transcribe": "Step - Transcription: Transcribing audio...",
                "generate_tasks": "Step - Tasks Generation: Generating inspection tasks..."
            }
            message = messages.get(current_step, f"Processing ({current_step})")

        return {
            "incident_id": incident_id,
            "status": status_key,
            "display_message": message,
            "progress": {
                "audio_extracted": has_audio,
                "transcribed": has_transcript,
                "tasks_generated": has_tasks
            }
        }

    async def get_recent_incidents(self, company_id: int, days: int = 7, limit: int = 10) -> List[dict[str, Any]]:
        """Fetches recent incidents for a company and enriches them with their inspection IDs."""
        logger.info("Fetching recent incidents from repository")
        incidents = await self.repo.get_recent_incidents(company_id, days, limit)
        logger.info(f"Fetched {len(incidents)} recent incidents")

        if not incidents:
            return []
               
        return incidents

    async def create_new_inspection(self, company_id: int, site_id: int, friendly_name : Optional[str] = None ) -> Optional[str]:
            """
            Creates a master inspection record in the DB.
            The repository uses RLS to ensure the company_id is enforced.
            """
            inspection_id = await self.repo.create_inspection(
                company_id=company_id,
                site_id=site_id,
                friendly_name=friendly_name
            )
            return inspection_id

# ToDo: Make it async and part of WorkflowExecutor        
def translate_tasks(tasks: List[dict], translation_language: str) -> List[dict]:
    """
    Translates task titles and descriptions using Gemini 1.5 Flash.
    """
    if not tasks:
        return tasks
    # The input to the function will be a json of up to tasks_snippet objects,
    # containing `task index`, `title`, and `description` (all in English).
    tasks_snippet = []
    for i, task in enumerate(tasks):
        tasks_snippet.append({
            "task index": i,
            "title": task.get("task_title", ""),
            "description": task.get("task_description", "")
        })

    # 2. RUNTIME CONTENTS (Isolate all dynamic variables here)
    runtime_payload = {
        "tasks_to_translate": tasks_snippet,
        "target_language": translation_language
    }
    input_json_str = json.dumps(runtime_payload)

    try:
        TRANSLATION_MODEL = os.getenv("TRANSLATION_MODEL", "qwen/qwen-2.5-7b-instruct")
        openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
        openrouter_url = os.getenv("OPENROUTER_URL", "https://openrouter.ai/api/v1")
        client_kwargs = {"api_key": openrouter_api_key, "base_url": openrouter_url}

        openai_client = OpenAI(**client_kwargs)

        system_instruction = (
            "You are a stateless localization engine. "
            "Translate the provided list array of task objects from English into 'Trasnlation Language' mentioned below. "
            "You must return a raw JSON array matching this exact schema:"
            "["
            "  {"
            "    index: original_task_index"
            "    translated_title: Translated Title String"
            "    translated_description: Translated Description String"
            "  }"
            "]"
            "Strict rules for translaation:"
            "1. Do not use markdown formatting blocks (e.g., do not wrap in ```json or ```)."
            "2. No conversational greetings, and no commentary. Return only raw JSON."
            "3. The field 'index' in the output must match the 'task index' from the input."
            "4. Translation must be accurate and concise. Do not add unnecessary details."
            "5. Translation must be in the 'Trasnlation Language' mentioned below."
            "Trasnlation Language: " + translation_language    
        )

        response = openai_client.chat.completions.create(
            model=TRANSLATION_MODEL,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": input_json_str}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )

        response_text = response.choices[0].message.content.strip()
        translated_data = json.loads(response_text)

        translations_list = []
        if isinstance(translated_data, list):
            translations_list = translated_data
        elif isinstance(translated_data, dict):
            # Covert Dictionary object to List
            print("translated data : ", translated_data)
            translations_list = translated_data.get("translated_tasks", [])
            if not translations_list:
                for val in translated_data.values():
                    if isinstance(val, list):
                        translations_list = val
                        break
        else :
            print("Trasnlation task Output is not in the form of list or dictionary")

        if isinstance(translations_list, list):
            for item in translations_list:
                idx = item.get("index")
                if idx is not None:
                    try:
                        idx_int = int(idx)
                        if 0 <= idx_int < len(tasks):
                            tasks[idx_int]["task_translated_title"] = item.get("translated_title", "")
                            tasks[idx_int]["task_translated_description"] = item.get("translated_description", "")
                    except ValueError:
                        pass
    except Exception as e:
        logger.error(f"Error during Qwen task translation: {e}", exc_info=True)

    return tasks
         
# ToDo: Make it async and part of WorkflowExecutor
def get_tasklist_from_url(tasks_json_url: str, video_url : str, translation_language: str, env_mode: str = "LOCAL") -> tuple[str, List[dict]]:
    """
    Utility function to fetch the generated tasks JSON from a URL.
    This can be a local file path or a GCS URL depending on the environment.
    """
    data = ""
    summary = "No summary available."
    tasks = []
    
    if(env_mode != "local"):
         logger.info(f"Fetching tasks JSON from {tasks_json_url} in {env_mode} environment...")
         if env_mode == "local":
             datastore_path = Path(__file__).parent.parent.parent / "DataStore"
             gcp_key_file = (datastore_path / "gcp-key.json").resolve()
             gcs_client = storage.Client.from_service_account_json(gcp_key_file)
         else:
             gcs_client = storage.Client()
         
         if not gcs_client:
             raise RuntimeError("GCS client not initialized")
 
         # File name example : "gs://inspecta-file-bucket/<company_storage>/uploads/a1b2-c3d4.json"
         bucket_name, blob_name = extract_bucket_and_blob_from_gs(tasks_json_url)
         bucket = gcs_client.bucket(bucket_name)
         blob = bucket.get_blob(blob_name)
 
         if blob and blob.exists():
             # Downloads directly and parses into a Python dict
             data = json.loads(blob.download_as_text())
         else:
             raise FileNotFoundError(f"The blob {blob_name} was not found.")
    else:
         # if not os.path.exists(tasks_json_url):
         #     raise HTTPException(status_code=400, detail=f"Tasks file not found at: {tasks_json_url}")
     
         with open(tasks_json_url, "r") as f:
             data = json.load(f)
         
    # 2. Extract the Summary
    summary = data.get("summary", "No summary available.")
     
    # 3. Extract the Task List array
    tasks = [
         {
             "task_title": t.get('task_title'),
             "task_description": t.get('task_description'),
             "task_original_description": t.get('task_description'),
 
             "task_translated_title": "",
             "task_translated_description": "",
             
             "video_url": t.get('video_url', video_url), 
             "video_start_ms": t.get('start_time', 0),
             "video_end_ms": t.get('end_time', 0),
             "task_artifacts": [],
             "status_id": t.get('status_id', TaskStatus.PENDING),
             "severity_id": t.get('severity_id', TaskSeverity.REGULAR),
             "task_type_id": t.get('task_type', TaskType.VERIFY)
         } for t in data.get("tasks", [])
    ]
 
    #4 DO the translation of task title and description
    if translation_language and isinstance(translation_language, str) and translation_language.strip().lower() != "english":
        tasks = translate_tasks(tasks, translation_language)
     
    #5 ToDo : Handle Clarification Needed element  
          
    return summary, tasks

class WorkflowTracer:
    """
    Utility class for manual instrumentation of workflow steps.
    """
    def log_node_execution(
        self,
        node_name: str,
        incident_id: str,
        input_data: Dict[str, Any],
        output_data: Dict[str, Any],
        duration_ms: float,
        error: Optional[Exception] = None
    ):
        """
        Log detailed information about a node execution.
        Useful for debugging stuck workflows or performance issues.
        """
        status = "error" if error else "success"
        
        log_entry = {
            "node": node_name,
            "incident_id": incident_id,
            "status": status,
            "duration_ms": duration_ms,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "input_keys": list(input_data.keys()),
            "output_keys": list(output_data.keys()),
        }
        
        if error:
            log_entry["error"] = {
                "type": type(error).__name__,
                "message": str(error)
            }
        
        logger.info(f"Node Execution: {log_entry}")
    
    def log_external_agent_call(
        self,
        agent_name: str,
        agent_url: str,
        incident_id: str,
        request_payload: Dict[str, Any],
        response: Optional[Dict[str, Any]] = None,
        error: Optional[Exception] = None,
        duration_ms: float = 0
    ):
        """
        Log external agent API calls for debugging integration issues.
        """
        log_entry = {
            "event": "external_agent_call",
            "agent": agent_name,
            "url": agent_url,
            "incident_id": incident_id,
            "status": "error" if error else "success",
            "duration_ms": duration_ms,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        if error:
            log_entry["error"] = {
                "type": type(error).__name__,
                "message": str(error)
            }
        else:
            log_entry["response_keys"] = list(response.keys()) if response else []
        
        logger.info(f"External Agent Call: {log_entry}")
