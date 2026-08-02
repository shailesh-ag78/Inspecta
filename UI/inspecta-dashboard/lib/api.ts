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
    task_translated_title: task.task_translated_title || '',
    task_translated_description: task.task_translated_description || '',
    task_original_description: task.task_original_description || '',
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
  return (incidents || [])
    .filter(incident => incident.inspection_id)
    .map((incident) => {
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
  return (combinations || [])
    .filter(combo => combo.inspection_id)
    .map((combo) => ({
      site_id: String(combo.site_id),
      site_name: combo.site_name,
      address: combo.address || null,
      city: combo.city || null,
      state: combo.state || null,
      zip: combo.zip || null,
      inspection_id: String(combo.inspection_id),
      inspection_created_at: combo.inspection_created_at || null,
      label: combo.inspection_friendly_name?.substring(0, 25) || `Inspection ${combo.inspection_id?.substring(0, 8)}`,
    }));
}

/**
 * Uploads a media file (image, audio, video) for a given inspection.
 * This function handles the entire lifecycle: getting a signed URL, uploading the file,
 * and registering the incident with the backend.
 *
 * @param file The file to upload.
 * @param inspectionId The ID of the inspection to associate the file with.
 * @param onProgress A callback function to report the upload progress.
 * @returns A promise that resolves when the upload is complete.
 */
export async function uploadMediaFile(
  file: File,
  inspectionId: string,
  onProgress: (status: "Uploading" | "Processing" | "Completed" | "Failed", message?: string) => void
): Promise<{ incidentId: string; monitoringUrl: string }> {
  if (!inspectionId) {
    onProgress("Failed", "No inspection selected.");
    throw new Error("No inspection selected.");
  }

  try {
    onProgress("Uploading", `Uploading ${file.name}...`);

    const uploadUrlResp = await authenticatedFetch(
      `/api/get-upload-url?fileName=${encodeURIComponent(file.name)}`
    );
    if (!uploadUrlResp.ok) throw new Error("Failed to request upload signature");
    const uploadUrlJson = await uploadUrlResp.json();
    const {
      upload_url: uploadUrl,
      blob_name: blobName,
      storage_type: storageType,
    } = uploadUrlJson.data || {};

    if (storageType === "gcs") {
      const gcsResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!gcsResponse.ok) throw new Error(`Cloud storage upload failed: ${gcsResponse.status}`);
    } else if (storageType === "local") {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("filePath", uploadUrl);

      const localResponse = await authenticatedFetch("/api/upload-local", {
        method: "POST",
        body: formData,
      });
      if (!localResponse.ok) throw new Error(`Local storage upload failed: ${localResponse.status}`);
    } else {
      throw new Error(`Unsupported storage configuration: ${storageType}`);
    }

    onProgress("Processing", "File uploaded, registering incident...");

    const registerResp = await authenticatedFetch(
      `/api/inspections/${inspectionId}/upload-incident`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspector_id: 0, // This is filled on the backend
          file_url: uploadUrl,
          blob_name: blobName,
          translation_language: "" // This is filled on the backend
        }),
      }
    );
    if (!registerResp.ok) throw new Error("Failed to register incident record");

    const registerJson = await registerResp.json();
    const incidentId = registerJson.data?.incident_id;
    if (!incidentId) throw new Error("No incident ID returned from register");

    onProgress("Completed", "Upload complete.");
    return {
      incidentId,
      monitoringUrl: `/api/incidents/${incidentId}/status`
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "An unknown upload error occurred";
    onProgress("Failed", errorMessage);
    console.error("Incident upload failed:", err);
    throw err;
  }
}

// Stub implementations for recording and picture taking
export const recordVideo = async (): Promise<File> => { throw new Error("recordVideo not implemented"); };
export const recordAudio = async (): Promise<File> => { throw new Error("recordAudio not implemented"); };
export const takePicture = async (): Promise<File> => { throw new Error("takePicture not implemented"); };

/** Fetches recent incidents for the active company. */
export async function getRecentIncidents(days: number = 7, limit: number = 10): Promise<any[]> {
  const response = await authenticatedFetch(`/api/incidents/recent?days=${days}&limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch recent incidents: ${response.statusText}`);
  }
  const result = await response.json();
  return result.data || [];
}
