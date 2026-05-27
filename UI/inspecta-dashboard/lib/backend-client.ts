/**
 * Backend API client for calling the Python FastAPI backend
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8004';

interface BackendResponse<T = any> {
  status: string;
  data?: T;
  message?: string;
  detail?: string;
}

async function callBackend<T = any>(
  path: string,
  options?: RequestInit
): Promise<BackendResponse<T>> {
  const url = `${BACKEND_URL}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || error.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Backend call failed for ${path}:`, error);
    throw error;
  }
}

// ============ Incidents API ============

export async function getIncidentsForSite(
  siteId: number,
  companyId: number
): Promise<any[]> {
  const response = await callBackend<any[]>(
    `/api/incidents?siteId=${siteId}&companyId=${companyId}`
  );
  return response.data || [];
}

export async function getIncidentsForInspection(
  inspectionId: string,
  companyId: number
): Promise<any[]> {
  const response = await callBackend<any[]>(
    `/api/incidents?inspectionId=${inspectionId}&companyId=${companyId}`
  );
  return response.data || [];
}

export async function getIncident(
  incidentId: string,
  companyId: number
): Promise<any> {
  const response = await callBackend(
    `/api/incidents/${incidentId}?companyId=${companyId}`
  );
  return response.data;
}

export async function createIncident(
  companyId: number,
  incident: {
    inspection_id: string;
    inspector_id: number;
    video_url: string;
    audio_url?: string;
    gps_lat?: number;
    gps_lon?: number;
    metadata?: any;
  }
): Promise<string> {
  const response = await callBackend<{ incident_id: string }>(
    `/api/incidents?companyId=${companyId}`,
    {
      method: 'POST',
      body: JSON.stringify(incident),
    }
  );
  return response.data?.incident_id || '';
}

export async function updateIncidentAudio(
  incidentId: string,
  audioUrl: string,
  companyId: number
): Promise<void> {
  await callBackend(
    `/api/incidents/${incidentId}/audio?audio_url=${encodeURIComponent(audioUrl)}&companyId=${companyId}`,
    { method: 'PATCH' }
  );
}

export async function getIncidentProgress(
  incidentId: string,
  companyId: number
): Promise<any> {
  const response = await callBackend(
    `/api/incidents/${incidentId}/progress?companyId=${companyId}`
  );
  return response.data;
}

// ============ Tasks API ============

export async function getTasksForIncident(
  incidentId: string,
  companyId: number
): Promise<any[]> {
  const response = await callBackend<any[]>(
    `/api/incidents/${incidentId}/tasks?companyId=${companyId}`
  );
  return response.data || [];
}

export async function bulkAddTasks(
  incidentId: string,
  companyId: number,
  inspectionId: string,
  tasks: any[]
): Promise<void> {
  await callBackend(
    `/api/incidents/${incidentId}/tasks/bulk?companyId=${companyId}&inspectionId=${inspectionId}`,
    {
      method: 'POST',
      body: JSON.stringify(tasks),
    }
  );
}

export async function updateTask(
  taskId: string,
  companyId: number,
  taskUpdate: {
    task_title: string;
    task_description: string;
  }
): Promise<any> {
  const response = await callBackend(
    `/api/tasks/${taskId}?companyId=${companyId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(taskUpdate),
    }
  );
  return response.data;
}

export async function updateTaskReview(
  taskId: string,
  companyId: number,
  review: {
    comments: string;
    status_id: number;
  }
): Promise<void> {
  await callBackend(
    `/api/tasks/${taskId}/review?companyId=${companyId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(review),
    }
  );
}

// ============ Sites API ============

export async function getAllSites(
  companyId: number
): Promise<any[]> {
  const response = await callBackend<any[]>(`/api/sites?companyId=${companyId}`);
  return response.data || [];
}

export async function getSiteInspectionCombinations(
  companyId: number
): Promise<any[]> {
  const response = await callBackend<any[]>(`/api/site-inspections?companyId=${companyId}`);
  return response.data || [];
}

// ============ Company API ============

export async function getCompanyInfo(companyId: number): Promise<any> {
  const response = await callBackend(`/api/companies/${companyId}`);
  return response.data;
}

// ============ Inspections API ============

export async function createInspection(
  companyId: number,
  siteId: number
): Promise<string> {
  const response = await callBackend<{ inspection_id: string }>(
    `/api/inspections?companyId=${companyId}&siteId=${siteId}`,
    { method: 'POST' }
  );
  return response.data?.inspection_id || '';
}

export async function verifyInspectionOwnership(
  inspectionId: string,
  companyId: number
): Promise<boolean> {
  const response = await callBackend<{ owns: boolean }>(
    `/api/inspections/${inspectionId}/verify?companyId=${companyId}`
  );
  return response.data?.owns || false;
}

// ============ Enums API ============

export async function getTaskStatuses(): Promise<Record<string, number>> {
  const response = await callBackend<Record<string, number>>(
    `/api/enums/task-statuses`
  );
  return response.data || {};
}

export async function getTaskTypes(): Promise<Record<string, number>> {
  const response = await callBackend<Record<string, number>>(
    `/api/enums/task-types`
  );
  return response.data || {};
}

export async function getTaskSeverities(): Promise<Record<string, number>> {
  const response = await callBackend<Record<string, number>>(
    `/api/enums/task-severities`
  );
  return response.data || {};
}

export async function getIndustries(): Promise<Record<string, number>> {
  const response = await callBackend<Record<string, number>>(
    `/api/enums/industries`
  );
  return response.data || {};
}
