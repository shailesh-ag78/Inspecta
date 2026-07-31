"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { themes, defaultTheme, type Theme } from '@/lib/themes';
import {
  authenticatedFetch,
  formatSiteInspections,
  formatIncidents,
  formatTasks,
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
  uploadIncidentVideo: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
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
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
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

  // Listen for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (usr) => {
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

  const handleLogout = async () => {
    await signOut(auth);
  };

  const fetchSiteInspections = useCallback(async () => {
    try {
      setSiteInspectionsLoading(true);
      setSiteInspectionsError(null);
      const response = await authenticatedFetch(`/api/site-inspections`);

      if (!response.ok) {
        throw new Error(`Failed to fetch site-inspections: ${response.statusText}`);
      }

      const apiResponse = await response.json();
      const combinedData = formatSiteInspections(apiResponse.data || []);
      setSiteInspections(combinedData);

      // Auto-select first inspection (must have valid inspection_id)
      if (combinedData.length > 0 && combinedData[0].inspection_id) {
        setSelectedInspection(combinedData[0].inspection_id);
      }
    } catch (error) {
      console.error('Error fetching site-inspections:', error);
      setSiteInspectionsError(error instanceof Error ? error.message : 'Failed to fetch site-inspections');
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

        // Fetch all tasks
        const tasksResponse = await authenticatedFetch('/api/tasks');
        if (!tasksResponse.ok) {
          throw new Error(`Failed to fetch all tasks: ${tasksResponse.statusText}`);
        }
        const tasksJson = await tasksResponse.json();
        const formattedTsk = formatTasks(
          Array.isArray(tasksJson) ? tasksJson : (tasksJson.data || [])
        );
        setTasks(formattedTsk);
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
  }, [selectedInspection, siteInspections, user, authLoading]);

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
    if (!selectedIncidentId) {
      if (selectedInspection) {
        setTasks([]);
        setActiveTask(null);
      }
      return;
    }
    fetchTasksForIncident(selectedIncidentId);
  }, [selectedIncidentId, selectedInspection, fetchTasksForIncident]);

  const uploadIncidentVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);

      const selectedItem = siteInspections.find(
        (item) => (item.inspection_id || item.site_id) === selectedInspection
      );

      if (!selectedInspection || !selectedItem || !selectedItem.inspection_id) {
        alert("Please select a site with a valid inspection before uploading a video.");
        return;
      }

      document.body.style.cursor = 'wait';
      try {
        const uploadUrlResp = await authenticatedFetch(
          `/api/get-upload-url?fileName=${encodeURIComponent(file.name)}`
        );
        if (!uploadUrlResp.ok) throw new Error('Failed to get upload URL');
        const uploadUrlJson = await uploadUrlResp.json();
        const {
          upload_url: uploadUrl,
          blob_name: blobName,
          storage_type: storageType,
        } = uploadUrlJson.data || {};

        if (storageType === 'gcs') {
          const gcsResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'video/mp4' },
            body: file,
          });
          if (!gcsResponse.ok) {
            throw new Error(`Failed to upload to GCS: ${gcsResponse.status}`);
          }
        } else if (storageType === 'local') {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('filePath', uploadUrl);

          const localResponse = await authenticatedFetch('/api/upload-local', {
            method: 'POST',
            body: formData,
          });
          if (!localResponse.ok) {
            throw new Error(`Failed to upload to local storage: ${localResponse.status}`);
          }
        } else {
          throw new Error(`Unsupported storage type for browser upload: ${storageType}`);
        }

        const registerResp = await authenticatedFetch(
          `/api/inspections/${selectedInspection}/upload-incident`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              inspector_id: 0,
              file_url: uploadUrl,
              blob_name: blobName,
              translation_language: ""
            }),
          }
        );
        if (!registerResp.ok) throw new Error('Failed to register incident');

        const result = await registerResp.json();
        setLastUploadedFileName(file.name);
        console.log("Video file uploaded successfully : ", result);
      } catch (error) {
        console.error("Upload failed:", error);
        setLastUploadedFileName(`Failed to upload video ${file.name}`);
      } finally {
        document.body.style.cursor = 'default';
      }
    }
  };

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
        uploadIncidentVideo,
        handleAddInspectionSubmit,
        handleLogin,
        handleLogout,
        fetchSiteInspections,
        fetchTasksForIncident,
        headerSiteName,
        setHeaderSiteName,
        headerInspectionName,
        setHeaderInspectionName,
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
