/**
 * Browser API client + response formatters for the Inspecta dashboard.
 *
 * In the static build there is no Next.js server, so the browser calls the
 * Python UI backend directly. The formatting that used to live in the
 * app/frontend-api/* route handlers now runs client-side here.
 */

import { auth } from './firebase';

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8080';

/** Fetch that automatically attaches the current Firebase ID token. */
export async function authenticatedFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${BACKEND_URL}${path}`;
  const headers = { ...options.headers } as Record<string, string>;

  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, { ...options, headers });
}

// ============ Label maps (ported from the frontend-api route handlers) ============

function getTaskTypeLabel(taskTypeId: number): string {
  const labels: Record<number, string> = {
    1: 'install',
    2: 'repair',
    3: 'verify',
    4: 'clear',
  };
  return labels[taskTypeId] || 'verify';
}

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

function getSeverityLabel(severityId: number): string {
  const labels: Record<number, string> = {
    1: 'Severe',
    2: 'Regular',
    3: 'Low',
  };
  return labels[severityId] || 'Regular';
}

// ============ Formatters ============

export function formatTasks(tasks: any[]): any[] {
  return (tasks || []).map((task) => ({
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
    area: 'Task Area',
    created_at: new Date(task.created_at).toISOString(),
  }));
}

export function formatIncidents(incidents: any[]): any[] {
  return (incidents || []).map((incident) => {
    const status = incident.has_pending
      ? 'pending'
      : incident.has_in_progress
        ? 'active'
        : incident.has_completed
          ? 'completed'
          : 'pending';

    const formattedDate = new Date(incident.created_at)
      .toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      .replace(',', '');

    return {
      id: String(incident.id),
      inspection_id: String(incident.inspection_id),
      title: `(${incident.id?.substring(0, 4) + 'XXX' || 'Unknown'}) -- ${formattedDate}`,
      status,
      created: new Date(incident.created_at).toISOString(),
      task_count: parseInt(incident.task_count),
    };
  });
}

export function formatSiteInspections(combinations: any[]): any[] {
  return (combinations || []).map((combo) => ({
    site_id: String(combo.site_id),
    site_name: combo.site_name,
    address: combo.address || null,
    city: combo.city || null,
    state: combo.state || null,
    zip: combo.zip || null,
    inspection_id: combo.inspection_id ? String(combo.inspection_id) : null,
    inspection_created_at: combo.inspection_created_at || null,
    label: combo.inspection_id
      ? `${combo.site_name?.substring(0, 20) || `Site ${combo.site_id}`} :: ${combo.inspection_friendly_name?.substring(0, 25) || combo.inspection_id?.substring(0, 8)}`
      : `${combo.site_name?.substring(0, 20) || `Site ${combo.site_id}`} :: No Inspection`,
  }));
}
