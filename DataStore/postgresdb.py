import json

import psycopg
from psycopg.rows import dict_row

from contextlib import asynccontextmanager, contextmanager
from enum import IntEnum
from typing import List, Dict, Any, Optional

from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from psycopg import OperationalError, InterfaceError
from psycopg_pool import AsyncConnectionPool

# Reusable retry configuration for Neon Database
neon_retry = retry(
    reraise=True, # Critical: allows the final exception to bubble up if all retries fail
    stop=stop_after_attempt(3), # Retry up to 3 times
    wait=wait_exponential(multiplier=0.5, min=0.5, max=4), # Exponential backoff (0.5s, 1s, 2s...)
    retry=retry_if_exception_type((OperationalError, InterfaceError)) # ONLY retry on network drops
)

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

class IncidentType(IntEnum):
    INCIDENT = 0
    FIELDNOTE = 1


# import psycopg
# from psycopg import OperationalError
# from psycopg.errors import AdminShutdown, ConnectionFailure

# psycopg.errors.AdminShutdown: terminating connection due to administrator command


# try:
#     # Your database operation here
#     async with conn.cursor() as cur:
#         await cur.execute("SELECT 1")
# except AdminShutdown as e:
#     print(f"Database server is shutting down or restarting: {e}")
#     # Trigger reconnect logic
# except OperationalError as e:
#     print(f"Database connection error or connection closed: {e}")
#     # Trigger reconnect logic
# except psycopg.Error as e:
#     print(f"Generic psycopg error: {e}")


# --- 2. The Repository ---
class IncidentRepository:
    def __init__(self, dsn: str):
        """DSN: 'dbname=... user=... password=... host=... port=...'  
           Use connection pooler DSN
           Neon requires SSL. Ensure your DSN includes 'sslmode=require'.
        """
        self.dsn = dsn

        # 2. Define the local connection pool.
        # check=_check_conn: runs a lightweight ping before handing out any connection.
        # This discards connections that went BAD while idle (e.g. Neon SSL timeout)
        # so callers never see a BAD connection — the pool silently opens a fresh one.
        self.pool = AsyncConnectionPool(
            conninfo=self.dsn,
            min_size=1,
            max_size=30,        # Max 30 connections.
            max_idle=3.0,       # Prune idle connections every 3 s (below Neon's 5 s timeout)
            open=False,         # Don't open immediately on init
            check=AsyncConnectionPool.check_connection,  # Ping conn before checkout
            kwargs={
                "row_factory": dict_row,
                # TCP keepalives: detect dead connections at the OS level
                "keepalives": 1,
                "keepalives_idle": 30,
                "keepalives_interval": 10,
                "keepalives_count": 5,
            }
        )

    async def open_pool(self):
        """Call this function when starting up your application/worker."""
        await self.pool.open()

    async def close_pool(self):
        """Call this function when shutting down your application."""
        await self.pool.close()

    @asynccontextmanager
    async def session(self, company_id: int):
        """
        Maintains Row-Level Security by setting the session-level 
        company_id variable before any query is executed.
        """
        # 1. Borrow a pre-warmed connection from your pool instead of connecting fresh
        async with self.pool.connection() as conn:
            # 2. Set the RLS configuration directly on the session.
            # Notice we don't use conn.transaction() here so that individual 
            # app queries can manage their own transactions if needed.
            await conn.execute(
                "SELECT set_config('app.current_company_id', %s, true)", 
                (str(company_id),)
            )

            # 3. Hand the active connection over to your query method
            yield conn
            

    async def create_incident(
        self, 
        company_id: int,
        inspection_id: str,
        inspector_id: int, 
        video_url: str, 
        gps_coordinates: Optional[tuple] = None, # (lat, long)
        audio_url: Optional[str] = None,
        metadata: Optional[dict] = None,
        incident_type: int = 0,
        images: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """Creates the incident record linked to an inspection."""
        result = None
        async with self.session(company_id) as conn:
            # Validate tuple content before string formatting
            gps_val = None
            if gps_coordinates and len(gps_coordinates) == 2:
                lat, lon = gps_coordinates
                if lat is not None and lon is not None:
                    gps_val = f"({lat},{lon})"   # Format as '(x,y)' string for Postgres POINT type

            async with conn.transaction():
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO incidents 
                        (inspection_id, company_id, inspector_id, video_url, audio_url, metadata, gps_coordinates, incident_type, images) 
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) 
                        RETURNING id
                        """,
                        (inspection_id, company_id, inspector_id, video_url, audio_url, json.dumps(metadata or {}), gps_val, incident_type, json.dumps(images or []))
                    )
                    result = await cur.fetchone()
                    if result is None:
                        raise RuntimeError(f"Failed to create incident for inspection {inspection_id}: No ID returned.")
            return str(result['id']) 
                
    @neon_retry
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
                t.get('task_translated_title', ''),
                t.get('task_translated_description', ''),
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
                task_original_description, task_translated_title, task_translated_description, video_url, video_start_ms, video_end_ms,
                task_artifacts, status_id, severity_id, task_type_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        async with self.session(company_id) as conn:
            async with conn.transaction():
                async with conn.cursor() as cur:
                    await cur.executemany(query, data)

    @neon_retry
    async def get_tasks_for_incident(self, company_id: int, incident_id: str) -> List[Dict]:
        """Fetches all tasks for a specific incident, filtered by RLS."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT * FROM incident_tasks WHERE incident_id = %s ORDER BY created_at ASC", 
                    (incident_id,)
                )
                return [dict(row) for row in await cur.fetchall()]

    @neon_retry
    async def get_tasks_for_incidents_bulk(self, company_id: int, incident_ids: List[str]) -> List[Dict]:
        """Fetches all tasks for multiple incidents, filtered by RLS."""
        if not incident_ids:
            return []
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                # Use ANY() for postgres array lookup
                await cur.execute(
                    "SELECT * FROM incident_tasks WHERE incident_id = ANY(%s) ORDER BY created_at ASC", 
                    (incident_ids,)
                )
                return [dict(row) for row in await cur.fetchall()]

    @neon_retry
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

    @neon_retry
    async def update_incident_audio(self, company_id: int, incident_id: str, audio_path: str):
        """Updates incident with audio path and metadata."""
        async with self.session(company_id) as conn:
            async with conn.transaction():
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        UPDATE incidents 
                        SET audio_url = %s 
                        WHERE id = %s
                        """,
                        (audio_path, incident_id)
                    )

    @neon_retry
    async def update_incident_execution_status(self, company_id: int, incident_id: str, execution_status: dict):
        """Updates incident execution_status json."""
        async with self.session(company_id) as conn:
            async with conn.transaction():
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        UPDATE incidents 
                        SET execution_status = %s 
                        WHERE id = %s
                        """,
                        (json.dumps(execution_status), incident_id)
                    )

    @neon_retry
    async def update_task(self, company_id: int, task_id: str, title: str, description: str, severity_id: Optional[int] = None, status_id: Optional[int] = None):
        """Human-in-the-loop: Update task."""
        async with self.session(company_id) as conn:
            async with conn.transaction():
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        UPDATE incident_tasks 
                        SET task_title = %s, 
                            task_description = %s,
                            severity_id = COALESCE(%s, severity_id),
                            status_id = COALESCE(%s, status_id)
                        WHERE id = %s
                        RETURNING *
                        """,
                        (title, description, severity_id, status_id, task_id)
                    )
                    row = await cur.fetchone()
            return dict(row) if row else None

    @neon_retry
    async def update_task_review(self, company_id: int, task_id: str, comments: str, status_id: Optional[int] = None):
        """Human-in-the-loop: Update task after expert review."""
        async with self.session(company_id) as conn:
            async with conn.transaction():
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        UPDATE incident_tasks 
                        SET task_review_comments = %s,
                            status_id = COALESCE(%s, status_id)
                        WHERE id = %s
                        RETURNING *
                        """,
                        (comments, status_id, task_id)
                    )
                    row = await cur.fetchone()
            return dict(row) if row else None

    
    @neon_retry
    async def update_incident_summary(self, company_id: int, incident_id: str, summary: str):
        """Update incident summary"""
        async with self.session(company_id) as conn:
            async with conn.transaction():
                async with conn.cursor() as cur:    
                    await cur.execute(
                        """
                        UPDATE incidents 
                        SET summary = %s
                        WHERE id = %s
                        RETURNING *
                        """,
                        (summary, incident_id)
                    )
                    row = await cur.fetchone()
            return dict(row) if row else None

    @neon_retry
    async def create_inspection(self, company_id: int, site_id: int, friendly_name: Optional[str] = None) -> Optional[str]:
            """Inserts a new inspection record and returns the UUID."""
            async with self.session(company_id) as conn:
                async with conn.transaction():
                    async with conn.cursor() as cur:
                        await cur.execute(
                            """
                            INSERT INTO inspections (company_id, site_id, friendly_name) 
                            VALUES (%s, %s, %s) 
                            RETURNING id
                            """,
                            (company_id, site_id, friendly_name)
                        )
                        result = await cur.fetchone()
                return str(result['id']) if result else None

    @neon_retry
    async def create_site(self, company_id: int, site_name: str, address: str, industry_id: int = 1) -> int:
        """Creates a new site and returns its ID."""
        async with self.session(company_id) as conn:
            async with conn.transaction():
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO sites (company_id, site_name, address, industry_id) 
                        VALUES (%s, %s, %s, %s) 
                        RETURNING id
                        """,
                        (company_id, site_name, address, industry_id)
                    )
                    result = await cur.fetchone()
                    if result is None:
                        raise RuntimeError("Failed to create site: No ID returned.")
            return int(result['id'])

    @neon_retry
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

    @neon_retry
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

    @neon_retry
    async def verify_video_ownership(self, company_id: int, video_path: str) -> bool:
            """
            Security Check: Verifies the video path belongs to the company.
            Checks if the path contains 'CompanyStorage{company_id}' or exists in incident_tasks.
            """
            storage_folder = f"CompanyStorage{company_id}"
            if storage_folder in video_path:
                return True
                
            async with self.session(company_id) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "SELECT 1 FROM incident_tasks WHERE video_url = %s AND company_id = %s",
                        (video_path, company_id)
                    )
                    return await cur.fetchone() is not None

    @neon_retry
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

    @neon_retry
    async def get_incident_progress(self, company_id: int, incident_id: str):
        """Fetches basic status from the incident table."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT audio_url FROM incidents WHERE id = %s AND company_id = %s",
                    (incident_id, company_id)
                )
                return await cur.fetchone()
            
    @neon_retry
    async def get_sites_for_company(self, company_id: int) -> List[Dict]:
        """Fetches all sites for a specific company, filtered by RLS."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT * FROM sites WHERE company_id = %s", 
                    (company_id,)
                )
                return [dict(row) for row in await cur.fetchall()]

    @neon_retry
    async def get_incidents_for_site(self, site_id: int, company_id: int) -> List[Dict]:
        """Fetches incidents for a site by joining through inspections table."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT i.* FROM incidents i
                    INNER JOIN inspections insp ON i.inspection_id = insp.id
                    WHERE insp.site_id = %s AND i.company_id = %s AND insp.company_id = %s
                    ORDER BY i.created_at DESC
                    """,
                    (site_id, company_id, company_id)
                )
                return [dict(row) for row in await cur.fetchall()]

    @neon_retry
    async def get_incidents_for_inspection(self, inspection_id: str, company_id: int) -> List[Dict]:
        """Fetches all incidents for a specific inspection, filtered by RLS."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT * FROM incidents 
                    WHERE inspection_id = %s AND company_id = %s 
                    ORDER BY created_at DESC
                    """, 
                    (inspection_id, company_id)
                )
                return [dict(row) for row in await cur.fetchall()]
            
    @neon_retry
    async def get_site_inspection_combinations(self, company_id: int) -> List[Dict]:
        """Fetches Site-Inspection combinations for a company. Uses LEFT JOIN to include sites without inspections."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT COUNT(*) as count FROM sites WHERE company_id = %s", (company_id,))
                sites_count = await cur.fetchone()
                
                # Main query: Get sites with their inspections
                await cur.execute(
                    """
                    SELECT 
                        s.id as site_id,
                        s.site_name,
                        s.address,
                        insp.id as inspection_id,
                        insp.friendly_name as inspection_friendly_name,
                        insp.created_at as inspection_created_at
                    FROM sites s
                    LEFT JOIN inspections insp ON s.id = insp.site_id AND insp.company_id = %s
                    WHERE s.company_id = %s
                    ORDER BY s.site_name, insp.created_at DESC
                    """,
                    (company_id, company_id)
                )
                rows = [dict(row) for row in await cur.fetchall()]
                return rows

    @neon_retry
    async def get_recent_incidents(self, company_id: int, days: int = 7, limit: int = 10) -> List[Dict]:
        """Fetches incidents created in the last X days for a company, limited by limit."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, inspection_id, video_url, created_at, incident_type FROM incidents 
                    WHERE company_id = %s AND created_at >= NOW() - (%s * INTERVAL '1 day') 
                    ORDER BY created_at DESC 
                    LIMIT %s
                    """,
                    (company_id, days, limit)
                )
                return [dict(row) for row in await cur.fetchall()]

    # async def get_inspection_ids_for_incidents(self, company_id: int, incident_ids: List[str]) -> Dict[str, str]:
    #     """Fetches the inspection IDs for a list of incident IDs, returning a mapping of incident_id -> inspection_id."""
    #     if not incident_ids:
    #         return {}
    #     async with self.session(company_id) as conn:
    #         async with conn.cursor() as cur:
    #             await cur.execute(
    #                 """
    #                 SELECT id, inspection_id FROM incidents 
    #                 WHERE company_id = %s AND id = ANY(%s)
    #                 """,
    #                 (company_id, incident_ids)
    #             )
    #             rows = await cur.fetchall()
    #             return {str(row["id"]): str(row["inspection_id"]) for row in rows}

    @neon_retry
    async def get_all_incidents_for_company(self, company_id: int) -> List[Dict]:
        """Fetches all incidents for the company, filtered by RLS."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT * FROM incidents WHERE company_id = %s ORDER BY created_at DESC", 
                    (company_id,)
                )
                return [dict(row) for row in await cur.fetchall()]

    @neon_retry
    async def get_all_tasks_for_company(self, company_id: int) -> List[Dict]:
        """Fetches all tasks for the company, filtered by RLS."""
        async with self.session(company_id) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT * FROM incident_tasks WHERE company_id = %s ORDER BY created_at ASC", 
                    (company_id,)
                )
                return [dict(row) for row in await cur.fetchall()]
