import os
import shutil
import uuid
import asyncio
from typing import TypedDict, Annotated, List
import operator

# LangChain / LangGraph imports
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres import PostgresSaver
from langchain_core.runnables import RunnableConfig

# Your provided Repository
from database import IncidentRepository

# --- 1. Define the State ---
# This is the "memory" passed between AI nodes
class IncidentState(TypedDict):
    company_id: int
    inspection_id: str
    incident_id: str
    video_path: str
    audio_path: str
    transcript: str
    # 'operator.add' allows nodes to append to this list without overwriting
    generated_tasks: Annotated[List[dict], operator.add]

class WorkflowExecutor:
    def __init__(self, repo: IncidentRepository, db_connection_string: str, data_dir: str = "data"):
        self.repo = repo
        self.data_dir = data_dir
        
        # Checkpointer Saves state to DB for reliability
        self.checkpointer = PostgresSaver.from_conn_string(
            db_connection_string,
            pipeline_prepend="SET search_path TO langgraph_data, public;" 
        )
        
        # Compile the workflow once during initialization
        self.workflow = self._build_graph()

    async def setup_workflow(self):
        """
        Prepares the LangGraph environment.
        1. Ensures the PostgreSQL checkpoint tables exist.
        2. Validates the connection to the DB.
        """
        try:
            # 1. Manually ensure the schema exists (the library only creates tables)
            # Use your repository's connection or a raw cursor
            with self.repo.session(company_id=0) as conn: # dummy ID for system setup
                with conn.cursor() as cur:
                    cur.execute("CREATE SCHEMA IF NOT EXISTS langgraph_data;")

            # PostgresSaver.setup() creates: 
            # 'checkpoints', 'checkpoint_blobs', and 'checkpoint_writes' tables
            await self.checkpointer.setup()
            print("✅ LangGraph Checkpointer initialized successfully.")
        except Exception as e:
            print(f"❌ Failed to initialize Checkpointer: {e}")
            raise e

    def _build_graph(self):
        """Constructs the Agentic workflow with retries and state."""
        builder = StateGraph(IncidentState)

        # Retry policy: Automatically handles API flickers or LLM timeouts
        retry_policy = {"max_attempts": 3, "backoff_factor": 2}

        # Define Nodes
        builder.add_node("extract_audio", self._extract_audio_node)
        builder.add_node("transcribe", self._transcribe_node, retry=retry_policy)
        builder.add_node("generate_tasks", self._generate_tasks_node, retry=retry_policy)

        # Define Edges
        builder.add_edge(START, "extract_audio")
        builder.add_edge("extract_audio", "transcribe")
        builder.add_edge("transcribe", "generate_tasks")
        builder.add_edge("generate_tasks", END)

        # Compile with checkpointer for pause/resume capability
        return builder.compile(checkpointer=self.checkpointer)

    # --- UI ENTRY POINT ---

    async def handle_incident_upload(
        self, 
        auth_company_id: int, 
        inspection_id: str, 
        inspector_id: int, 
        file_stream, 
        filename: str
    ) -> str:
        # 1. VERIFY OWNERSHIP FIRST
        # Check if this inspection_id belongs to this company_id
        is_valid = self.repo.verify_inspection_ownership(auth_company_id, inspection_id)
        if not is_valid:
            raise PermissionError("Security Violation: Inspection ownership mismatch.")

        company_id = auth_company_id    
        """
        METHOD CALLED FROM UI:
        1. Saves file to local/GCS
        2. Creates DB record
        3. Triggers LangGraph in background
        """
        # 1. STORAGE: Save file locally (GCS logic commented)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        local_video_path = os.path.join(self.data_dir, unique_filename)
        
        with open(local_video_path, "wb") as buffer:
            shutil.copyfileobj(file_stream, buffer)
        
        # 2. PERSISTENCE: Create the initial incident record
        # This ensures the UI can immediately see the incident exists
        incident_id = self.repo.create_incident(
            company_id=company_id,
            inspection_id=inspection_id,
            video_url=local_video_path,
            inspector_id=inspector_id
        )

        # 3. BACKGROUND: Trigger LangGraph
        # We define a 'thread_id' so the checkpointer knows this specific execution
        config = {"configurable": {"thread_id": incident_id}}
        initial_state = {
            "company_id": company_id,
            "inspection_id": inspection_id,
            "incident_id": incident_id,
            "video_path": local_video_path
        }
        
        # We do NOT 'await' this so the UI response is instant
        asyncio.create_task(self.workflow.ainvoke(initial_state, config=config))

        return incident_id

    # --- GRAPH NODES (The 'Intelligence' and 'DB Persistence' steps) ---

    async def _extract_audio_node(self, state: IncidentState):
        """Node 1: Extract Audio using FFmpeg."""
        audio_filename = f"audio_{state['incident_id']}.mp3"
        local_audio_path = os.path.join(self.data_dir, audio_filename)
        
        # FFmpeg command logic...
        # ... (implementation of FFmpeg call) ...

        # PERSISTENCE: Update the record with the audio path
        self.repo.update_incident_audio(state['company_id'], state['incident_id'], local_audio_path)
        
        return {"audio_path": local_audio_path}

    async def _transcribe_node(self, state: IncidentState):
        """Node 2: Call Transcription Agent."""
        # AGENT CALL: transcript = await transcription_agent.ainvoke(...)
        transcript = "Sample text from the video audio..." 
        
        # PERSISTENCE: Optional - Save transcript to a 'logs' or 'metadata' column
        # self.repo.update_incident_metadata(state['company_id'], state['incident_id'], {'transcript': transcript})
        
        return {"transcript": transcript}

    async def _generate_tasks_node(self, state: IncidentState):
        """Node 3: Call Task Generator Agent."""
        # AGENT CALL: tasks = await task_generator_agent.ainvoke(state['transcript'])
        tasks = [{"task_title": "Fix Damaged Wire", "severity_id": 1, "task_type_id": 2}]
        
        # PERSISTENCE: Bulk insert final tasks
        self.repo.bulk_add_incident_tasks(
            company_id=state['company_id'],
            incident_id=state['incident_id'],
            inspection_id=state['inspection_id'],
            tasks=tasks
        )
        
        return {"generated_tasks": tasks}

async def create_new_inspection(self, company_id: int, site_id: int, inspector_id: int) -> str:
        """
        Creates a master inspection record in the DB.
        The repository uses RLS to ensure the company_id is enforced.
        """
        # We use the repo you provided in database.py
        # You'll need to ensure create_inspection exists in your IncidentRepository
        inspection_id = self.repo.create_inspection(
            company_id=company_id,
            site_id=site_id,
            inspector_id=inspector_id
        )
        return inspection_id

""" Sample UI Code

const formData = new FormData();
formData.append('company_id', 101);
formData.append('inspector_id', 5);
formData.append('file', {
  uri: videoLocalUri,
  name: 'rust_inspection_video.mp4',
  type: 'video/mp4',
});

fetch('https://your-api.com/inspections/XYZ-123/upload-incident', {
  method: 'POST',
  body: formData,
  headers: { 'Content-Type': 'multipart/form-data' },
}).then(response => response.json());
"""

