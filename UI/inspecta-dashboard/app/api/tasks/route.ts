import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const incidentId = searchParams.get('incidentId');

    if (!incidentId) {
      return NextResponse.json(
        { error: 'incidentId query parameter is required' },
        { status: 400 }
      );
    }

    const result = await query(
      `SELECT 
        it.id,
        it.task_title,
        it.task_description,
        it.severity_id,
        it.status_id,
        it.task_type_id,
        it.video_start_ms,
        it.video_end_ms,
        it.video_url,
        it.task_artifacts,
        tsl.label as status_label,
        tty.label as task_type_label,
        ts.label as severity_label,
        it.created_at
      FROM incident_tasks it
      LEFT JOIN task_statuses_lookup tsl ON it.status_id = tsl.id
      LEFT JOIN task_type_lookup tty ON it.task_type_id = tty.id
      LEFT JOIN task_severity_lookup ts ON it.severity_id = ts.id
      WHERE it.incident_id = $1
      ORDER BY it.created_at ASC`,
      [incidentId]
    );

    const tasks = result.rows.map((task) => {
      // Map task_type_id to task_type string
      const taskTypeMap: Record<number, string> = {
        1: 'install',
        2: 'repair',
        3: 'verify',
        4: 'clear'
      };

      // Map status_id to task_status string
      const statusMap: Record<number, string> = {
        1: 'pending',
        2: 'in_progress',
        3: 'review',
        4: 'completed',
        5: 'failed'
      };

      return {
        id: String(task.id),
        task_title: task.task_title,
        task_description: task.task_description || '',
        severity_id: task.severity_id || 2,
        status_id: task.status_id || 1,
        task_type_id: task.task_type_id || 3,
        task_status: statusMap[task.status_id] || 'pending',
        task_type: taskTypeMap[task.task_type_id] || 'verify',
        severity_label: task.severity_label || 'Regular',
        status_label: task.status_label || 'Pending',
        start_time: Math.floor((task.video_start_ms || 0)),
        end_time: Math.floor((task.video_end_ms || 0)),
        video_url: task.video_url,
        task_artifacts: task.task_artifacts || [],
        area: 'Task Area', // Placeholder - could be extracted from artifacts
        created_at: new Date(task.created_at).toISOString(),
      };
    });

    return NextResponse.json(tasks, { status: 200 });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks', details: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const taskId = body?.id;
    const taskDescription = body?.task_description;
    const taskTitle = body?.task_title;

    if (!taskId) {
      return NextResponse.json({ error: 'Task id is required' }, { status: 400 });
    }
    if (typeof taskDescription !== 'string') {
      return NextResponse.json({ error: 'Task description must be a string' }, { status: 400 });
    }
    if (typeof taskTitle !== 'string') {
      return NextResponse.json({ error: 'Task title must be a string' }, { status: 400 });
    }

    const updateResult = await query(
      'UPDATE incident_tasks SET task_description = $1, task_title = $2 WHERE id = $3 RETURNING id, task_description, task_title',
      [taskDescription.trim(), taskTitle.trim(), taskId]
    );

    if (updateResult.rowCount === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(updateResult.rows[0], { status: 200 });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Failed to update task', details: String(error) },
      { status: 500 }
    );
  }
}
