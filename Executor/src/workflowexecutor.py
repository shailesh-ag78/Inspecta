import asyncio
from http.client import HTTPException
from importlib import metadata
import json
import logging
from pathlib import Path
import time
from typing import Any, Literal, TypedDict, Annotated, List, Optional
from typing import cast
import operator
import httpx
import os
import sys
sys.path.append(os.getcwd())

# Import the Repository
from .database import IncidentRepository, TaskStatus, TaskSeverity, TaskType

# LangChain / LangGraph imports
from langgraph.graph import StateGraph, START, END
#from langgraph.checkpoint.postgres import PostgresSaver
#from langchain_core.runnables import RunnableConfig
from langgraph.types import RetryPolicy
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver # Use .aio

# LangSmith imports
from .langsmith_config import get_langsmith_config, WorkflowTracer

logger = logging.getLogger(__name__)

EXTRACT_AUDIO_NODE = "extract_audio"
TRANSCRIBE_NODE = "transcribe"
GENERATE_TASKS_NODE = "generate_tasks"

extract_audio_agent_url = "http://localhost:8001/extract_audio"
transcribe_agent_url = "http://localhost:8002/transcribe"
task_generator_agent_url = "http://localhost:8003/generate_tasks"

# Define your external agents
class ExternalAgentProxy:
    def __init__(self, name: str, url: str):
        self.name = name
        self.url = url
        self.tracer = WorkflowTracer()

    async def post(self, payload: dict, incident_id: str = "unknown"):
        """
        Post to external agent with error handling and LangSmith tracing.
        """
        start_time = time.time()
        try:
            # We use a long timeout because agents might take time to think
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(self.url, json=payload)
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

# --- 1. Define the State ---
# This is the "memory" passed between AI nodes
class IncidentState(TypedDict):
    company_id: int
    inspection_id: str
    incident_id: str
    video_url: str
    audio_url: str
    transcript: str
    transcript_segments_json_url: str
    # 'operator.add' allows nodes to append to this list without overwriting
    generated_tasks: Annotated[List[dict], operator.add]

class WorkflowExecutor:
    @classmethod
    async def create(cls):
        """
        The Factory Method: This is the ONLY place that knows 
        about Postgres Checkpointers.
        """
        db_dsn = "postgresql://postgres:passwd@localhost:5432/inspecta_local"
        # 1. Internalize Repository Creation
        repo = IncidentRepository(db_dsn)
        
        # 2. Internalize Checkpointer Creation
        # We create the saver but we need to manage the connection context
        manager = AsyncPostgresSaver.from_conn_string(db_dsn)
        
        # 3. MANUALLY enter the async context to get the actual saver object


        # This is where the database connection is actually opened.
        saver = await manager.__aenter__()
        
        # 4. Run LangGraph migrations (creates the necessary tables)
        await saver.setup()
        
        # 5. Return the instance with the active saver and its manager
        return cls(repo, saver, manager)
    
    def __init__(self, repo: IncidentRepository, saver: AsyncPostgresSaver, manager: Any):
        self.repo = repo
        self.tracer = WorkflowTracer()
        self.langsmith_config = get_langsmith_config()
        
        self.repo = repo
        self.saver = saver
        self._manager = manager # We store this to close the connection later

        # 4. Proxies and Graph
        # TODO: Replace with actual external http links
        self.extract_audio_agent = ExternalAgentProxy("extract_audio", extract_audio_agent_url)
        self.transcribe_agent = ExternalAgentProxy("transcribe", transcribe_agent_url)
        self.task_generator_agent = ExternalAgentProxy("generate_tasks", task_generator_agent_url)
        
        # Compile the workflow once during initialization
        self.workflow = self._build_graph()
        logger.info("✅ WorkflowExecutor initialized with LangSmith tracing")

    def _build_graph(self):
        """Constructs the Agentic workflow with retries and state."""
        builder = StateGraph(IncidentState)

        # Retry policy: Automatically handles API flickers or LLM timeouts
        retry=RetryPolicy(max_attempts=3, backoff_factor=2.0)
        builder.add_node(EXTRACT_AUDIO_NODE, self._extract_audio_node, retry_policy=retry)
        builder.add_node(TRANSCRIBE_NODE, self._transcribe_node, retry_policy=retry)
        builder.add_node(GENERATE_TASKS_NODE, self._generate_tasks_node, retry_policy=retry)


        # Define Edges
        builder.add_edge(START, EXTRACT_AUDIO_NODE)
        builder.add_edge(EXTRACT_AUDIO_NODE, TRANSCRIBE_NODE)
        builder.add_edge(TRANSCRIBE_NODE, GENERATE_TASKS_NODE)
        builder.add_edge(GENERATE_TASKS_NODE, END)

        # Compile with checkpointer for pause/resume capability
        return builder.compile(checkpointer=self.saver)

    async def close(self):
        """
        Closes the database connection pool gracefully.
        Called by main.py during server shutdown.
        """
        if self._manager:
            # This triggers the cleanup and closes the Postgres pool
            await self._manager.__aexit__(None, None, None)
            logger.info("LangGraph Checkpointer connection closed.")
            
    # --- UI ENTRY POINT ---
    async def handle_incident_upload(
        self, 
        company_id: int, 
        inspection_id: str, 
        inspector_id: int, 
        file_url: str,
        existing_incident_id: str | None, # Optional: if re-uploading for an ID
        site_id: Optional[int] = None,
        gps_coordinates: Optional[tuple] = None,  # (lat, long)
    ) -> str:
        # 1. VERIFY OWNERSHIP FIRST
        # Check if this inspection_id belongs to this company_id
        is_valid = await self.repo.verify_inspection_ownership(company_id, inspection_id)
        if not is_valid:
            raise PermissionError("Security Violation: Inspection ownership mismatch.")

        # 🛡️ SECURITY STEP 2: Validate the Incident (if ID is provided by UI)
        if existing_incident_id:
            if not await self.repo.verify_incident_ownership(company_id, existing_incident_id):
                raise PermissionError("Access Denied: Incident ownership mismatch.")
            incident_id = existing_incident_id
        else:
            # Server generates ID to ensure uniqueness and security
            # 2. PERSISTENCE: Create the initial incident record
            # This ensures the UI can immediately see the incident exists
            incident_id = await self.repo.create_incident(
                company_id=company_id,
                inspection_id=inspection_id,
                video_url=file_url,
                inspector_id=inspector_id,
                gps_coordinates=gps_coordinates
            )

        # 3. BACKGROUND: Trigger LangGraph with LangSmith tracing
        config = self.langsmith_config.create_run_config(
            thread_id=incident_id,
            incident_id=incident_id,
            company_id=company_id,
            user_id=inspector_id
        )
        
        # Tell the type checker: "This dict is specifically an IncidentState"
        input_state = cast(IncidentState, {
            "company_id": company_id,
            "inspection_id": inspection_id,
            "incident_id": incident_id,
            "video_url": file_url,
            "audio_url": "",          # Will be populated by extract_audio node
            "transcript": "",         # Initialize as empty string
            "transcript_segments_json_url": "", # Initialize as empty string
            "generated_tasks": []     # Initialize the list for operator.add
        })
        
        # We do NOT 'await' this so the UI response is instant
        task = asyncio.create_task(self.workflow.ainvoke(input_state, config=config))
        
        # Add a callback to log errors if the background graph fails
        def handle_result(t: asyncio.Task):
            try:
                t.result()
                logger.info(f"✅ Workflow completed successfully for incident {incident_id}")
            except Exception as e:
                logger.error(f"❌ Background Workflow Error for {incident_id}: {e}", exc_info=True)
                # Optionally: Update the incident status in DB to "failed"
                # try:
                #     self.update_incident_status(company_id, incident_id, "failed")
                # except Exception as db_error:
                #     logger.error(f"Failed to update incident status: {db_error}")
        
        task.add_done_callback(handle_result)
        logger.info(f"📝 Incident {incident_id} uploaded and queued for processing")

        return incident_id

    # --- GRAPH NODES (The 'Intelligence' and 'DB Persistence' steps) ---

    async def _extract_audio_node(self, state: IncidentState):
        """Node 1: Extract audio from video file"""
        incident_id = state["incident_id"]
        node_name = EXTRACT_AUDIO_NODE
        start_time = time.time()
        
        try:
            # 1. Prepare data for external agent
            data = {
                "video_url": state["video_url"],
                "metadata": {
                    "company_id": state["company_id"],
                    "inspection_id": state["inspection_id"],
                    "incident_id": incident_id
                }
            }
            
            logger.info(f"🎬 Extracting audio for incident {incident_id}")
            
            # 2. CALL EXTERNAL - LangGraph waits here!
            # It won't move to next step until this returns.
            result = await self.extract_audio_agent.post(
                data, 
                incident_id=incident_id,
                # This makes the incident_id appear in the LangSmith Trace Metadata tab
                #langsmith_extra={"metadata": {"incident_id": incident_id}}
            )
            audio_url = result.get("audio_url")
            
            if not audio_url:
                raise ValueError(
                    f"External agent at {self.extract_audio_agent.url} failed to return audio_url. "
                    f"Response: {result}"
                )
                
            # 3. PERSISTENCE: Update the record with the audio path
            await self.repo.update_incident_audio(state['company_id'], incident_id, audio_url)
            
            duration_ms = (time.time() - start_time) * 1000
            self.tracer.log_node_execution(
                node_name=node_name,
                incident_id=incident_id,
                input_data={"video_url": state["video_url"]},
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
        incident_id = state["incident_id"]
        node_name = TRANSCRIBE_NODE
        start_time = time.time()
        transcript = ""
        
        try:
            if not state.get("audio_url"):
                raise ValueError("No audio_url found in state. Audio extraction may have failed.")
            
            # Prepare data for transcription agent
            # Fetch company metadata (name + industry) from the DB so the agent can use it in prompts.
            company_name = f"Unknown Company"  # Fallback if DB lookup fails
            industry = "Unknown Industry"  # Fallback if DB lookup fails
            industry_keywords = []
            try:
                company_info = await self.repo.get_company_info(state["company_id"])
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
                "audio_url": state["audio_url"],
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

    async def _generate_tasks_node(self, state: IncidentState):
        """Node 3: Call Task Generator Agent to create inspection tasks"""
        incident_id = state["incident_id"]
        node_name = GENERATE_TASKS_NODE
        start_time = time.time()
        tasks = []
        
        try:
            transcript = state.get("transcript", "")
            if not transcript:
                logger.warning(f"⚠️  Empty transcript for {incident_id}. Task generation may be limited.")
                
            # Prepare data for report generation agent
            # Fetch company metadata (name + industry) from the DB so the agent can use it in prompts.
            company_name = f"Unknown Company"  # Fallback if DB lookup fails
            industry = "Unknown Industry"  # Fallback if DB lookup fails
            industry_keywords = []
            try:
                company_info = await self.repo.get_company_info(state["company_id"])
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
            task_count = int(result.get("tasks_count", "0"))
            logger.info(f"Received {task_count} tasks from agent.")
            
            metadata = result.get("metadata", {})
            env_mode = metadata.get("ENV_MODE", "LOCAL")
            tasks_json_url = result.get("tasks_json_url", "")
            summary, tasks = get_tasklist_from_url(tasks_json_url, video_url=state.get("video_url", ""), env_mode=env_mode)
            logger.info(f"Extracted summary: {summary}, from tasks JSON URL: {tasks_json_url}")
                
            # PERSISTENCE: Bulk insert final tasks
            await self.repo.bulk_add_incident_tasks(
                company_id=state['company_id'],
                incident_id=incident_id,
                inspection_id=state['inspection_id'],
                tasks=tasks
            )
            
            duration_ms = (time.time() - start_time) * 1000
            self.tracer.log_node_execution(
                node_name=node_name,
                incident_id=incident_id,
                input_data={"transcript_length": len(transcript)},
                output_data={"task_count": len(tasks)},
                duration_ms=duration_ms
            )
            
            logger.info(f"✅ Generated {len(tasks)} task(s) for incident {incident_id}")
            return {"generated_tasks": tasks}
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            self.tracer.log_node_execution(
                node_name=node_name,
                incident_id=incident_id,
                input_data={"transcript_length": len(state.get("transcript", ""))},
                output_data={"task_count": len(tasks)},
                duration_ms=duration_ms,
                error=e
            )
            logger.error(f"❌ Task generation failed: {e}", exc_info=True)
            raise

    async def get_status(self, company_id: int, incident_id: str):
        """
        Interfaced from UI.
        Provides granular status by checking DB and LangGraph state.
        Fixed "queued" status bug by checking if any node has actually run.
        """
        # 1. SECURITY CHECK (Ownership)
        # If this fails, the user gets nothing.
        db_record = await self.repo.get_incident_progress(company_id, incident_id)
        if not db_record:
            raise PermissionError("Unauthorized: Incident does not belong to your company.")

        # 2. GRANULAR CHECK (LangGraph Checkpointer)
        # We ask LangGraph: "Where is the thread for this incident_id?"
        config = self.langsmith_config.create_run_config(
            thread_id=incident_id,
            incident_id=incident_id,
            company_id=company_id
        )
        
        state = await self.workflow.aget_state(config)
        
        # 3. STATUS DERIVATION (FIXED)
        # Check if the workflow has produced meaningful output
        has_audio = bool(state.values.get("audio_url"))
        has_transcript = bool(state.values.get("transcript")) and \
                        state.values.get("transcript") != "[Transcription Service Placeholder] Real transcript will appear here"
        has_tasks = bool(state.values.get("generated_tasks"))
        
        # Determine current status based on execution state
        if not state.next:
            # Graph has reached END node
            if has_tasks:
                status_key = "completed"
                message = "✅ Analysis complete! Tasks generated."
            elif has_transcript:
                status_key = "processing"
                message = "Processing tasks generation..."
            elif has_audio:
                status_key = "processing"
                message = "Transcribing audio..."
            else:
                # Has not started any real work
                status_key = "queued"
                message = "⏳ Incident is queued for processing..."
        else:
            # Graph is still running
            current_node = state.next[0]
            status_key = current_node
            
            messages = {
                EXTRACT_AUDIO_NODE: "🎬 Extracting audio from video...",
                TRANSCRIBE_NODE: "🎙️ Transcribing audio to text...",
                GENERATE_TASKS_NODE: "📋 Generating inspection tasks..."
            }
            message = messages.get(current_node, f"⚙️  Processing ({current_node})...")

        logger.debug(f"Status check for {incident_id}: {status_key}")
        
        return {
            "incident_id": incident_id,
            "status": status_key,
            "display_message": message,
            "is_finished": status_key == "completed",
            "progress": {
                "audio_extracted": has_audio,
                "transcribed": has_transcript,
                "tasks_generated": has_tasks
            }
        }

    async def create_new_inspection(self, company_id: int, site_id: int) -> Optional[str]:
            """
            Creates a master inspection record in the DB.
            The repository uses RLS to ensure the company_id is enforced.
            """
            inspection_id = await self.repo.create_inspection(
                company_id=company_id,
                site_id=site_id
            )
            return inspection_id
        
def get_tasklist_from_url(tasks_json_url: str, video_url : str, env_mode: str = "LOCAL") -> tuple[str, List[dict]]:
    """
    Utility function to fetch the generated tasks JSON from a URL.
    This can be a local file path or a GCS URL depending on the environment.
    """
    summary = "No summary available."
    tasks = []
    
    if(env_mode != "local"):
        logger.info(f"Fetching tasks JSON from {tasks_json_url} in {env_mode} environment...")
        #if tasks_json_url.startswith("gs://"):
            # TO DO: Fetch from GCS
            # if not gcs_client:
            #     raise RuntimeError("GCS client not initialized")
            
            # bucket_name, blob_name = parse_gcs_url(url)
            # bucket = gcs_client.bucket(bucket_name)
            # blob = bucket.get_blob(blob_name)
            # if not blob:
            #     raise FileNotFoundError(f"File not found in GCS at {url}")
            
            # content = blob.download_as_text()
            # return json.loads(content)
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
                "task_original_description": "",
                "video_url": t.get('video_url', video_url), 
                "video_start_ms": t.get('start_time', 0),
                "video_end_ms": t.get('end_time', 0),
                "task_artifacts": [],
                "status_id": t.get('status_id', TaskStatus.PENDING),
                "severity_id": t.get('severity_id', TaskSeverity.REGULAR),
                "task_type_id": t.get('task_type', TaskType.VERIFY)
            } for t in data.get("tasks", [])
        ]
        
        #4 ToDo : Handle Clarification Needed element
        
    return summary, tasks