import psycopg2
from psycopg2.extras import execute_values, Json, DictCursor
from contextlib import contextmanager
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
class InspectionRepository:
    def __init__(self, dsn: str):
        """DSN: 'dbname=... user=... password=... host=... port=...'"""
        self.dsn = dsn

    @contextmanager
    def session(self, industry_id: int):
        """
        Maintains Row-Level Security by setting the session-level 
        industry_id variable before any query is executed.
        """
        conn = psycopg2.connect(self.dsn, cursor_factory=DictCursor)
        try:
            with conn.cursor() as cur:
                # Security: Force RLS context for integer industry_id
                cur.execute("SET LOCAL app.current_industry_id = %s", (industry_id,))
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    def create_inspection(
        self, 
        industry_id: int, 
        inspector_id: int, 
        site_id: int, 
        video_url: str, 
        audio_url: Optional[str] = None,
        metadata: dict = None
    ) -> str:
        """Creates the header inspection record."""
        with self.session(industry_id) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO inspections 
                    (industry_id, inspector_id, site_id, video_url, audio_url, metadata) 
                    VALUES (%s, %s, %s, %s, %s, %s) 
                    RETURNING id
                    """,
                    (industry_id, inspector_id, site_id, video_url, audio_url, Json(metadata or {}))
                )
                return cur.fetchone()['id']

    def bulk_add_tasks(self, industry_id: int, inspection_id: str, tasks: List[Dict[str, Any]]):
        """
        High-performance bulk insert for Agent 2. 
        Expects a list of dictionaries containing task details.
        """
        # Mapping dict to tuple for execute_values
        data = [
            (
                inspection_id,
                industry_id,
                t.get('task_title'),
                t.get('task_description'),
                t.get('task_original_description'),
                t.get('video_url'),
                t.get('video_start_ms', 0),
                t.get('video_end_ms', 0),
                Json(t.get('task_artifacts', [])),
                t.get('status_id', TaskStatus.PENDING),
                t.get('severity_id', TaskSeverity.REGULAR),
                t.get('task_type_id', TaskType.VERIFY)
            )
            for t in tasks
        ]

        query = """
            INSERT INTO inspection_tasks (
                inspection_id, industry_id, task_title, task_description, 
                task_original_description, video_url, video_start_ms, video_end_ms,
                task_artifacts, status_id, severity_id, task_type_id
            ) VALUES %s
        """

        with self.session(industry_id) as conn:
            with conn.cursor() as cur:
                execute_values(cur, query, data)

    def get_tasks_for_inspection(self, industry_id: int, inspection_id: str) -> List[Dict]:
        """Fetches all tasks for a specific inspection, filtered by RLS."""
        with self.session(industry_id) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM inspection_tasks WHERE inspection_id = %s ORDER BY created_at ASC", 
                    (inspection_id,)
                )
                return [dict(row) for row in cur.fetchall()]

    def update_task_review(self, industry_id: int, task_id: str, comments: str, status_id: int):
        """Human-in-the-loop: Update task after expert review."""
        with self.session(industry_id) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE inspection_tasks 
                    SET task_review_comments = %s, status_id = %s 
                    WHERE id = %s
                    """,
                    (comments, status_id, task_id)
                )