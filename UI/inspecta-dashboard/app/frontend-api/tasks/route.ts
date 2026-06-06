import { getTasksForIncident, updateTask } from '@/lib/backend-client';
import { debug } from 'console';
import { NextRequest, NextResponse } from 'next/server';

// Helper function to map task type IDs to labels
function getTaskTypeLabel(taskTypeId: number): string {
  const labels: Record<number, string> = {
    1: 'install',
    2: 'repair',
    3: 'verify',
    4: 'clear',
  };
  return labels[taskTypeId] || 'verify';
}

// Helper function to map status IDs to labels
function getTaskStatusLabel(statusId: number): string {
  const labels: Record<number, string> = {
    1: 'pending',
    2: 'in_progress',
    3: 'review',
    4: 'completed',
    5: 'failed',
  };
  return labels[statusId] || 'pending';
}

// Helper function to map severity IDs to labels
function getSeverityLabel(severityId: number): string {
  const labels: Record<number, string> = {
    1: 'Severe',
    2: 'Regular',
    3: 'Low',
  };
  return labels[severityId] || 'Regular';
}

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

    const authHeader = request.headers.get('authorization');
    const authHeaders = authHeader ? { Authorization: authHeader } : undefined;

    const tasks = await getTasksForIncident(incidentId, authHeaders);

    const formattedTasks = tasks.map((task) => ({
      id: String(task.id),
      task_title: task.task_title,
      task_description: task.task_description || '',
      severity_id: task.severity_id || 2,
      status_id: task.status_id || 1,
      task_type_id: task.task_type_id || 3,
      task_status: getTaskStatusLabel(task.status_id),
      task_type: getTaskTypeLabel(task.task_type_id),
      severity_label: getSeverityLabel(task.severity_id),
      status_label: getTaskStatusLabel(task.status_id),
      start_time: Math.floor(task.video_start_ms || 0),
      end_time: Math.floor(task.video_end_ms || 0),
      video_url: task.video_url,
      task_artifacts: task.task_artifacts || [],
      area: 'Task Area', // Placeholder - could be extracted from artifacts
      created_at: new Date(task.created_at).toISOString(),
    }));

    const jsonstring = JSON.parse(JSON.stringify(formattedTasks));
    return NextResponse.json(jsonstring, { status: 200 });
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
      return NextResponse.json(
        { error: 'Task description must be a string' },
        { status: 400 }
      );
    }
    if (typeof taskTitle !== 'string') {
      return NextResponse.json(
        { error: 'Task title must be a string' },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get('authorization');
    const authHeaders = authHeader ? { Authorization: authHeader } : undefined;

    const updatedTask = await updateTask(taskId, {
      task_title: taskTitle,
      task_description: taskDescription,
    }, authHeaders);

    return NextResponse.json(updatedTask, { status: 200 });
  } catch (error) {
    console.error('Error updating task:', error);
    if (
      error instanceof Error &&
      error.message.includes('Task not found')
    ) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to update task', details: String(error) },
      { status: 500 }
    );
  }
}
