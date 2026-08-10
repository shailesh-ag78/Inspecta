"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { themes, defaultTheme, type Theme } from '@/lib/themes';
import {
  authenticatedFetch,
  formatSiteInspections,
  formatIncidents,
  formatTasks,
  getRecentIncidents,
  uploadFileToStorage,
  registerIncident,
} from '@/lib/api';

interface SiteInspection {
  site_id: string;
  site_name: string;
  address?: string;
  inspection_id: string | null;
  inspection_created_at?: string;
  label: string;
}

interface Incident {
  id: string;
  inspection_id: string;
  title: string;
  status: string;
  created: string;
  task_count: number;
  incident_type?: string;
}

interface Task {
  id: string;
  task_title: string;
  task_description: string;
  task_translated_title?: string;
  task_translated_description?: string;
  task_original_description?: string;
  severity_id: number;
  status_id: number;
  task_type_id: number;
  task_status: string;
  task_type: string;
  severity_label: string;
  status_label: string;
  start_time: number;
  end_time: number;
  video_url?: string;
  area: string;
  created_at: string;
}

interface DashboardContextType {
  user: any;
  token: string | null;
  authLoading: boolean;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  companyName: string | null;
  companyNameLoading: boolean;
  siteInspections: SiteInspection[];
  selectedInspection: string;
  setSelectedInspection: (val: string) => void;
  siteInspectionsLoading: boolean;
  siteInspectionsError: string | null;
  incidents: Incident[];
  selectedIncidentId: string;
  setSelectedIncidentId: (val: string) => void;
  incidentsLoading: boolean;
  incidentsError: string | null;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  tasksLoading: boolean;
  tasksError: string | null;
  activeTask: Task | null;
  setActiveTask: (task: Task | null) => void;
  isAddInspectionOpen: boolean;
  setIsAddInspectionOpen: (open: boolean) => void;
  uniqueSites: any[];
  lastUploadedFileName: string | null;
  setLastUploadedFileName: (name: string | null) => void;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  handleAddInspectionSubmit: (data: {
    siteId: string | null;
    newSiteName?: string;
    newSiteAddress?: string;
    friendlyName?: string;
  }) => Promise<void>;
  handleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
  fetchSiteInspections: () => Promise<void>;
  fetchTasksForIncident: (incidentId: string) => Promise<void>;
  headerSiteName: string;
  setHeaderSiteName: (val: string) => void;
  headerInspectionName: string;
  setHeaderInspectionName: (val: string) => void;
  isIncidentPaneCollapsed: boolean;
  setIsIncidentPaneCollapsed: (val: boolean) => void;
  isSiteColumnCollapsed: boolean;
  setIsSiteColumnCollapsed: (val: boolean) => void;
  selectedMillerSites: string[];
  setSelectedMillerSites: React.Dispatch<React.SetStateAction<string[]>>;
  selectedMillerInspections: string[];
  setSelectedMillerInspections: React.Dispatch<React.SetStateAction<string[]>>;
  selectedMillerIncidents: string[];
  setSelectedMillerIncidents: React.Dispatch<React.SetStateAction<string[]>>;
  backendSites: any[];
  setBackendSites: React.Dispatch<React.SetStateAction<any[]>>;
  millerIncidents: any[];
  setMillerIncidents: React.Dispatch<React.SetStateAction<any[]>>;
  millerIncidentsLoading: boolean;
  incidentUploads: any[];
  setIncidentUploads: React.Dispatch<React.SetStateAction<any[]>>;
  notifications: any[];
  setNotifications: React.Dispatch<React.SetStateAction<any[]>>;
  isNotificationsOpen: boolean;
  setIsNotificationsOpen: (val: boolean) => void;
  pollIncidentStatus: (incidentId: string, sessionId: string) => Promise<void>;
  fetchRecentIncidents: () => Promise<void>;
  processUploadQueue: () => Promise<void>;
  clearLocalBundles: () => Promise<void>;
  showIncidents: boolean;
  setShowIncidents: (val: React.SetStateAction<boolean>) => void;
  showFieldNotes: boolean;
  setShowFieldNotes: (val: React.SetStateAction<boolean>) => void;
  incidentDateFilter: 'All' | 'Today' | 'Last week';
  setIncidentDateFilter: (val: React.SetStateAction<'All' | 'Today' | 'Last week'>) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Auth state management
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyNameLoading, setCompanyNameLoading] = useState(false);

  // States
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [siteInspections, setSiteInspections] = useState<SiteInspection[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<string>('');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Custom header site and inspection name states
  const [headerSiteName, setHeaderSiteName] = useState<string>('');
  const [headerInspectionName, setHeaderInspectionName] = useState<string>('');

  const [incidentUploads, setIncidentUploads] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);

  // Load notifications from local storage on mount
  useEffect(() => {
    const stored = localStorage.getItem("inspecta_notifications");
    if (stored) {
      try {
        setNotifications(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse notifications from localStorage", e);
      }
    }
  }, []);

  // Save notifications to local storage
  useEffect(() => {
    if (notifications.length > 0) {
      localStorage.setItem("inspecta_notifications", JSON.stringify(notifications));
    }
  }, [notifications]);

  const pollIncidentStatus = useCallback(async (incidentId: string, sessionId: string) => {
    const startTime = Date.now();
    let currentDelay = 5000;
    let timeoutId: any = null;

    const poll = async () => {
      if (Date.now() - startTime >= 180000) {
        setIncidentUploads(prev =>
          prev.map(inc => inc.id === sessionId ? { ...inc, status: "Failed", displayMessage: "Analysis failed.", pollingIntervalId: undefined } : inc)
        );
        setNotifications(prev => [
          {
            id: `notif_${Date.now()}`,
            message: `❌ Incident ${incidentId.substring(0, 4)}... analysis failed.`,
            type: 'error',
            timestamp: new Date().toLocaleTimeString(),
            read: false,
            incidentId
          },
          ...prev
        ]);
        return;
      }

      try {
        const response = await authenticatedFetch(`/api/incidents/${incidentId}/status`);
        if (!response.ok) throw new Error("Failed to fetch status");
        const statusData = await response.json();
        const statusLower = statusData.incident_status.toLowerCase();
        const isFinished = statusLower === "failed" || statusLower === "completed";
        const isFailed = statusLower === "failed";
        const statusMsg = statusData.display_message || "";
        console.log("Incident Status : ", statusMsg);

        setIncidentUploads(prev =>
          prev.map(inc => {
            if (inc.id === sessionId) {
              const mappedStatus = isFinished ? (isFailed ? "Failed" : "Completed") : "Processing";
              let mappedDisplayMessage = "";
              if (mappedStatus === "Completed") {
                mappedDisplayMessage = " ✅Analysis complete.";
              } else if (mappedStatus === "Failed") {
                mappedDisplayMessage = " ❌ Analysis failed.";
              } else {
                mappedDisplayMessage = "Analysis is in progress.";
              }
              return {
                ...inc,
                status: mappedStatus,
                displayMessage: mappedDisplayMessage
              };
            }
            return inc;
          })
        );

        if (isFinished) {
          const type = isFailed ? 'error' : 'success';
          const prefix = isFailed ? '❌' : '✅';
          setNotifications(prev => [
            {
              id: `notif_${Date.now()}`,
              message: `${prefix} Incident ${incidentId.substring(0, 4)}... ${statusMsg || (isFailed ? 'failed.' : 'completed.')}`,
              type,
              timestamp: new Date().toLocaleTimeString(),
              read: false,
              incidentId
            },
            ...prev
          ]);
          setIncidentUploads(prev =>
            prev.map(inc => inc.id === sessionId ? { ...inc, pollingIntervalId: undefined } : inc)
          );
          return;
        }
      } catch (error) {
        console.error("Error polling in context:", error);
      }

      currentDelay = Math.min(currentDelay * 1.5, 30000);
      timeoutId = setTimeout(poll, currentDelay);

      setIncidentUploads(prev =>
        prev.map(inc => inc.id === sessionId ? { ...inc, pollingIntervalId: timeoutId } : inc)
      );
    };

    poll();
  }, []);

  // IndexedDB Queue Processor
  const isProcessingQueue = useRef(false);

  const processUploadQueue = useCallback(async () => {
    if (isProcessingQueue.current) return;
    isProcessingQueue.current = true;

    try {
      // Dynamic import to avoid SSR issues if idb is used server-side
      const { getAllBundlesFromIdb, saveBundleToIdb, deleteBundleFromIdb } = await import('./idb');

      let bundles = await getAllBundlesFromIdb();
      console.log("[Debug] Received " + bundles.length + " bundles from IDB");
      let pendingBundles = bundles.filter(b => b.status === "pending" || b.status === "failed");
      console.log("[Debug] Received " + pendingBundles.length + " pending bundles from IDB");

      for (const bundle of pendingBundles) {
        // Skip if max retries hit
        if (bundle.retries >= 3) {
          continue;
        }

        bundle.status = "uploading";
        await saveBundleToIdb(bundle);

        // Update UI
        setIncidentUploads(prev =>
          prev.map(inc => inc.id === bundle.id ? { ...inc, status: "Uploading", displayMessage: `Uploading ${bundle.primaryType}...` } : inc)
        );

        try {
          console.log(`[Queue] Starting upload of bundle ${bundle.id} with ${bundle.attachedMedia?.length || 0} attachments.`);
          const additionalFileUrls: string[] = [];
          const additionalBlobs: string[] = [];

          // Upload Primary
          const primaryFile = new File([bundle.primaryBlob], bundle.primaryFilename, { type: bundle.primaryBlob.type });
          console.log(`[Queue] Uploading primary file: ${bundle.primaryFilename}`);
          const { uploadUrl: primaryUrl, blobName: primaryBlobName } = await uploadFileToStorage(primaryFile, (status, message) => {
            setIncidentUploads(prev => prev.map(inc => inc.id === bundle.id ? { ...inc, displayMessage: message || status } : inc));
          });
          console.log(`[Queue] Primary file uploaded successfully to: ${primaryUrl}`);

          // Upload Attachments sequentially
          const attachments = bundle.attachedMedia || [];
          console.log(`[Queue] Proceeding to upload ${attachments.length} attachments.`);
          for (let i = 0; i < attachments.length; i++) {
            const attachment = attachments[i];
            const attFile = new File([attachment.blob], attachment.filename, { type: attachment.blob.type });

            console.log(`[Queue] Uploading attachment ${i + 1}/${attachments.length}: ${attachment.filename}`);
            setIncidentUploads(prev => prev.map(inc => inc.id === bundle.id ? { ...inc, displayMessage: `Uploading Image ${i + 1}` } : inc));

            try {
              const { uploadUrl: attUrl, blobName: attBlobName } = await uploadFileToStorage(attFile, () => { });
              additionalFileUrls.push(attUrl);
              additionalBlobs.push(attBlobName);
              console.log(`[Queue] Attachment ${i + 1} uploaded successfully to: ${attUrl}`);
            } catch (attErr) {
              console.error(`[Queue] Failed to upload attachment ${i + 1} (${attachment.filename}):`, attErr);
              throw new Error("Attachment upload failed");
            }
          }

          // Register Incident
          setIncidentUploads(prev => prev.map(inc => inc.id === bundle.id ? { ...inc, displayMessage: "Registering incident..." } : inc));
          console.log(`[Queue] All files uploaded. Registering incident with additional ${additionalFileUrls.length} files.`);

          const imagesPayload = attachments.map((att, index) => ({
            url: additionalFileUrls[index],
            blob: additionalBlobs[index],
            timestamp_sec: att.timestampSec ?? 0
          }));

          // const { incidentId } = await registerIncident(
          //   bundle.inspectionId,
          //   primaryUrl,
          //   additionalFileUrls,
          //   primaryBlobName,
          //   additionalBlobs,
          //   bundle.category === "field_note" ? "fieldnote" : "incident",
          //   imagesPayload
          // );
          const { incidentId } = await registerIncident(
            bundle.inspectionId,
            primaryUrl,
            primaryBlobName,
            bundle.category === "field_note" ? "fieldnote" : "incident",
            imagesPayload
          );


          console.log(`[Queue] Bundle ${bundle.id} uploaded and registered completely. Incident ID: ${incidentId}`);

          // Delete from IDB on full success
          await deleteBundleFromIdb(bundle.id);
          setIncidentUploads(prev => prev.map(inc => inc.id === bundle.id ? { ...inc, status: "Processing", incidentId, displayMessage: "Upload complete, polling status..." } : inc));
          pollIncidentStatus(incidentId, bundle.id);

        } catch (err) {
          console.error(`[Queue] Bundle ${bundle.id} upload failed with error:`, err);
          await deleteBundleFromIdb(bundle.id);

          setIncidentUploads(prev => prev.map(inc => inc.id === bundle.id ? {
            ...inc,
            status: "Failed",
            displayMessage: "Upload failed."
          } : inc));
        }
      }
    } catch (e) {
      console.error("Queue processor error:", e);
    } finally {
      isProcessingQueue.current = false;
    }
  }, [pollIncidentStatus]);

  const clearLocalBundles = useCallback(async () => {
    try {
      const { clearAllBundlesFromIdb } = await import('./idb');
      await clearAllBundlesFromIdb();
      // Remove any pending/failed items from session queue
      setIncidentUploads(prev => prev.filter(inc => inc.status !== "pending" && inc.status !== "Failed"));
    } catch (e) {
      console.error("Failed to clear local bundles:", e);
    }
  }, []);

  const fetchRecentIncidents = useCallback(async () => {
    try {
      const recent = await getRecentIncidents(7, 10);
      const formattedRecent = recent.map((inc: any) => {
        let mappedStatus: "Processing" | "Completed" | "Failed";
        let mappedDisplayMessage: string;

        const lowerCaseStatus = (inc.incident_status || "").toLowerCase();

        if (lowerCaseStatus === "completed") {
          mappedStatus = "Completed";
          mappedDisplayMessage = "Analysis complete.";
        } else if (lowerCaseStatus === "failed") {
          mappedStatus = "Failed";
          mappedDisplayMessage = "Analysis failed.";
        } else {
          mappedStatus = "Processing";
          mappedDisplayMessage = "Analysis is in progress.";
        }

        return {
          id: inc.id || inc.incidentId,
          incidentId: inc.incidentId,
          fileName: `Incident ${inc.incidentId ? inc.incidentId.substring(0, 4) : ""}`,
          fileType: inc.incident_media || "",
          category: "",
          uploadedAt: inc.uploadedAt ? new Date(inc.uploadedAt).toLocaleString() : new Date().toLocaleString(),
          timestamp: inc.uploadedAt ? new Date(inc.uploadedAt).getTime() : Date.now(),
          status: mappedStatus,
          displayMessage: mappedDisplayMessage,
          inspectionName: "Inspection",
          siteName: "Site"
        };
      });

      setIncidentUploads(formattedRecent);

      // Hydrate notifications from the loaded incidents (if they are Completed or Failed)
      // Only do this if localStorage doesn't have any notifications to prevent duplicates
      const stored = localStorage.getItem("inspecta_notifications");
      if (!stored || JSON.parse(stored).length === 0) {
        const initialNotifications = formattedRecent
          .filter(inc => inc.status === "Completed" || inc.status === "Failed")
          .map(inc => {
            const isFailed = inc.status === "Failed";
            return {
              id: `notif_${inc.id}_init`,
              message: `${isFailed ? '❌' : '✅'} Incident ${inc.incidentId ? inc.incidentId.substring(0, 4) : ""}... ${inc.displayMessage || (isFailed ? 'failed.' : 'completed.')}`,
              type: isFailed ? 'error' : 'success' as 'success' | 'error',
              timestamp: inc.uploadedAt,
              read: true,
              incidentId: inc.incidentId
            };
          });
        setNotifications(initialNotifications);
      }

      // Resume polling for any running tasks
      formattedRecent.forEach(inc => {
        if (inc.status === "Processing") {
          pollIncidentStatus(inc.incidentId, inc.id);
        }
      });
    } catch (err) {
      console.error("Failed to load recent incidents in context:", err);
    }
  }, [pollIncidentStatus]);

  // Trigger loading when user successfully logs in
  useEffect(() => {
    if (token) {
      fetchRecentIncidents();
    } else {
      // Clear states when logged out
      setIncidentUploads([]);
      setNotifications([]);
      localStorage.removeItem("inspecta_notifications");
    }
  }, [token, fetchRecentIncidents]);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      incidentUploads.forEach(inc => {
        if (inc.pollingIntervalId) clearTimeout(inc.pollingIntervalId);
      });
    };
  }, [incidentUploads]);

  // Loading and error states
  const [siteInspectionsLoading, setSiteInspectionsLoading] = useState(true);
  const [siteInspectionsError, setSiteInspectionsError] = useState<string | null>(null);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Video Upload States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastUploadedFileName, setLastUploadedFileName] = useState<string | null>(null);

  // Add Inspection Modal State
  const [isAddInspectionOpen, setIsAddInspectionOpen] = useState(false);

  // Listen for Firebase auth state changes and token refreshes
  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (usr) => {
      setUser(usr);
      if (usr) {
        try {
          const idToken = await usr.getIdToken();
          setToken(idToken);
        } catch (e) {
          console.error("Error getting ID token on auth change:", e);
          setToken(null);
        }
      } else {
        setToken(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch company name when user is authenticated
  useEffect(() => {
    if (!user) {
      setCompanyName(null);
      return;
    }

    const fetchCompanyName = async () => {
      setCompanyNameLoading(true);
      try {
        setCompanyName(null);
        const response = await authenticatedFetch(`/api/companyinfo`);
        if (response.ok) {
          const res = await response.json();
          if (res.data) {
            const name = res.data.company_name || 'Unknown Company';
            setCompanyName(name.length > 15 ? name.substring(0, 15) + '...' : name);
          }
        }
      } catch (error) {
        console.error('Error fetching company name:', error);
      } finally {
        setCompanyNameLoading(false);
      }
    };
    fetchCompanyName();
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  const handleLogout = useCallback(async () => {
    try {
      await clearLocalBundles();
      await signOut(auth);
      setToken(null);
      setUser(null);
      setSiteInspections([]);
      setIncidents([]);
      setTasks([]);
      setCompanyName(null);
      setIncidentUploads([]);
      setBackendSites([]);
    } catch (e) {
      console.error('Logout error:', e);
    }
  }, [clearLocalBundles]);

  const fetchSiteInspections = useCallback(async () => {
    try {
      setSiteInspectionsLoading(true);
      setSiteInspectionsError(null);
      const response = await authenticatedFetch(`/api/site-inspections`);

      let combinedData: any[] = [];
      if (response.ok) {
        const apiResponse = await response.json();
        combinedData = formatSiteInspections(apiResponse.data || []);
      } else {
        console.warn(`Failed to fetch site-inspections: ${response.statusText}. Treating as empty list.`);
      }

      setSiteInspections(combinedData);

      // Auto-select first inspection (must have valid inspection_id)
      if (combinedData.length > 0 && combinedData[0].inspection_id) {
        setSelectedInspection(combinedData[0].inspection_id);
      } else {
        setSelectedInspection('');
      }
    } catch (error) {
      console.warn('Network error or unexpected error fetching site-inspections. Treating as empty list.', error);
      setSiteInspections([]);
      setSiteInspectionsError(null); // Do not show error message for empty/failed sites fetch
    } finally {
      setSiteInspectionsLoading(false);
    }
  }, []);

  // Fetch site-inspections when user is authenticated
  useEffect(() => {
    if (authLoading || !user) return;
    fetchSiteInspections();
  }, [user, authLoading, fetchSiteInspections]);

  // Fetch incidents/tasks when inspection changes
  useEffect(() => {
    if (authLoading || !user) return;

    const fetchCompanyWideData = async () => {
      try {
        setIncidentsLoading(true);
        setIncidentsError(null);
        setTasksLoading(true);
        setTasksError(null);

        // Reset current selections
        setSelectedIncidentId('');
        setActiveTask(null);

        // Fetch all incidents
        const incidentsResponse = await authenticatedFetch('/api/incidents');
        if (!incidentsResponse.ok) {
          throw new Error(`Failed to fetch all incidents: ${incidentsResponse.statusText}`);
        }
        const incidentsJson = await incidentsResponse.json();
        const formattedInc = formatIncidents(incidentsJson.data || []);
        setIncidents(formattedInc);

        // Fetch all tasks (only on taskmanagement page)
        if (pathname === '/taskmanagement') {
          const tasksResponse = await authenticatedFetch('/api/tasks');
          if (!tasksResponse.ok) {
            throw new Error(`Failed to fetch all tasks: ${tasksResponse.statusText}`);
          }
          const tasksJson = await tasksResponse.json();
          const formattedTsk = formatTasks(
            Array.isArray(tasksJson) ? tasksJson : (tasksJson.data || [])
          );
          setTasks(formattedTsk);
        } else {
          setTasks([]);
        }
      } catch (error) {
        console.error('Error fetching company wide data:', error);
        setIncidentsError(error instanceof Error ? error.message : 'Failed to fetch company data');
      } finally {
        setIncidentsLoading(false);
        setTasksLoading(false);
      }
    };

    if (!selectedInspection) {
      fetchCompanyWideData();
      return;
    }

    const selectedItem = siteInspections.find(
      (item) => (item.inspection_id || item.site_id) === selectedInspection
    );

    if (!selectedItem || !selectedItem.inspection_id) {
      setIncidents([]);
      setSelectedIncidentId('');
      setActiveTask(null);
      setTasks([]);
      setIncidentsLoading(false);
      setIncidentsError(null);
      return;
    }

    const fetchIncidents = async () => {
      try {
        setIncidentsLoading(true);
        setIncidentsError(null);

        setSelectedIncidentId('');
        setActiveTask(null);
        setTasks([]);

        const response = await authenticatedFetch(`/api/incidents?inspectionId=${selectedInspection}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch incidents: ${response.statusText}`);
        }

        const apiResponse = await response.json();
        const incidentsData = formatIncidents(apiResponse.data || []);
        setIncidents(incidentsData);

        if (incidentsData.length > 0) {
          setSelectedIncidentId(incidentsData[0].id);
          setActiveTask(null);
        } else {
          setSelectedIncidentId('');
          setTasks([]);
        }
      } catch (error) {
        console.error('Error fetching incidents:', error);
        setIncidentsError(error instanceof Error ? error.message : 'Failed to fetch incidents');
      } finally {
        setIncidentsLoading(false);
      }
    };

    fetchIncidents();
  }, [selectedInspection, siteInspections, user, authLoading, pathname]);

  const fetchTasksForIncident = useCallback(async (incidentId: string) => {
    try {
      setTasksLoading(true);
      setTasksError(null);

      const response = await authenticatedFetch(`/api/incidents/${incidentId}/tasks`);
      if (!response.ok) {
        throw new Error(`Failed to fetch tasks: ${response.statusText}`);
      }

      const apiResponse = await response.json();
      const tasksData = formatTasks(
        Array.isArray(apiResponse) ? apiResponse : (apiResponse.data || [])
      );
      setTasks(tasksData);
    } catch (error) {
      console.error('CRITICAL: Error fetching tasks:', error);
      setTasksError(error instanceof Error ? error.message : 'Failed to fetch tasks');
    } finally {
      setTasksLoading(false);
    }
  }, []);

  // Fetch tasks when selectedIncidentId changes
  useEffect(() => {
    if (pathname !== '/taskmanagement') return;
    if (!selectedIncidentId) {
      if (selectedInspection) {
        setTasks([]);
        setActiveTask(null);
      }
      return;
    }
    fetchTasksForIncident(selectedIncidentId);
  }, [selectedIncidentId, selectedInspection, fetchTasksForIncident, pathname]);



  const handleAddInspectionSubmit = async (data: {
    siteId: string | null;
    newSiteName?: string;
    newSiteAddress?: string;
    friendlyName?: string;
  }) => {
    document.body.style.cursor = 'wait';
    try {
      const executionPromise = (async () => {
        let targetSiteId = data.siteId;

        if (data.siteId === null) {
          if (!data.newSiteName || !data.newSiteAddress) {
            throw new Error("Site Name and Address are required to add a new site.");
          }

          const siteResponse = await authenticatedFetch('/api/sites', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              site_name: data.newSiteName,
              address: data.newSiteAddress,
            }),
          });

          if (!siteResponse.ok) {
            const errData = await siteResponse.json().catch(() => null);
            throw new Error(errData?.detail || 'Failed to create new site');
          }

          const siteResult = await siteResponse.json();
          targetSiteId = String(siteResult.data?.site_id);
        }

        if (!targetSiteId) {
          throw new Error("Invalid Site ID");
        }

        const query = data.friendlyName
          ? `/api/inspections?siteId=${targetSiteId}&friendlyName=${encodeURIComponent(data.friendlyName)}`
          : `/api/inspections?siteId=${targetSiteId}`;

        const inspectionResponse = await authenticatedFetch(query, {
          method: 'POST',
        });

        if (!inspectionResponse.ok) {
          const errData = await inspectionResponse.json().catch(() => null);
          throw new Error(errData?.detail || 'Failed to create new inspection');
        }

        const inspectionResult = await inspectionResponse.json();
        const newInspectionId = inspectionResult.data?.inspection_id;

        setIsAddInspectionOpen(false);

        await fetchSiteInspections();
        if (newInspectionId) {
          setSelectedInspection(newInspectionId);
        }
      })();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout : Failed to add new Inspection")), 60000)
      );

      await Promise.race([executionPromise, timeoutPromise]);
    } catch (error) {
      console.error("Error adding inspection:", error);
      alert(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      document.body.style.cursor = 'default';
    }
  };

  const [isIncidentPaneCollapsed, setIsIncidentPaneCollapsed] = useState(true);
  const [isSiteColumnCollapsed, setIsSiteColumnCollapsed] = useState(false);

  // The 'pathname' variable is already declared at the top of the component.
  const currentPath = pathname || '/';

  const [selectionsByPath, setSelectionsByPath] = useState<Record<string, {
    sites: string[];
    inspections: string[];
    incidents: string[];
    showIncidents?: boolean;
    showFieldNotes?: boolean;
    incidentDateFilter?: 'All' | 'Today' | 'Last week';
  }>>({});

  const [backendSites, setBackendSites] = useState<any[]>([]);

  const selectedMillerSites = selectionsByPath[currentPath]?.sites !== undefined
    ? selectionsByPath[currentPath].sites
    : backendSites.map((s: any) => String(s.site_name || s.name || ''));

  const selectedMillerInspections = selectionsByPath[currentPath]?.inspections !== undefined
    ? selectionsByPath[currentPath].inspections
    : [];

  const selectedMillerIncidents = selectionsByPath[currentPath]?.incidents !== undefined
    ? selectionsByPath[currentPath].incidents
    : [];

  const setSelectedMillerSites = useCallback((val: React.SetStateAction<string[]>) => {
    setSelectionsByPath(prev => {
      const defaultState = {
        sites: backendSites.map((s: any) => String(s.site_name || s.name || '')),
        inspections: [],
        incidents: [],
        showIncidents: currentPath === '/reports' ? false : true,
        showFieldNotes: currentPath === '/reports' ? true : false,
        incidentDateFilter: 'All' as const
      };
      const currentObj = prev[currentPath] || defaultState;
      const next = typeof val === 'function' ? (val as Function)(currentObj.sites) : val;
      return {
        ...prev,
        [currentPath]: {
          ...currentObj,
          sites: next
        }
      };
    });
  }, [currentPath, backendSites]);

  const setSelectedMillerInspections = useCallback((val: React.SetStateAction<string[]>) => {
    setSelectionsByPath(prev => {
      const defaultState = {
        sites: backendSites.map((s: any) => String(s.site_name || s.name || '')),
        inspections: [],
        incidents: [],
        showIncidents: currentPath === '/reports' ? false : true,
        showFieldNotes: currentPath === '/reports' ? true : false,
        incidentDateFilter: 'All' as const
      };
      const currentObj = prev[currentPath] || defaultState;
      const next = typeof val === 'function' ? (val as Function)(currentObj.inspections) : val;
      return {
        ...prev,
        [currentPath]: {
          ...currentObj,
          inspections: next
        }
      };
    });
  }, [currentPath, backendSites]);

  const setSelectedMillerIncidents = useCallback((val: React.SetStateAction<string[]>) => {
    setSelectionsByPath(prev => {
      const defaultState = {
        sites: backendSites.map((s: any) => String(s.site_name || s.name || '')),
        inspections: [],
        incidents: [],
        showIncidents: currentPath === '/reports' ? false : true,
        showFieldNotes: currentPath === '/reports' ? true : false,
        incidentDateFilter: 'All' as const
      };
      const currentObj = prev[currentPath] || defaultState;
      const next = typeof val === 'function' ? (val as Function)(currentObj.incidents) : val;
      return {
        ...prev,
        [currentPath]: {
          ...currentObj,
          incidents: next
        }
      };
    });
  }, [currentPath, backendSites]);

  const showIncidents = selectionsByPath[currentPath]?.showIncidents !== undefined
    ? selectionsByPath[currentPath].showIncidents
    : (currentPath === '/reports' ? false : true);

  const showFieldNotes = selectionsByPath[currentPath]?.showFieldNotes !== undefined
    ? selectionsByPath[currentPath].showFieldNotes
    : (currentPath === '/reports' ? true : false);

  const incidentDateFilter = selectionsByPath[currentPath]?.incidentDateFilter !== undefined
    ? selectionsByPath[currentPath].incidentDateFilter
    : 'All';

  const setShowIncidents = useCallback((val: React.SetStateAction<boolean>) => {
    setSelectionsByPath(prev => {
      const defaultState = {
        sites: backendSites.map((s: any) => String(s.site_name || s.name || '')),
        inspections: [],
        incidents: [],
        showIncidents: currentPath === '/reports' ? false : true,
        showFieldNotes: currentPath === '/reports' ? true : false,
        incidentDateFilter: 'All' as const
      };
      const currentObj = prev[currentPath] || defaultState;
      const next = typeof val === 'function' ? (val as Function)(currentObj.showIncidents) : val;
      return {
        ...prev,
        [currentPath]: {
          ...currentObj,
          showIncidents: next
        }
      };
    });
  }, [currentPath, backendSites]);

  const setShowFieldNotes = useCallback((val: React.SetStateAction<boolean>) => {
    setSelectionsByPath(prev => {
      const defaultState = {
        sites: backendSites.map((s: any) => String(s.site_name || s.name || '')),
        inspections: [],
        incidents: [],
        showIncidents: currentPath === '/reports' ? false : true,
        showFieldNotes: currentPath === '/reports' ? true : false,
        incidentDateFilter: 'All' as const
      };
      const currentObj = prev[currentPath] || defaultState;
      const next = typeof val === 'function' ? (val as Function)(currentObj.showFieldNotes) : val;
      return {
        ...prev,
        [currentPath]: {
          ...currentObj,
          showFieldNotes: next
        }
      };
    });
  }, [currentPath, backendSites]);

  const setIncidentDateFilter = useCallback((val: React.SetStateAction<'All' | 'Today' | 'Last week'>) => {
    setSelectionsByPath(prev => {
      const defaultState = {
        sites: backendSites.map((s: any) => String(s.site_name || s.name || '')),
        inspections: [],
        incidents: [],
        showIncidents: currentPath === '/reports' ? false : true,
        showFieldNotes: currentPath === '/reports' ? true : false,
        incidentDateFilter: 'All' as const
      };
      const currentObj = prev[currentPath] || defaultState;
      const next = typeof val === 'function' ? (val as Function)(currentObj.incidentDateFilter) : val;
      return {
        ...prev,
        [currentPath]: {
          ...currentObj,
          incidentDateFilter: next
        }
      };
    });
  }, [currentPath, backendSites]);

  useEffect(() => {
    const getSites = async () => {
      try {
        const res = await authenticatedFetch('/api/sites');
        if (res.ok) {
          const json = await res.json();
          const list = json.data || json || [];
          setBackendSites(list);
          setSelectedMillerSites(list.map((s: any) => String(s.site_name || s.name || '')));
        }
      } catch (e) {
        console.error("Error fetching backend sites:", e);
      }
    };
    if (token) {
      getSites();
    }
  }, [token, token]);

  useEffect(() => {
    const availableIns = siteInspections.filter(ins => selectedMillerSites.includes(ins.site_name));
    setSelectedMillerInspections(prev => {
      const next = prev.filter(id => availableIns.some(ins => String(ins.inspection_id || ins.site_id) === id));
      if (next.length === 0 && availableIns.length > 0) {
        return availableIns.map(ins => String(ins.inspection_id || ins.site_id)).filter(Boolean);
      }
      return next;
    });
  }, [selectedMillerSites, siteInspections]);

  const [millerIncidents, setMillerIncidents] = useState<any[]>([]);
  const [millerIncidentsLoading, setMillerIncidentsLoading] = useState(false);
  useEffect(() => {
    const fetchIncidentsForMiller = async () => {
      if (selectedMillerInspections.length === 0) {
        setMillerIncidents([]);
        setSelectedMillerIncidents([]);
        return;
      }
      try {
        setMillerIncidentsLoading(true);
        const promises = selectedMillerInspections.map(async (insId) => {
          const res = await authenticatedFetch(`/api/incidents?inspectionId=${insId}`);
          if (!res.ok) return [];
          const json = await res.json();
          return formatIncidents(json.data || []);
        });
        const results = await Promise.all(promises);
        const mergedIncidents = results.flat();
        setMillerIncidents(mergedIncidents);
        setSelectedMillerIncidents(prev => {
          const next = prev.filter(id => mergedIncidents.some(inc => inc.id === id));
          if (next.length === 0 && mergedIncidents.length > 0) {
            return mergedIncidents.map(i => i.id);
          }
          return next;
        });
      } catch (e) {
        console.error("Error fetching incidents for Miller columns:", e);
      } finally {
        setMillerIncidentsLoading(false);
      }
    };
    fetchIncidentsForMiller();
  }, [selectedMillerInspections]);

  useEffect(() => {
    const fetchTasksForSelectedIncidents = async () => {
      if (selectedMillerIncidents.length === 0) {
        setTasks([]);
        return;
      }
      try {
        const promises = selectedMillerIncidents.map(async (incId) => {
          const res = await authenticatedFetch(`/api/incidents/${incId}/tasks`);
          if (!res.ok) return [];
          const json = await res.json();
          return formatTasks(Array.isArray(json) ? json : (json.data || []));
        });
        const results = await Promise.all(promises);
        const mergedTasks = results.flat();
        mergedTasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setTasks(mergedTasks);
      } catch (e) {
        console.error("Error fetching tasks for Miller incidents:", e);
      }
    };
    if (pathname !== '/taskmanagement') return;
    fetchTasksForSelectedIncidents();
  }, [selectedMillerIncidents, setTasks, pathname]);

  const uniqueSites = Array.from(
    new Map(
      siteInspections.map((item) => [
        item.site_id,
        { id: item.site_id, name: item.site_name, address: item.address }
      ])
    ).values()
  );

  return (
    <DashboardContext.Provider
      value={{
        user,
        token,
        authLoading,
        theme,
        setTheme,
        companyName,
        companyNameLoading,
        siteInspections,
        selectedInspection,
        setSelectedInspection,
        siteInspectionsLoading,
        siteInspectionsError,
        incidents,
        selectedIncidentId,
        setSelectedIncidentId,
        incidentsLoading,
        incidentsError,
        tasks,
        setTasks,
        tasksLoading,
        tasksError,
        activeTask,
        setActiveTask,
        isAddInspectionOpen,
        setIsAddInspectionOpen,
        uniqueSites,
        lastUploadedFileName,
        setLastUploadedFileName,
        selectedFile,
        setSelectedFile,
        handleAddInspectionSubmit,
        handleLogin,
        handleLogout,
        fetchSiteInspections,
        fetchTasksForIncident,
        headerSiteName,
        setHeaderSiteName,
        headerInspectionName,
        setHeaderInspectionName,
        isIncidentPaneCollapsed,
        setIsIncidentPaneCollapsed,
        isSiteColumnCollapsed,
        setIsSiteColumnCollapsed,
        selectedMillerSites,
        setSelectedMillerSites,
        selectedMillerInspections,
        setSelectedMillerInspections,
        selectedMillerIncidents,
        setSelectedMillerIncidents,
        backendSites,
        setBackendSites,
        millerIncidents,
        setMillerIncidents,
        millerIncidentsLoading,
        incidentUploads,
        setIncidentUploads,
        notifications,
        setNotifications,
        isNotificationsOpen,
        setIsNotificationsOpen,
        pollIncidentStatus,
        fetchRecentIncidents,
        processUploadQueue,
        clearLocalBundles,
        showIncidents,
        setShowIncidents,
        showFieldNotes,
        setShowFieldNotes,
        incidentDateFilter,
        setIncidentDateFilter,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
