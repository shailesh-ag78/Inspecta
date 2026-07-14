"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronLeft, Play, User, AlertCircle, Loader, LogOut, Upload, Plus } from 'lucide-react';
import { themes, defaultTheme, type Theme } from '@/lib/themes';
import { auth, googleProvider } from '@/lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import VideoPlayer from './VideoPlayer';
import AddInspectionModal from '@/components/AddInspectionModal';
import {
  authenticatedFetch,
  BACKEND_URL,
  formatTasks,
  formatIncidents,
  formatSiteInspections,
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

export default function ReviewerDashboard() {
  // Auth state management
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // State management
  const [siteInspections, setSiteInspections] = useState<SiteInspection[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [filters, setFilters] = useState({
    severity: 'all',
    task_type: 'all',
    task_status: 'all'
  });
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);
  const [isVideoCollapsed, setIsVideoCollapsed] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<string>('');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [editingSeverity, setEditingSeverity] = useState<number>(3);
  const [taskSaveLoading, setTaskSaveLoading] = useState(false);
  const [taskEditError, setTaskEditError] = useState<string | null>(null);
  const [pendingPlayTask, setPendingPlayTask] = useState<{ id: string; start: number; end: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyNameLoading, setCompanyNameLoading] = useState(false);

  // Dropdown states & refs
  const [isInspectionDropdownOpen, setIsInspectionDropdownOpen] = useState(false);
  const [isIncidentDropdownOpen, setIsIncidentDropdownOpen] = useState(false);
  const inspectionDropdownRef = useRef<HTMLDivElement | null>(null);
  const incidentDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inspectionDropdownRef.current && !inspectionDropdownRef.current.contains(event.target as Node)) {
        setIsInspectionDropdownOpen(false);
      }
      if (incidentDropdownRef.current && !incidentDropdownRef.current.contains(event.target as Node)) {
        setIsIncidentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Video Upload States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastUploadedFileName, setLastUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploadIncidentVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);

      if (!selectedInspection) {
        alert("Please select an inspection before uploading a video.");
        return;
      }

      document.body.style.cursor = 'wait';
      try {
        // 1. Ask the backend for a signed upload URL + blob name + storage type.
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

        // 2. Upload the file bytes straight to storage.
        if (storageType === 'gcs') {
          const gcsResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'video/mp4' },
            body: file,
          });
          if (!gcsResponse.ok) {
            throw new Error(`Failed to upload to GCS: ${gcsResponse.status}`);
          }
        } else {
          // 'local' storage only exists when the backend runs on a dev machine;
          // a static browser client cannot write to that filesystem.
          throw new Error(`Unsupported storage type for browser upload: ${storageType}`);
        }

        // 3. Register the incident (kicks off backend processing).
        const inspectorId = 1; // TODO: derive from Firebase token claims
        const registerResp = await authenticatedFetch(
          `/api/inspections/${selectedInspection}/upload-incident`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              inspector_id: inspectorId,
              file_url: uploadUrl,
              blob_name: blobName,
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

  const getIncidentVideoFileName = () => {
    if (selectedFile) {
      return selectedFile.name;
    }
    if (activeTask?.video_url) {
      return activeTask.video_url.split('/').pop() || '';
    }
    return '';
  };

  // Add Inspection Modal State
  const [isAddInspectionOpen, setIsAddInspectionOpen] = useState(false);

  const handleAddInspection = () => {
    setIsAddInspectionOpen(true);
  };

  // Extract unique sites from site-inspections list for the AddInspectionModal selection
  const uniqueSites = Array.from(
    new Map(
      siteInspections.map((item) => [
        item.site_id,
        { id: item.site_id, name: item.site_name, address: item.address }
      ])
    ).values()
  );

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

        // 1. If it's a new site, create the site first
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

        // 2. Create the inspection
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

        // 3. Refresh the site inspections list and select the new inspection
        await fetchSiteInspections();
        if (newInspectionId) {
          setSelectedInspection(newInspectionId);
        }
      })();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout : Failed to add new Inspection")), 60000)
      );

      // Race the execution against the 60-second timeout
      await Promise.race([executionPromise, timeoutPromise]);

    } catch (error) {
      console.error("Error adding inspection:", error);
      alert(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      document.body.style.cursor = 'default';
    }
  };

  // Loading and error states
  const [siteInspectionsLoading, setSiteInspectionsLoading] = useState(true);
  const [siteInspectionsError, setSiteInspectionsError] = useState<string | null>(null);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

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

  // Fetch company name when user is authenticated and company_id is available
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
    setShowSettingsMenu(false);
  };

  // Combine the existing themes with the new one
  const availableThemes = themes;

  const [hasAutoPaused, setHasAutoPaused] = useState(false);

  const playerRef = useRef<any>(null);

  // Helper to detect if the current asset is an audio file
  const isAudioFile = useCallback((url?: string) => {
    if (!url) return false;
    const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
    return audioExtensions.some(ext => url.toLowerCase().endsWith(ext));
  }, []);

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

  // Fetch incidents when inspection changes
  useEffect(() => {
    if (!selectedInspection) return;

    const fetchIncidents = async () => {
      try {
        setIncidentsLoading(true);
        setIncidentsError(null);

        // Reset current selection and tasks to prevent stale/wrong ID fetches
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

        // Auto-select the first incident if available
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
  }, [selectedInspection]);

  // Helper function to fetch tasks for an incident
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
      console.log("%c >>> SUCCESS: Tasks received", "color: white; background: green", tasksData);
      tasksData.forEach((task: any, index: number) => {
        console.log(`⏱️ Start Time: ${task.start_time}s | End Time: ${task.end_time}s  => 🎬 [Task ${index + 1}] Title: "${task.task_title}"`);
      });

      setTasks(tasksData);

      // Tasks are collapsed by default
      setExpandedTasks(new Set());
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
      setTasks([]);
      setActiveTask(null);
      return;
    }
    console.log("%c >>> TRIGGER: Fetching tasks for Incident:", "color: white; background: blue; font-weight: bold", selectedIncidentId);
    fetchTasksForIncident(selectedIncidentId);
  }, [selectedIncidentId, fetchTasksForIncident]);

  useEffect(() => {
    setHasAutoPaused(false);
  }, [activeTask?.id]);

  // Only http(s) URLs are known synchronously. gs:// paths are resolved to a
  // signed URL asynchronously inside VideoPlayer, so we cannot predict the
  // final src here — return undefined and let the pendingPlayTask flow drive
  // playback once the media is ready (same path as a normal task switch).
  const getVideoSrc = useCallback((videoUrl?: string): string | undefined => {
    if (!videoUrl) return undefined;
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      return videoUrl;
    }
    return undefined;
  }, []);

  const isInitiatingPlayRef = useRef(false);

  const handleTaskClick = (task: Task, shouldPlay = false) => {
    setActiveTask(task);
    setHasAutoPaused(false);

    if (shouldPlay) {
      isInitiatingPlayRef.current = true;
      // Request playback once the media is ready (handled by effects and event listeners)
      setPendingPlayTask({ id: task.id, start: task.start_time, end: task.end_time });

      if (playerRef.current) {
        const player = playerRef.current;
        const newSrc = getVideoSrc(task.video_url) || '';
        let isSameSrc = false;
        try {
          // Compare full resolved URLs
          isSameSrc = player.src === new URL(newSrc, window.location.href).href;
        } catch (e) {
          isSameSrc = player.src === newSrc;
        }

        // If source is same and ready, play immediately
        if (isSameSrc) {
          const internalPlayer = player;
          if (internalPlayer && internalPlayer.readyState >= 2) {
            internalPlayer.currentTime = task.start_time;
            internalPlayer.play?.()
              .then(() => {
                setPendingPlayTask(null);
                isInitiatingPlayRef.current = false;
              })
              .catch((err: unknown) => {
                console.error('Immediate task play failed:', err);
                // Leave ref true so metadata/effects can try to recover playback
              });
          }
        }
      }
    } else {
      isInitiatingPlayRef.current = false;
      setPendingPlayTask(null);
    }
  };

  const handleActiveVideoPlay = () => {
    if (!activeTask || !playerRef.current) return;
    const player = playerRef.current;
    const internalPlayer = player;
    setHasAutoPaused(false);

    // If current position is outside the task range or playback is stopped, reset to start
    if (internalPlayer && (internalPlayer.currentTime < activeTask.start_time - 0.1 || internalPlayer.currentTime >= activeTask.end_time - 0.1)) {
      internalPlayer.currentTime = activeTask.start_time;
    }
  };

  const currentIsAudio = isAudioFile(activeTask?.video_url);

  const prevTaskIdRef = useRef<string | null>(null);

  // Pause playback and clear active task when inspection or incident changes
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.pause();
      // Force clear the source to stop background downloading
      // With ReactPlayer, just changing the URL prop to '' is enough
      // This is handled by setActiveTask(null) which clears the filePath
    }
    isInitiatingPlayRef.current = false;
    setIsPlaying(false);
    setActiveTask(null);
    setPendingPlayTask(null);
    prevTaskIdRef.current = null;
    setSelectedFile(null);
    setLastUploadedFileName(null);
  }, [selectedInspection, selectedIncidentId]);

  const renderSettingsMenu = (isMobile: boolean) => {
    return (
      <div className={`${isMobile ? 'flex sm:hidden' : 'hidden sm:flex'} flex-col items-center shrink-0`}>
        <div className="relative">
          <button
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white overflow-hidden transition hover:bg-white/20 cursor-pointer"
            title="Profile Settings"
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || "User"} className="h-full w-full object-cover" />
            ) : (
              <User className="w-4 h-4" />
            )}
          </button>
          {showSettingsMenu && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700 shadow-xl z-50">
              <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-3">
                {user?.photoURL && (
                  <img src={user.photoURL} alt="" className="h-10 w-10 rounded-full border border-slate-700" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">{user?.displayName || "Task Reviewer"}</div>
                  <div className="text-xs text-slate-400 truncate">{user?.email}</div>
                </div>
              </div>
              <div className="p-2 border-b border-slate-800">
                <div className="px-3 py-2 text-xs font-medium text-slate-300 uppercase tracking-wider">Theme</div>
                {Object.values(availableThemes)
                  .filter(t => !['Aqua Gradient', 'Aqua Light Gradient', 'Ocean Vibrant'].includes(t.name))
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTheme(t);
                        setShowSettingsMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all mb-1 cursor-pointer ${theme.id === t.id
                        ? 'bg-white/10 text-white'
                        : 'hover:bg-slate-800 text-slate-200'
                        }`}
                    >
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs opacity-75 mt-1">
                        <div className={`h-2 rounded w-full bg-gradient-to-r ${t.primary.from} ${t.primary.to}`}></div>
                      </div>
                    </button>
                  ))}
              </div>
              <div className="p-2 border-t border-slate-800">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/70 mt-1">
          {companyNameLoading ? <Loader className="w-3 h-3 animate-spin inline-block" /> : companyName}
        </span>
      </div>
    );
  };

  // Update video position and panel state when activeTask changes
  useEffect(() => {
    // Stop playback immediately when switching tasks or clearing selection
    if (playerRef.current) {
      if (activeTask?.id !== prevTaskIdRef.current) {
        if (!isInitiatingPlayRef.current) {
          playerRef.current.pause();
          setIsPlaying(false);
        }
      }
    }
    prevTaskIdRef.current = activeTask?.id || null;
    isInitiatingPlayRef.current = false; // Reset the flag
    setSelectedFile(null); // Clear selected file when task changes
    setLastUploadedFileName(null); // Clear last uploaded file name when task changes

    if (activeTask && playerRef.current) {
      // Reset the auto-pause flag for the new task range
      setHasAutoPaused(false);

      // Only seek synchronously here if the media is already loaded (same video source scenario)
      const internalPlayer = playerRef.current;
      if (internalPlayer?.readyState >= 2) {
        internalPlayer.currentTime = activeTask.start_time;
      }
    }
  }, [activeTask?.id]); // Only run when activeTask ID changes

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTaskTypeIcon = (type: string) => {
    switch (type) {
      case 'install': return 'fa-tools';
      case 'repair': return 'fa-wrench';
      case 'verify': return 'fa-clipboard-check';
      case 'clear': return 'fa-broom';
      default: return 'fa-question';
    }
  };

  const getTaskStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return 'fa-clock';
      case 'in_progress': return 'fa-spinner';
      case 'review': return 'fa-eye';
      case 'completed': return 'fa-check-circle';
      case 'failed': return 'fa-times-circle';
      default: return 'fa-question';
    }
  };

  const getTaskStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-500';
      case 'in_progress': return 'text-blue-500';
      case 'review': return 'text-purple-500';
      case 'completed': return 'text-green-500';
      case 'failed': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const toggleTaskExpansion = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const startEditingTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.task_title || '');
    setEditingDescription(task.task_description || '');
    setEditingSeverity(task.severity_id);
    setTaskEditError(null);
  };

  const cancelEditingTask = () => {
    setEditingTaskId(null);
    setEditingTitle('');
    setEditingDescription('');
    setEditingSeverity(3);
    setTaskEditError(null);
  };

  const saveTaskEdits = async (task: Task) => {
    const trimmedTitle = editingTitle.trim();
    const trimmedDescription = editingDescription.trim();
    if (
      trimmedTitle === (task.task_title || '').trim() &&
      trimmedDescription === (task.task_description || '').trim() &&
      editingSeverity === task.severity_id
    ) {
      cancelEditingTask();
      return;
    }

    try {
      setTaskSaveLoading(true);
      setTaskEditError(null);
      const response = await authenticatedFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_title: trimmedTitle,
          task_description: trimmedDescription,
          severity_id: editingSeverity,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || errorData?.error || 'Failed to save task');
      }

      const updatedResponse = await response.json();
      const updatedTask = updatedResponse?.data || updatedResponse;
      setTasks((prevTasks) => prevTasks.map((item) => item.id === task.id ? {
        ...item,
        task_title: updatedTask?.task_title || trimmedTitle,
        task_description: updatedTask?.task_description || trimmedDescription,
        severity_id: updatedTask?.severity_id || editingSeverity,
      } : item));

      if (activeTask?.id === task.id) {
        setActiveTask({
          ...task,
          task_title: updatedTask?.task_title || trimmedTitle,
          task_description: updatedTask?.task_description || trimmedDescription,
          severity_id: updatedTask?.severity_id || editingSeverity,
        });
      }

      cancelEditingTask();
    } catch (error) {
      console.error('Error saving task:', error);
      setTaskEditError(error instanceof Error ? error.message : 'Failed to save task');
    } finally {
      setTaskSaveLoading(false);
    }
  };

  const openTaskForEditing = (task: Task) => {
    const nextExpanded = new Set(expandedTasks);
    nextExpanded.add(task.id);
    setExpandedTasks(nextExpanded);
    startEditingTask(task);
  };

  // Otherwise, handleVideoLoadedMetadata is the single source of truth for seeking.
  useEffect(() => {
    if (!pendingPlayTask || !playerRef.current) return;
    const player = playerRef.current;
    const internalPlayer = player;
    if (internalPlayer && internalPlayer.readyState >= 2) { // HAVE_CURRENT_DATA or more
      player.currentTime = pendingPlayTask.start;
      // `playing` prop will handle play command
      setPendingPlayTask(null);
    }
    // Otherwise wait for onLoadedMetadata to fire.
  }, [pendingPlayTask]);

  const handlePlayerReady = (player: any) => {
    if (!player) return;

    if (activeTask) {
      player.currentTime = activeTask.start_time;
      if (pendingPlayTask && pendingPlayTask.id === activeTask.id) {
        // The `playing` prop will be true, so it will auto-play
        isInitiatingPlayRef.current = false;
      }
    }
    setPendingPlayTask(null);
  };

  const handlePlayerProgress = ({ playedSeconds }: { playedSeconds: number }) => {
    if (!activeTask || !playerRef.current || hasAutoPaused) return;

    const currentTime = playedSeconds;

    // Reset auto-pause flag if the user seeks back manually
    if (currentTime < activeTask.end_time - 1) {
      setHasAutoPaused(false);
    }

    if (currentTime >= activeTask.end_time) {
      setIsPlaying(false); // This will pause the player via the `playing` prop
      setHasAutoPaused(true); // "Unlock" the video so subsequent plays work
      console.log(`Auto-paused at evidence end: ${activeTask.end_time}s`);
    }
  };



  const filteredTasks = tasks.filter(task => {
    if (filters.severity !== 'all' && task.severity_id !== parseInt(filters.severity)) return false;
    if (filters.task_type !== 'all' && task.task_type !== filters.task_type) return false;
    if (filters.task_status !== 'all' && task.task_status !== filters.task_status) return false;
    return true;
  });

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-blue-500">
        <Loader className="w-12 h-12 animate-spin mb-4" />
        <p className="text-sm font-medium animate-pulse">Initializing security module...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white p-6 relative overflow-hidden">
        {/* Decorative background glow blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-[28px] p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative z-10 transition-all hover:border-white/20">
          <div className="flex flex-col items-center text-center">
            {/* Glow Logo */}
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-md animate-pulse" />
              <img src="/InspectaLogo.png" alt="Inspecta Logo" className="relative h-20 w-20 rounded-full object-cover border border-white/20" />
            </div>

            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-blue-400 via-orange-400 to-purple-400 text-transparent bg-clip-text">
              INSPECTA
            </h1>
            <p className="text-slate-400 text-sm mt-2 font-medium">Inspection simplified by technology</p>

            <div className="h-[1px] w-full bg-white/10 my-6" />

            <h2 className="text-xl font-bold text-white mb-2">Access Granted via Google Auth</h2>
            <p className="text-xs text-slate-400 max-w-xs mb-8">
              Authenticate using your company Google Workspace account to securely view task evidence and inspections.
            </p>

            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white text-slate-950 font-bold rounded-2xl shadow-lg transition-all hover:bg-slate-100 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>

        <div className="absolute bottom-6 text-[10px] text-slate-600 font-mono">
          SECURE CONNECTION • AES-256 ENCRYPTION
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col bg-gradient-to-br ${theme.background.gradient}`}>
      {/* Header */}
      <header className={`${theme.header.bg} ${theme.header.text} shrink-0 border-b border-slate-300/20 shadow-lg`}>
        <div className="max-w-[1600px] mx-auto px-4 py-3 lg:px-6 lg:py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="flex items-center gap-4 justify-start">
              <img src="/InspectaLogo.png" alt="Logo" className="h-12 w-12 rounded-full object-cover drop-shadow-[0_0_12px_rgba(59,130,246,0.7)]" />
              <div>
                <div className="text-[10px] uppercase tracking-[0.10em] font-bold 
                  bg-gradient-to-r from-[#3B82F6] via-[#FB923C] to-[#8B5CF6] 
                  text-transparent bg-clip-text drop-shadow-md">
                  INSPECTA
                </div>
                <div className="text-1.9xl font-extrabold font-['Public_Sans']">Task Dashboard</div>
              </div>
            </div>

            {/* Mobile Settings Menu */}
            {renderSettingsMenu(true)}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 lg:gap-[26px] justify-end w-full sm:w-auto">
            {/* Inspection Dropdown Group */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Custom Inspection Dropdown */}
              <div ref={inspectionDropdownRef} className="relative w-full sm:w-[305px] lg:shrink-0">
                <button
                  onClick={() => setIsInspectionDropdownOpen(!isInspectionDropdownOpen)}
                  className={`w-full relative rounded-2xl border ${theme.filters.border} bg-white/10 px-3 py-1.5 text-left text-sm text-white shadow-sm flex flex-col justify-center min-h-[50px] transition-all hover:bg-white/15`}
                >
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/70 block leading-tight">Inspection</span>
                  {siteInspectionsLoading ? (
                    <Loader className="w-4 h-4 animate-spin text-white/70 mt-1" />
                  ) : (
                    <span className="block truncate text-sm text-white font-semibold pr-6 mt-0.5">
                      {siteInspections.find(item => (item.inspection_id || item.site_id) === selectedInspection)?.label || 'Select Inspection'}
                    </span>
                  )}
                  <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
                </button>
                {isInspectionDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-700/50 bg-slate-900 backdrop-blur-md shadow-xl z-50 py-1.5 dropdown-scrollbar">
                    {siteInspections.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400">No inspections available</div>
                    ) : (
                      siteInspections.map(item => {
                        const val = item.inspection_id || item.site_id;
                        const isSelected = val === selectedInspection;
                        return (
                          <button
                            key={`${item.site_id}-${item.inspection_id}`}
                            onClick={() => {
                              setSelectedInspection(val);
                              setIsInspectionDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors hover:bg-white/10 block truncate ${isSelected ? 'bg-blue-600 text-white font-semibold' : 'text-slate-300'
                              }`}
                          >
                            {item.label}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Add Inspection Button */}
              <button
                onClick={handleAddInspection}
                className={`hidden lg:flex h-7 w-7 items-center justify-center rounded-full border ${theme.filters.border} bg-white/10 text-white transition hover:bg-white/20 hover:scale-105 cursor-pointer shrink-0`}
                title="Add Inspection"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {/* Incident Dropdown Group */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Custom Incident Dropdown */}
              <div ref={incidentDropdownRef} className="relative w-full sm:w-[277px] lg:shrink-0">
                <button
                  onClick={() => setIsIncidentDropdownOpen(!isIncidentDropdownOpen)}
                  className={`w-full relative rounded-2xl border ${theme.filters.border} bg-white/10 px-3 py-1.5 text-left text-sm text-white shadow-sm flex flex-col justify-center min-h-[50px] transition-all hover:bg-white/15`}
                >
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/70 block leading-tight">Incident</span>
                  {incidentsLoading ? (
                    <Loader className="w-4 h-4 animate-spin text-white/70 mt-1" />
                  ) : (
                    <span className="block truncate text-sm text-white font-semibold pr-6 mt-0.5">
                      {(() => {
                        const incident = incidents.find(inc => inc.id === selectedIncidentId);
                        if (!incident) return 'Select Incident';
                        return incident.title || `Incident ${incident.id.slice(0, 4)} - ${incident.created ? new Date(incident.created).toLocaleTimeString() : 'Recent'}`;
                      })()}
                    </span>
                  )}
                  <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
                </button>
                {isIncidentDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-700/50 bg-slate-900 backdrop-blur-md shadow-xl z-50 py-1.5 dropdown-scrollbar">
                    {incidents.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400">No incidents available</div>
                    ) : (
                      incidents.map(incident => {
                        const isSelected = incident.id === selectedIncidentId;
                        const label = incident.title || `Incident ${incident.id.slice(0, 4)} - ${incident.created ? new Date(incident.created).toLocaleTimeString() : 'Recent'}`;
                        return (
                          <button
                            key={incident.id}
                            onClick={() => {
                              setSelectedIncidentId(incident.id);
                              setIsIncidentDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors hover:bg-white/10 block truncate ${isSelected ? 'bg-blue-600 text-white font-semibold' : 'text-slate-300'
                              }`}
                          >
                            {label}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Action Icon next to Incident Control */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`hidden lg:flex h-7 w-7 items-center justify-center rounded-full border ${theme.filters.border} bg-white/10 text-white transition hover:bg-white/20 hover:scale-105 cursor-pointer shrink-0`}
                title="Upload incident video"
              >
                <Upload className="w-3 h-3" />
              </button>
            </div>

            {/* Desktop Settings Menu */}
            {renderSettingsMenu(false)}
          </div>
        </div>
      </header>

      {/* Error Messages */}
      {(siteInspectionsError || incidentsError || tasksError) && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            {siteInspectionsError && <div>Site-Inspections Error: {siteInspectionsError}</div>}
            {incidentsError && <div>Incidents Error: {incidentsError}</div>}
            {tasksError && <div>Tasks Error: {tasksError}</div>}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden max-w-[1600px] mx-auto w-full">
        {/* Left Pane - Task Feed */}
        <section className={`${isVideoCollapsed ? 'w-full' : 'w-full lg:w-3/5'} overflow-y-visible lg:overflow-y-auto px-3 pb-6 pt-0 bg-gradient-to-br ${theme.background.section} border border-slate-200/70 transition-all duration-300 relative`}>
          {/* Filters */}
          <div className="sticky top-0 z-20 -mx-3 bg-slate-100/98 backdrop-blur-sm border-b border-slate-200/70 mb-6 shadow-md">
            <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200/70 bg-slate-200/80">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-3">
                <i className={`fa-solid fa-filter ${theme.primary.from} ${theme.primary.to} bg-gradient-to-r text-white text-xs p-1.5 rounded-lg`}></i>
                Task Filters
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
                  className={`text-white transition-all p-2 rounded-lg border border-transparent bg-gradient-to-r ${theme.primary.from} ${theme.primary.to}`}
                >
                  <ChevronDown className={`w-2 h-2 transform transition-transform ${isFiltersCollapsed ? '' : 'rotate-180'}`} />
                </button>
              </div>
            </div>
            {!isFiltersCollapsed && (
              <div className="px-3 py-4">
                <div className="grid grid-cols-3 gap-4">
                  {/* Types Filter */}
                  <div>
                    <select
                      value={filters.task_type}
                      onChange={(e) => setFilters({ ...filters, task_type: e.target.value })}
                      className={`w-full text-xs border ${theme.filters.border} rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:${theme.filters.focus} transition-all`}
                    >
                      <option value="all" className="text-xs">All Types</option>
                      <option value="install" className="text-xs">🛠️ Install</option>
                      <option value="repair" className="text-xs">🔧 Repair</option>
                      <option value="verify" className="text-xs">📋 Verify</option>
                      <option value="clear" className="text-xs">🧹 Clear</option>
                    </select>
                  </div>
                  {/* Severity Filter */}
                  <div>
                    <select
                      value={filters.severity}
                      onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
                      className={`w-full text-xs border ${theme.filters.border} rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:${theme.filters.focus} transition-all`}
                    >
                      <option value="all" className="text-xs">All Severities</option>
                      <option value="1" className="text-xs">🔴 Severe</option>
                      <option value="2" className="text-xs">🟡 Regular</option>
                      <option value="3" className="text-xs">🟢 Low</option>
                    </select>
                  </div>
                  {/* Status Filter */}
                  <div>
                    <select
                      value={filters.task_status}
                      onChange={(e) => setFilters({ ...filters, task_status: e.target.value })}
                      className={`w-full text-xs border ${theme.filters.border} rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:${theme.filters.focus} transition-all`}
                    >
                      <option value="all" className="text-xs">All Statuses</option>
                      <option value="pending" className="text-xs">🕒 Pending</option>
                      <option value="in_progress" className="text-xs">🔄 In Progress</option>
                      <option value="review" className="text-xs">👁️ Review</option>
                      <option value="completed" className="text-xs">✅ Completed</option>
                      <option value="failed" className="text-xs">❌ Failed</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tasks List */}
          {tasksLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-blue-500">
              <Loader className="w-10 h-10 animate-spin mb-4" />
              <p className="text-sm font-medium animate-pulse">Loading tasks from backend...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No tasks available for this incident.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTasks.map((task) => {
                const isExpanded = expandedTasks.has(task.id);
                return (
                  <div
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    className={`cursor-pointer bg-white/90 backdrop-blur-sm rounded-xl border-2 shadow-lg hover:shadow-xl transition-all duration-300 ${activeTask?.id === task.id
                      ? `border-blue-500 ring-4 ring-blue-500/20 shadow-blue-500/20`
                      : `${theme.cardBorder} hover:border-blue-300`
                      }`}
                  >
                    {/* Task Header - Always Visible */}
                    <div className="space-y-2 p-2.5">
                      {/* First Row: Icon, Title on Left; Severity, Status, Chevron on Right */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`w-[29px] h-[29px] rounded-lg flex items-center justify-center shadow-lg text-white shrink-0 ${task.severity_id === 1 ? 'bg-gradient-to-br from-red-500 to-pink-600' :
                            task.severity_id === 2 ? 'bg-gradient-to-br from-yellow-400 to-orange-500' :
                              task.severity_id === 3 ? 'bg-gradient-to-br from-green-400 to-green-600' :
                                'bg-gradient-to-br from-yellow-400 to-orange-500'
                            }`}>
                            <i className={`fa-solid ${getTaskTypeIcon(task.task_type)} text-[12.5px] bg-gradient-to-r from-white to-gray-200 bg-clip-text text-transparent`}></i>
                          </div>
                          {editingTaskId === task.id ? (
                            <input
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 min-w-0 pr-2 rounded-2xl border border-slate-300/80 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                          ) : (
                            <h3 className="font-semibold text-slate-900 text-sm break-words min-w-0 flex-1">
                              {task.task_title}
                            </h3>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {editingTaskId === task.id ? (
                            <select
                              value={editingSeverity}
                              onChange={(e) => setEditingSeverity(parseInt(e.target.value))}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs border border-slate-300/80 rounded-lg px-2 py-1 bg-white text-slate-700 focus:border-blue-400 focus:outline-none"
                            >
                              <option value={1}>🔴 Severe</option>
                              <option value={2}>🟡 Regular</option>
                              <option value={3}>🟢 Low</option>
                            </select>
                          ) : (
                            <>
                              {/* Severity: Text on desktop, Emoji on mobile */}
                              <span className={`hidden sm:inline text-[9px] font-black px-1.5 py-0.5 rounded text-white ${task.severity_id === 1 ? 'bg-red-600' :
                                task.severity_id === 3 ? 'bg-green-600' :
                                  'bg-yellow-500'
                                }`}>
                                {task.severity_id === 1 ? 'SEVERE' : task.severity_id === 3 ? 'LOW' : 'REGULAR'}
                              </span>
                              <span className="inline sm:hidden text-sm" title={task.severity_id === 1 ? 'SEVERE' : task.severity_id === 3 ? 'LOW' : 'REGULAR'}>
                                {task.severity_id === 1 ? '🔴' : task.severity_id === 3 ? '🟢' : '🟡'}
                              </span>
                            </>
                          )}

                          {task.status_label && (
                            <>
                              <div className="h-4 w-[1px] bg-slate-300 mx-1.5" />
                              
                              {/* Status: Text on desktop */}
                              <div className="hidden sm:flex items-center gap-1.5 text-xs capitalize text-slate-500 border border-slate-200 rounded px-2 py-0.5 bg-slate-50/50">
                                <i className={`fa-solid ${getTaskStatusIcon(task.task_status)} ${getTaskStatusColor(task.task_status)} text-[11px]`} />
                                <span>{task.status_label}</span>
                              </div>

                              {/* Status: Emoji on mobile */}
                              <span className="inline sm:hidden text-sm" title={task.status_label}>
                                {task.task_status === 'pending' ? '🕒' :
                                 task.task_status === 'in_progress' ? '🔄' :
                                 task.task_status === 'review' ? '👁️' :
                                 task.task_status === 'completed' ? '✅' :
                                 task.task_status === 'failed' ? '❌' : '❓'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Second Row: Task Description on Left, Play & Edit Buttons on Right */}
                      <div className="flex items-start justify-between gap-4 mt-2">
                        <div className="min-w-0 flex-1">
                          {editingTaskId === task.id ? (
                            <div className="space-y-3">
                              <textarea
                                value={editingDescription}
                                onChange={(e) => setEditingDescription(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                rows={Math.max(2, (task.task_description ? task.task_description.split('\n').length * 2 : 2))}
                                className="w-full rounded-2xl border border-slate-300/80 bg-slate-50 p-3 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                              />
                              {taskEditError && (
                                <p className="text-xs text-red-600">{taskEditError}</p>
                              )}
                              <div className="flex justify-end gap-2 pt-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveTaskEdits(task);
                                  }}
                                  disabled={taskSaveLoading}
                                  className="px-3 py-1.5 min-w-[72px] bg-blue-600 text-white rounded-xl text-[11px] font-bold shadow-sm hover:bg-blue-700 transition-colors disabled:cursor-not-allowed disabled:bg-blue-300"
                                >
                                  {taskSaveLoading ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelEditingTask();
                                  }}
                                  className="px-3 py-1.5 min-w-[72px] bg-slate-100 text-slate-700 rounded-xl text-[11px] font-bold border border-slate-300 hover:bg-slate-200 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className={`text-black text-sm font-normal ${isExpanded ? 'whitespace-pre-wrap' : 'truncate'}`}>
                              {task.task_description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {editingTaskId !== task.id && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTaskClick(task, true);
                                }}
                                title="Play video"
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                              >
                                <i className="fa-solid fa-play text-[11px]" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTaskForEditing(task);
                                }}
                                title="Modify task"
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                              >
                                <i className="fa-solid fa-pen text-[11px]" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTaskExpansion(task.id);
                            }}
                            className="text-slate-500 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200 flex items-center justify-center"
                          >
                            <ChevronLeft className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-90' : '-rotate-90'}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Pane - Evidence Vault */}
        {!isVideoCollapsed && (
          <aside className={`w-full lg:w-2/5 ${theme.header.bg} flex flex-col shadow-inner relative border-t lg:border-t-0 lg:border-l border-slate-700 mt-4 lg:mt-0`}>
            <div className="absolute inset-0 bg-white/10 pointer-events-none" />
            <div className="p-5 pb-40 flex-1 overflow-y-auto relative z-10">
              {/* Compact Header Row */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-white font-bold flex items-center min-w-0">
                  <span className="tracking-tight text-sm truncate" title={activeTask?.task_title || 'No task selected'}>
                    {activeTask ? activeTask.task_title : 'No Task Selected'}
                  </span>
                </h3>
                <button
                  onClick={() => setIsVideoCollapsed(true)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft className="w-5 h-5 rotate-180" />
                </button>
              </div>

              {/* Evidence Container with Severity-based Glow */}
              <div className={`relative w-full bg-black rounded-2xl overflow-hidden border transition-all duration-500 shadow-2xl ${activeTask?.severity_id === 1 ? 'border-red-500/50 shadow-red-500/10' :
                activeTask?.severity_id === 2 ? 'border-yellow-500/50 shadow-yellow-500/10' :
                  activeTask?.severity_id === 3 ? 'border-green-500/50 shadow-green-500/10' :
                    'border-slate-700'
                }`}>
                {activeTask?.video_url ? (
                  <VideoPlayer
                    ref={playerRef}
                    filePath={activeTask.video_url}
                    token={token || undefined}
                    isAudio={currentIsAudio}
                    playing={isPlaying}
                    onReady={handlePlayerReady}
                    onProgress={handlePlayerProgress}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                  />
                ) : (
                  <div className="aspect-video w-full flex flex-col items-center justify-center text-slate-500 gap-3">
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                      <AlertCircle className="w-8 h-8 opacity-20" />
                      <p className="text-xs font-medium uppercase tracking-widest opacity-40">
                        {activeTask ? 'Evidence Unavailable' : 'Awaiting Task Selection'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Playback HUD Controls */}
                {!currentIsAudio && (
                  <div className="mt-4 flex items-center justify-center gap-4">
                    <div className="flex items-center gap-1 bg-slate-800/80 p-1.5 rounded-full border border-slate-700 shadow-xl">
                      <button
                        onClick={() => {
                          const currentIndex = filteredTasks.findIndex(t => t.id === activeTask?.id);
                          if (currentIndex > 0) handleTaskClick(filteredTasks[currentIndex - 1], true);
                        }}
                        disabled={!activeTask || filteredTasks.findIndex(t => t.id === activeTask?.id) === 0}
                        className="p-2 text-slate-400 hover:text-white disabled:opacity-20 transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>

                      <button
                        onClick={handleActiveVideoPlay}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-full transition-all active:scale-95"
                      >
                        <Play className={`w-3.5 h-3.5 fill-current ${isPlaying ? 'animate-pulse' : ''}`} />
                        {isPlaying ? 'Playing Segment' : `Sync : ${activeTask ? `${formatTime(activeTask.start_time)} -- ${formatTime(activeTask.end_time)}` : '00:00'}`}
                      </button>

                      <button
                        onClick={() => {
                          const currentIndex = filteredTasks.findIndex(t => t.id === activeTask?.id);
                          if (currentIndex < filteredTasks.length - 1) handleTaskClick(filteredTasks[currentIndex + 1], true);
                        }}
                        disabled={!activeTask || filteredTasks.findIndex(t => t.id === activeTask?.id) === filteredTasks.length - 1}
                        className="p-2 text-slate-400 hover:text-white disabled:opacity-20 transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5 rotate-180" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {/* Action Buttons Column */}
              <div className="absolute bottom-12 right-5 flex flex-col items-end gap-3 z-30">
                {/* Add Inspection Button */}
                <button
                  onClick={handleAddInspection}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold rounded-full transition-all hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap shadow-[0_4px_14px_rgba(0,0,0,0.3)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Inspection
                </button>

                {/* Upload Incident Video Button Container */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold rounded-full transition-all hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap shadow-[0_4px_14px_rgba(0,0,0,0.3)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)]"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload incident video
                  </button>
                </div>
              </div>
              {/* Status Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-9 bg-slate-950/90 border-t border-slate-700/50 flex items-center px-4 z-30">
                <span className="text-xs text-slate-400 font-medium truncate">
                  {lastUploadedFileName?.startsWith('Failed') ? (
                    <span className="text-red-400 font-semibold">{lastUploadedFileName}</span>
                  ) : (
                    <>
                      Last uploaded video: <span className="text-blue-400 font-semibold">{lastUploadedFileName || 'None'}</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          </aside>
        )}

        {/* Collapsed Video Toggle */}
        {isVideoCollapsed && (
          <button
            onClick={() => setIsVideoCollapsed(false)}
            className={`w-12 bg-gradient-to-r ${theme.primary.from} ${theme.primary.to} hover:brightness-110 text-white flex items-center justify-center transition-all duration-200 border-l-2 border-white/20 shadow-lg hover:shadow-xl hover:scale-105`}
            title="Expand Video Pane"
          >
            <ChevronLeft className="w-5 h-5 rotate-180" />
          </button>
        )}
      </main>

      {/* Mobile Sticky Bottom Action Bar */}
      <div className="lg:hidden shrink-0 bg-slate-900 border-t border-slate-700/50 p-3 flex gap-3 z-30 sticky bottom-0 mobile-action-bar">
        <button
          onClick={handleAddInspection}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Add Inspection
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95"
        >
          <Upload className="w-4 h-4" />
          Upload Incident Video
        </button>
      </div>

      {/* Hidden file input for Upload Video */}
      <input
        type="file"
        ref={fileInputRef}
        accept="video/*"
        onChange={uploadIncidentVideo}
        className="hidden"
      />

      {/* Add Inspection Modal */}
      <AddInspectionModal
        isOpen={isAddInspectionOpen}
        onClose={() => setIsAddInspectionOpen(false)}
        sites={uniqueSites}
        onSubmit={handleAddInspectionSubmit}
      />
    </div>
  );
}
