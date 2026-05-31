import json

import psycopg
from psycopg.rows import dict_row

from contextlib import asynccontextmanager, contextmanager
from enum import IntEnum
from typing import List, Dict, Any, Optional

# --- 1. Production Enums (Matching SQL Seed Script) ---
class Industry(IntEnum):
    SOLAR = 1
    OIL_GAS = 2
    TELECOM = 3

class TaskStatus(IntEnum):
    PENDING = 1
    IN_PROGRESS = 2
    EXPERT_REVIEW = 3
    COMPLETED = 4
    FAILED = 5

class TaskSeverity(IntEnum):
    SEVERE = 1
    REGULAR = 2
    LOW = 3

class TaskType(IntEnum):
    INSTALL = 1
    REPAIR = 2
    VERIFY = 3
    CLEAR = 4

# --- 2. The Repository ---
class IncidentRepository:
    def __init__(self, dsn: str):
        """DSN: 'dbname=... user=... password=... host=... port=...'"""
        self.dsn = dsn

    @asynccontextmanager
    async def session(self, company_id: int):
        """
        Maintains Row-Level Security by setting the session-level 
        company_id variable before any query is executed.
        """
        async with await psycopg.AsyncConnection.connect(self.dsn, row_factory=dict_row) as conn:  # type: ignore
            try:
                # You can execute directly on the connection for simple setup queries
                #conn.execute("SET LOCAL app.current_company_id = %s", (company_id,))
                await conn.execute(
                    "SELECT set_config('app.current_company_id', %s, true)", 
                    (str(company_id),)
                )
                
                # yield the connection for use in the calling context
                yield conn
                # conn.commit() is automatically called by the 'with' block if no error occurs
            except Exception as e:
                # conn.rollback() is automatically called by the 'with' block on error
                raise e

    async def create_incident(
        self, 
        company_id: int,
        inspection_id: str,
        inspector_id: int, 
        video_url: str, 
        gps_coordinates: Optional[tuple] = None, # (lat, long)
        audio_url: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> str:
        """Creates the incident record linked to an inspection."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                # FIX: Validate tuple content before string formatting
                gps_val = None
                if gps_coordinates and len(gps_coordinates) == 2:
                    lat, lon = gps_coordinates
                    if lat is not None and lon is not None:
                        gps_val = f"({lat},{lon})"   # Format as '(x,y)' string for Postgres POINT type
                
                await cur.execute(
                    """
                    INSERT INTO incidents 
                    (inspection_id, company_id, inspector_id, video_url, audio_url, metadata, gps_coordinates) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s) 
                    RETURNING id
                    """,
                    (inspection_id, company_id, inspector_id, video_url, audio_url, json.dumps(metadata or {}), gps_val)
                )
                result = await cur.fetchone()
                if result is None:
                    raise RuntimeError(f"Failed to create incident for inspection {inspection_id}: No ID returned.")
                return str(result['id']) 
                
    async def bulk_add_incident_tasks(self, company_id: int, incident_id: str, inspection_id: str, tasks: List[Dict[str, Any]]):
        """
        High-performance bulk insert for Agent 2. 
        Expects a list of dictionaries containing task details.
        """
        # Mapping dict to tuple for execute_values
        data = [
            (
                incident_id,
                company_id,
                inspection_id,
                t.get('task_title'),
                t.get('task_description'),
                t.get('task_original_description'),
                t.get('video_url'),
                t.get('video_start_ms', 0),
                t.get('video_end_ms', 0),
                t.get('task_artifacts', []),
                t.get('status_id', TaskStatus.PENDING),
                t.get('severity_id', TaskSeverity.REGULAR),
                t.get('task_type_id', TaskType.VERIFY)
            )
            for t in tasks
        ]

        query = """
            INSERT INTO incident_tasks (
                incident_id, company_id, inspection_id, task_title, task_description, 
                task_original_description, video_url, video_start_ms, video_end_ms,
                task_artifacts, status_id, severity_id, task_type_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """

        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.executemany(query, data)

    async def get_tasks_for_incident(self, company_id: int, incident_id: str) -> List[Dict]:
        """Fetches all tasks for a specific incident, filtered by RLS."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT * FROM incident_tasks WHERE incident_id = %s ORDER BY created_at ASC", 
                    (incident_id,)
                )
                return [dict(row) for row in cur.fetchall()]

    async def get_incident(self, company_id: int, incident_id: str) -> Optional[Dict]:
        """Fetches incident details by ID."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT * FROM incidents WHERE id = %s", 
                    (incident_id,)
                )
                row = await cur.fetchone()
                return dict(row) if row else None

    async def update_incident_audio(self, company_id: int, incident_id: str, audio_path: str):
        """Updates incident with audio path and metadata."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    UPDATE incidents 
                    SET audio_url = %s 
                    WHERE id = %s
                    """,
                    (audio_path, incident_id)
                )

    async def update_task_review(self, company_id: int, task_id: str, comments: str, status_id: int):
        """Human-in-the-loop: Update task after expert review."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    UPDATE incident_tasks 
                    SET task_review_comments = %s, status_id = %s 
                    WHERE id = %s
                    """,
                    (comments, status_id, task_id)
                )

    async def create_inspection(self, company_id: int, site_id: int) -> Optional[str]:
            """Inserts a new inspection record and returns the UUID."""
            async with self.session(company_id) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO inspections (company_id, site_id) 
                        VALUES (%s, %s) 
                        RETURNING id
                        """,
                        (company_id, site_id)
                    )
                    result = await cur.fetchone()
                    return str(result['id']) if result else None

    async def verify_inspection_ownership(self, company_id: int, inspection_id: str) -> bool:
            """
            Verifies if an inspection belongs to the given company.
            This is a critical security check to prevent ID injection.
            """
            async with self.session(company_id) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "SELECT 1 FROM inspections WHERE id = %s AND company_id = %s",
                        (inspection_id, company_id)
                    )
                    return await cur.fetchone() is not None

    async def verify_incident_ownership(self, company_id: int, incident_id: str) -> bool:
            """
            Security Check: Verifies the incident belongs to the company.
            Used when the UI requests status or updates for an existing incident.
            """
            async with self.session(company_id) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "SELECT 1 FROM incidents WHERE id = %s AND company_id = %s",
                        (incident_id, company_id)
                    )
                    return await cur.fetchone() is not None

    async def get_company_info(self, company_id: int) -> Optional[Dict[str, Any]]:
        """Fetches company name + industry for a given company id.

        This uses the current session's company_id in order to honor RLS.
        Returns a dict like: {"company_name": "Acme Corp", "industry": "Solar", "industry_keywords": ["panel", "inverter"]}
        If the company does not exist (or is restricted by RLS), returns None.
        """
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT
                        c.name AS company_name,
                        i.name AS industry,
                        i.industry_keywords
                    FROM companies c
                    LEFT JOIN industries_lookup i ON c.industry_id = i.id
                    WHERE c.id = %s
                    """,
                    (company_id,)
                )
                row = await cur.fetchone()
                return dict(row) if row else None

    async def get_incident_progress(self, company_id: int, incident_id: str):
        """Fetches basic status from the incident table."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT audio_url FROM incidents WHERE id = %s AND company_id = %s",
                    (incident_id, company_id)
                )
                return await cur.fetchone()