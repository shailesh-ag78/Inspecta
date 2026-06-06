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
  headers?: Record<string, string>
): Promise<any[]> {
  const response = await callBackend<any[]>(
    `/api/incidents?siteId=${siteId}`,
    { headers }
  );
  return response.data || [];
}

export async function getIncidentsForInspection(
  inspectionId: string,
  headers?: Record<string, string>
): Promise<any[]> {
  const response = await callBackend<any[]>(
    `/api/incidents?inspectionId=${inspectionId}`,
    { headers }
  );
  return response.data || [];
}

export async function getIncident(
  incidentId: string,
  headers?: Record<string, string>
): Promise<any> {
  const response = await callBackend(
    `/api/incidents/${incidentId}`,
    { headers }
  );
  return response.data;
}

export async function createIncident(
  incident: {
    inspection_id: string;
    inspector_id: number;
    video_url: string;
    audio_url?: string;
    gps_lat?: number;
    gps_lon?: number;
    metadata?: any;
  },
  headers?: Record<string, string>
): Promise<string> {
  const response = await callBackend<{ incident_id: string }>(
    `/api/incidents`,
    {
      method: 'POST',
      body: JSON.stringify(incident),
      headers,
    }
  );
  return response.data?.incident_id || '';
}

export async function updateIncidentAudio(
  incidentId: string,
  audioUrl: string,
  headers?: Record<string, string>
): Promise<void> {
  await callBackend(
    `/api/incidents/${incidentId}/audio?audio_url=${encodeURIComponent(audioUrl)}`,
    {
      method: 'PATCH',
      headers,
    }
  );
}

export async function getIncidentProgress(
  incidentId: string,
  headers?: Record<string, string>
): Promise<any> {
  const response = await callBackend(
    `/api/incidents/${incidentId}/progress`,
    { headers }
  );
  return response.data;
}

// ============ Tasks API ============

export async function getTasksForIncident(
  incidentId: string,
  headers?: Record<string, string>
): Promise<any[]> {
  const response = await callBackend<any[]>(
    `/api/incidents/${incidentId}/tasks`,
    { headers }
  );
  return response.data || [];
}

export async function bulkAddTasks(
  incidentId: string,
  inspectionId: string,
  tasks: any[],
  headers?: Record<string, string>
): Promise<void> {
  await callBackend(
    `/api/incidents/${incidentId}/tasks/bulk?inspectionId=${inspectionId}`,
    {
      method: 'POST',
      body: JSON.stringify(tasks),
      headers,
    }
  );
}

export async function updateTask(
  taskId: string,
  taskUpdate: {
    task_title: string;
    task_description: string;
  },
  headers?: Record<string, string>
): Promise<any> {
  const response = await callBackend(
    `/api/tasks/${taskId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(taskUpdate),
      headers,
    }
  );
  return response.data;
}

export async function updateTaskReview(
  taskId: string,
  review: {
    comments: string;
    status_id: number;
  },
  headers?: Record<string, string>
): Promise<void> {
  await callBackend(
    `/api/tasks/${taskId}/review`,
    {
      method: 'PATCH',
      body: JSON.stringify(review),
      headers,
    }
  );
}

// ============ Sites API ============

export async function getAllSites(
  headers?: Record<string, string>
): Promise<any[]> {
  const response = await callBackend<any[]>(
    `/api/sites`,
    { headers }
  );
  return response.data || [];
}

export async function getSiteInspectionCombinations(
  headers?: Record<string, string>
): Promise<any[]> {
  const response = await callBackend<any[]>(
    `/api/site-inspections`,
    { headers }
  );
  return response.data || [];
}

// ============ Company API ============

export async function getCompanyInfo(
  companyId: number,
  headers?: Record<string, string>
): Promise<any> {
  const response = await callBackend(
    `/api/companies/${companyId}`,
    { headers }
  );
  return response.data;
}

// ============ Inspections API ============

export async function createInspection(
  siteId: number,
  headers?: Record<string, string>
): Promise<string> {
  const response = await callBackend<{ inspection_id: string }>(
    `/api/inspections?siteId=${siteId}`,
    {
      method: 'POST',
      headers,
    }
  );
  return response.data?.inspection_id || '';
}

export async function verifyInspectionOwnership(
  inspectionId: string,
  headers?: Record<string, string>
): Promise<boolean> {
  const response = await callBackend<{ owns: boolean }>(
    `/api/inspections/${inspectionId}/verify`,
    { headers }
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
