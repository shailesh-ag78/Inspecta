"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronLeft, Play, AlertCircle, Loader, Upload, Plus } from 'lucide-react';
import { useDashboard } from '@/lib/context';
import AddInspectionModal from '@/components/AddInspectionModal';
import VideoPlayer from '@/app/VideoPlayer';
import { authenticatedFetch } from '@/lib/api';

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

export default function TaskManagementPage() {
  const {
    token,
    theme,
    siteInspections,
    selectedInspection,
    setSelectedInspection,
    incidents,
    selectedIncidentId,
    setSelectedIncidentId,
    tasks,
    setTasks,
    siteInspectionsLoading,
    siteInspectionsError,
    incidentsLoading,
    incidentsError,
    tasksLoading,
    tasksError,
    activeTask,
    setActiveTask,
    isAddInspectionOpen,
    setIsAddInspectionOpen,
    lastUploadedFileName,
    uniqueSites,
    handleAddInspectionSubmit,
    uploadIncidentVideo,
    selectedMillerSites,
    backendSites,
    selectedMillerInspections,
    selectedMillerIncidents,
    millerIncidents,
  } = useDashboard();

  // Local UI States
  const [flippedTitles, setFlippedTitles] = useState<Set<string>>(new Set());
  const [flippedDescriptions, setFlippedDescriptions] = useState<Set<string>>(new Set());
  const [isGlobalTranslationEnabled, setIsGlobalTranslationEnabled] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const [filters, setFilters] = useState({
    severities: [1, 2, 3],
    task_types: ['install', 'repair', 'verify', 'clear'],
    task_statuses: ['pending', 'in_progress', 'review', 'completed', 'failed']
  });

  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);
  const [isKpisCollapsed, setIsKpisCollapsed] = useState(true);
  const [isKpiFlipped, setIsKpiFlipped] = useState(false);
  const [daysFilter, setDaysFilter] = useState<number | ''>('');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [isVideoCollapsed, setIsVideoCollapsed] = useState(false);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [editingSeverity, setEditingSeverity] = useState<number>(3);
  const [editingStatus, setEditingStatus] = useState<number>(1);
  const [taskSaveLoading, setTaskSaveLoading] = useState(false);
  const [taskEditError, setTaskEditError] = useState<string | null>(null);

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

  const [pendingPlayTask, setPendingPlayTask] = useState<{ id: string; start: number; end: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasAutoPaused, setHasAutoPaused] = useState(false);

  const playerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsKpisCollapsed(window.innerWidth < 1024);
    }
  }, []);

  const isAudioFile = useCallback((url?: string) => {
    if (!url) return false;
    const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
    return audioExtensions.some(ext => url.toLowerCase().endsWith(ext));
  }, []);

  const getVideoSrc = useCallback((videoUrl?: string): string | undefined => {
    if (!videoUrl) return undefined;
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      return videoUrl;
    }
    return undefined;
  }, []);

  const isInitiatingPlayRef = useRef(false);
  const prevTaskIdRef = useRef<string | null>(null);

  // Pause playback and clear active task when inspection or incident changes
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.pause();
    }
    isInitiatingPlayRef.current = false;
    setIsPlaying(false);
    setActiveTask(null);
    setPendingPlayTask(null);
    prevTaskIdRef.current = null;
  }, [selectedInspection, selectedIncidentId, setActiveTask]);

  // Update video position and panel state when activeTask changes
  useEffect(() => {
    if (playerRef.current) {
      if (activeTask?.id !== prevTaskIdRef.current) {
        if (!isInitiatingPlayRef.current) {
          playerRef.current.pause();
          setIsPlaying(false);
        }
      }
    }
    prevTaskIdRef.current = activeTask?.id || null;
    isInitiatingPlayRef.current = false;

    if (activeTask && playerRef.current) {
      setHasAutoPaused(false);
      const internalPlayer = playerRef.current;
      if (internalPlayer?.readyState >= 2) {
        internalPlayer.currentTime = activeTask.start_time;
      }
    }
  }, [activeTask?.id]);

  const handleTaskClick = (task: Task, shouldPlay = false) => {
    setActiveTask(task);
    setHasAutoPaused(false);

    if (shouldPlay) {
      isInitiatingPlayRef.current = true;
      setPendingPlayTask({ id: task.id, start: task.start_time, end: task.end_time });

      if (playerRef.current) {
        const player = playerRef.current;
        const newSrc = getVideoSrc(task.video_url) || '';
        let isSameSrc = false;
        try {
          isSameSrc = player.src === new URL(newSrc, window.location.href).href;
        } catch (e) {
          isSameSrc = player.src === newSrc;
        }

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

    if (internalPlayer && (internalPlayer.currentTime < activeTask.start_time - 0.1 || internalPlayer.currentTime >= activeTask.end_time - 0.1)) {
      internalPlayer.currentTime = activeTask.start_time;
    }
  };

  const currentIsAudio = isAudioFile(activeTask?.video_url);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTaskTypeIcon = (type: string) => {
    switch (type?.toLowerCase()?.trim()) {
      case 'install':
      case 'insatll':
        return 'fa-tools';
      case 'repair':
        return 'fa-wrench';
      case 'verify':
        return 'fa-clipboard-check';
      case 'clear':
        return 'fa-broom';
      default:
        return 'fa-question';
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

  const getStatusLabelFromId = (id: number): string => {
    const mapping: Record<number, string> = {
      1: 'pending',
      2: 'in_progress',
      3: 'review',
      4: 'completed',
      5: 'failed'
    };
    return mapping[id] || 'pending';
  };

  const startEditingTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.task_title || '');
    setEditingDescription(task.task_description || '');
    setEditingSeverity(task.severity_id);
    setEditingStatus(task.status_id);
    setTaskEditError(null);
  };

  const cancelEditingTask = () => {
    setEditingTaskId(null);
    setEditingTitle('');
    setEditingDescription('');
    setEditingSeverity(3);
    setEditingStatus(1);
    setTaskEditError(null);
  };

  const saveTaskEdits = async (task: Task) => {
    const trimmedTitle = editingTitle.trim();
    const trimmedDescription = editingDescription.trim();
    if (
      trimmedTitle === (task.task_title || '').trim() &&
      trimmedDescription === (task.task_description || '').trim() &&
      editingSeverity === task.severity_id &&
      editingStatus === task.status_id
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
          status_id: editingStatus,
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
        status_id: updatedTask?.status_id || editingStatus,
        task_status: getStatusLabelFromId(updatedTask?.status_id || editingStatus),
        status_label: getStatusLabelFromId(updatedTask?.status_id || editingStatus),
      } : item));

      if (activeTask?.id === task.id) {
        setActiveTask({
          ...task,
          task_title: updatedTask?.task_title || trimmedTitle,
          task_description: updatedTask?.task_description || trimmedDescription,
          severity_id: updatedTask?.severity_id || editingSeverity,
          status_id: updatedTask?.status_id || editingStatus,
          task_status: getStatusLabelFromId(updatedTask?.status_id || editingStatus),
          status_label: getStatusLabelFromId(updatedTask?.status_id || editingStatus),
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

  useEffect(() => {
    if (!pendingPlayTask || !playerRef.current) return;
    const player = playerRef.current;
    const internalPlayer = player;
    if (internalPlayer && internalPlayer.readyState >= 2) {
      player.currentTime = pendingPlayTask.start;
      setPendingPlayTask(null);
    }
  }, [pendingPlayTask]);

  const handlePlayerReady = (player: any) => {
    if (!player) return;

    if (activeTask) {
      player.currentTime = activeTask.start_time;
      if (pendingPlayTask && pendingPlayTask.id === activeTask.id) {
        isInitiatingPlayRef.current = false;
      }
    }
    setPendingPlayTask(null);
  };

  const handlePlayerProgress = ({ playedSeconds }: { playedSeconds: number }) => {
    if (!activeTask || !playerRef.current || hasAutoPaused) return;

    const currentTime = playedSeconds;

    if (currentTime < activeTask.end_time - 1) {
      setHasAutoPaused(false);
    }

    if (currentTime >= activeTask.end_time) {
      setIsPlaying(false);
      setHasAutoPaused(true);
      console.log(`Auto-paused at evidence end: ${activeTask.end_time}s`);
    }
  };

  const filteredTasks = tasks.filter(task => {
    if (!filters.severities.includes(task.severity_id)) return false;
    if (!filters.task_types.includes(task.task_type)) return false;
    if (!filters.task_statuses.includes(task.task_status)) return false;

    if (daysFilter !== '') {
      if (!task.created_at) return false;
      const taskTime = new Date(task.created_at).getTime();
      if (isNaN(taskTime)) return false;
      const limitTime = Date.now() - (Number(daysFilter) * 24 * 60 * 60 * 1000);
      if (taskTime < limitTime) return false;
    }

    if (assignedToMe) {
      if (task.task_status === 'completed') return false;
    }

    return true;
  });

  // Calculate KPI metrics
  const kpiSelectedItem = siteInspections.find(
    (item) => (item.inspection_id || item.site_id) === selectedInspection
  );

  const kpiInspectionsForSiteCount = selectedMillerInspections.length;

  const activeIncidentsCount = selectedMillerIncidents.length;

  const kpiOneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const kpiWeeklyInspections = siteInspections.filter(item => {
    if (!selectedMillerInspections.includes(String(item.inspection_id || item.site_id))) return false;
    if (!item.inspection_created_at) return false;
    const createdTime = new Date(item.inspection_created_at).getTime();
    return createdTime >= kpiOneWeekAgo;
  }).length;

  const kpiStatusCounts = {
    pending: tasks.filter(t => t.task_status === 'pending').length,
    in_progress: tasks.filter(t => t.task_status === 'in_progress').length,
    review: tasks.filter(t => t.task_status === 'review').length,
    completed: tasks.filter(t => t.task_status === 'completed').length,
    failed: tasks.filter(t => t.task_status === 'failed').length,
  };

  const kpiSeverityCounts = {
    severe: tasks.filter(t => t.severity_id === 1).length,
    regular: tasks.filter(t => t.severity_id === 2).length,
    low: tasks.filter(t => t.severity_id === 3).length,
  };

  const kpiTotalTasks = tasks.length;
  const kpiCompletionRate = kpiTotalTasks > 0
    ? Math.round((kpiStatusCounts.completed / kpiTotalTasks) * 100)
    : 0;
  const kpiActiveSevere = tasks.filter(t => t.severity_id === 1 && t.task_status !== 'completed').length;

  const kpiLastInspectionObj = [...siteInspections]
    .filter(item => selectedMillerInspections.includes(String(item.inspection_id || item.site_id)))
    .filter(item => item.inspection_created_at)
    .sort((a, b) => {
      const aTime = a.inspection_created_at ? new Date(a.inspection_created_at).getTime() : 0;
      const bTime = b.inspection_created_at ? new Date(b.inspection_created_at).getTime() : 0;
      return bTime - aTime;
    })[0];
  const kpiLastInspectionDate = kpiLastInspectionObj && kpiLastInspectionObj.inspection_created_at
    ? new Date(kpiLastInspectionObj.inspection_created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : 'None';

  return (
    <div className="h-full flex flex-col">
      <input
        type="file"
        ref={fileInputRef}
        onChange={uploadIncidentVideo}
        accept="video/*"
        className="hidden"
      />

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
        <section className={`${isVideoCollapsed ? 'w-full' : 'w-full lg:w-3/5'} overflow-y-visible lg:overflow-y-auto px-1.5 pb-6 pt-0 ${theme.background.section} border border-slate-200/70 transition-all duration-300 relative`}>


          {/* Task Filters Section */}
          <div className="sticky top-0 z-20 -mx-1.5 bg-pane-bg/98 backdrop-blur-sm border-b border-slate-200/70 mb-2 shadow-md">
            <div
              onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
              className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200/70 cursor-pointer select-none hover:bg-slate-200/50 transition-colors"
            >
              <h3 className="text-base font-bold text-slate-500 flex items-center gap-2">
                <i className="fa-solid fa-filter text-slate-600 text-lg mr-2"></i>
                <span className="tracking-wide">Task Filters</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextGlobal = !isGlobalTranslationEnabled;
                    setIsGlobalTranslationEnabled(nextGlobal);
                    setFlippedTitles(new Set());
                    setFlippedDescriptions(new Set());
                  }}
                  className={`p-1 rounded-lg border transition-all ${isGlobalTranslationEnabled ? 'bg-blue-100 border-blue-200 shadow-sm' : 'hover:bg-slate-200 border-transparent'}`}
                  title="Toggle default translation for all tasks"
                >
                  <img src="/trasnlation_icon.png" alt="Translate" className="w-4 h-4 object-contain scale-[1.5]" />
                </button>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFiltersCollapsed(!isFiltersCollapsed);
                  }}
                  className={`text-white transition-all p-1 rounded-lg border ${theme.cardBorder} bg-gradient-to-r ${theme.primary.from} ${theme.primary.to}`}
                >
                  <ChevronDown className={`w-3.5 h-3.5 transform transition-transform ${isFiltersCollapsed ? '' : 'rotate-180'}`} />
                </button>
              </div>
            </div>
            {!isFiltersCollapsed && (
              <div className="h-auto px-3 py-4 bg-slate-50/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Types Filter */}
                  <div className="py-1.5 px-3 rounded-xl border border-blue-200/50 bg-gradient-to-br from-slate-50 to-blue-50/70 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-800 mb-1.5 uppercase tracking-wider">Task Type</h4>
                    <div className="flex flex-col gap-2">
                      {[
                        { id: 'install', label: '🛠️ Install' },
                        { id: 'repair', label: '🔧 Repair' },
                        { id: 'verify', label: '📋 Verify' },
                        { id: 'clear', label: '🧹 Clear' }
                      ].map((t) => {
                        const isChecked = filters.task_types.includes(t.id);
                        return (
                          <label key={t.id} className="flex items-center gap-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer select-none py-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const updated = isChecked
                                  ? filters.task_types.filter(item => item !== t.id)
                                  : [...filters.task_types, t.id];
                                setFilters({ ...filters, task_types: updated });
                              }}
                              className="sr-only"
                            />
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isChecked
                              ? 'border-slate-600 bg-slate-200/80 shadow-inner'
                              : 'border-slate-300 bg-white/50 hover:border-slate-400'
                              }`}>
                              {isChecked && (
                                <svg className={`w-3 h-3 ${theme.id === 'premiumBlue' ? 'text-blue-600' : 'text-indigo-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <span>{t.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Severity Filter */}
                  <div className="py-1.5 px-3 rounded-xl border border-blue-200/50 bg-gradient-to-br from-slate-50 to-blue-50/70 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-800 mb-1.5 uppercase tracking-wider">Severity</h4>
                    <div className="flex flex-col gap-2">
                      {[
                        { id: 1, label: '🔴 Severe' },
                        { id: 2, label: '🟡 Regular' },
                        { id: 3, label: '🟢 Low' }
                      ].map((sev) => {
                        const isChecked = filters.severities.includes(sev.id);
                        return (
                          <label key={sev.id} className="flex items-center gap-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer select-none py-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const updated = isChecked
                                  ? filters.severities.filter(item => item !== sev.id)
                                  : [...filters.severities, sev.id];
                                setFilters({ ...filters, severities: updated });
                              }}
                              className="sr-only"
                            />
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isChecked
                              ? 'border-slate-600 bg-slate-200/80 shadow-inner'
                              : 'border-slate-300 bg-white/50 hover:border-slate-400'
                              }`}>
                              {isChecked && (
                                <svg className={`w-3 h-3 ${theme.id === 'premiumBlue' ? 'text-blue-600' : 'text-indigo-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <span>{sev.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Status Filter */}
                  <div className="py-1.5 px-3 rounded-xl border border-blue-200/50 bg-gradient-to-br from-slate-50 to-blue-50/70 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-800 mb-1.5 uppercase tracking-wider">Status</h4>
                    <div className="flex flex-col gap-2">
                      {[
                        { id: 'pending', label: '🕒 Pending' },
                        { id: 'in_progress', label: '🔄 In Progress' },
                        { id: 'review', label: '👁️ Review' },
                        { id: 'completed', label: '✅ Completed' },
                        { id: 'failed', label: '❌ Failed' }
                      ].map((st) => {
                        const isChecked = filters.task_statuses.includes(st.id);
                        return (
                          <label key={st.id} className="flex items-center gap-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer select-none py-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const updated = isChecked
                                  ? filters.task_statuses.filter(item => item !== st.id)
                                  : [...filters.task_statuses, st.id];
                                setFilters({ ...filters, task_statuses: updated });
                              }}
                              className="sr-only"
                            />
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isChecked
                              ? 'border-slate-600 bg-slate-200/80 shadow-inner'
                              : 'border-slate-300 bg-white/50 hover:border-slate-400'
                              }`}>
                              {isChecked && (
                                <svg className={`w-3 h-3 ${theme.id === 'premiumBlue' ? 'text-blue-600' : 'text-indigo-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <span>{st.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quick Filters */}
                  <div className="py-2 px-3 rounded-xl border border-blue-200/50 bg-gradient-to-br from-slate-50 to-blue-50/70 shadow-sm flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 mb-1.5 uppercase tracking-wider">Quick Filters</h4>
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer select-none py-1">
                          <input
                            type="checkbox"
                            checked={assignedToMe}
                            onChange={() => {
                              setAssignedToMe(!assignedToMe);
                            }}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${assignedToMe
                            ? 'border-slate-600 bg-slate-200/80 shadow-inner'
                            : 'border-slate-300 bg-white/50 hover:border-slate-400'
                            }`}>
                            {assignedToMe && (
                              <svg className={`w-3 h-3 ${theme.id === 'premiumBlue' ? 'text-blue-600' : 'text-indigo-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span>👤 My Tasks</span>
                        </label>
                        <hr className="border-t border-blue-200/50" />

                        <div className="relative group flex flex-col gap-1">
                          <span className="text-sm font-semibold text-slate-600 select-none">Created in last</span>
                          <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-sm w-full">
                            <input
                              type="number"
                              min="0"
                              placeholder="XX"
                              value={daysFilter}
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                setDaysFilter(val);
                              }}
                              className="w-15 px-2 py-0.5 text-sm border-r border-slate-200 focus:outline-none text-slate-700 font-semibold"
                            />
                            <select
                              value={daysFilter === '' ? 'custom' : daysFilter}
                              onChange={(e) => {
                                const val = e.target.value === 'custom' ? '' : parseInt(e.target.value);
                                setDaysFilter(val);
                              }}
                              className="px-1 py-0.5 text-[11px] bg-slate-50 cursor-pointer focus:outline-none text-slate-600 border-none font-medium flex-1"
                            >
                              <option value="custom">Custom</option>
                              <option value="1">1 day</option>
                              <option value="5">5 days</option>
                              <option value="7">7 days</option>
                              <option value="15">15 days</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* KPIs Section */}
          <div className="bg-pane-bg/98 border-b border-slate-200/70 mb-2 -mx-1.5 overflow-hidden shadow-md">
            <div
              onClick={() => setIsKpisCollapsed(!isKpisCollapsed)}
              className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200/70 cursor-pointer select-none hover:bg-slate-200/50 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <i className="fa-solid fa-chart-line text-slate-600 text-lg mr-2"></i>
                <span className="tracking-wide select-none flex items-center flex-wrap gap-x-1">
                  Completion : {kpiCompletionRate}%
                  <span className="mx-4 text-slate-500"></span>
                  Open Severe : {kpiActiveSevere}
                  <span className="mx-4 text-slate-500"></span>
                  Last inspection : {kpiLastInspectionDate}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsKpisCollapsed(!isKpisCollapsed);
                }}
                className={`text-white transition-all p-1 rounded-lg border ${theme.cardBorder} bg-gradient-to-r ${theme.primary.from} ${theme.primary.to}`}
              >
                <ChevronDown className={`w-3.5 h-3.5 transform transition-transform ${isKpisCollapsed ? '' : 'rotate-180'}`} />
              </button>
            </div>
            {!isKpisCollapsed && (
              <div className="h-[180px] p-3 bg-slate-50/50 overflow-y-auto dropdown-scrollbar">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 justify-center items-center">
                  {/* KPI Tile 1 */}
                  <div className="p-2.5 bg-gradient-to-br from-slate-50 to-blue-50/70 border border-blue-200/50 rounded-xl shadow-sm flex flex-col justify-between h-[135px] w-full max-w-[210px] mx-auto">
                    <div className="text-xs text-slate-700 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex flex-col border-b border-slate-300/80 pb-2 mb-2">
                          <span className="font-bold text-slate-900 truncate">
                            {selectedMillerSites.length === 0
                              ? "None"
                              : selectedMillerSites.length === backendSites.length
                                ? "All Sites"
                                : selectedMillerSites.length === 1
                                  ? selectedMillerSites[0]
                                  : `${selectedMillerSites.length} Selected`}
                          </span>
                        </div>
                        <div className="flex justify-between mb-1.5">
                          <span className="font-medium text-slate-500">Inspections:</span>
                          <span className="font-bold text-slate-900">{kpiInspectionsForSiteCount}</span>
                        </div>
                        <div className="flex justify-between mb-1.5">
                          <span className="font-medium text-slate-500">Incidents:</span>
                          <span className="font-bold text-slate-900">{activeIncidentsCount}</span>
                        </div>
                        <div className="flex justify-between mb-1.5">
                          <span className="font-medium text-slate-500">Last Inspection:</span>
                          <span className="font-bold text-slate-900">{kpiLastInspectionDate}</span>
                        </div>
                        <div className="flex justify-between mb-1.5">
                          <span className="font-medium text-slate-500">Last one week inspections:</span>
                          <span className="font-bold text-slate-900">{kpiWeeklyInspections}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* KPI Tile 2 */}
                  <div className="p-2.5 bg-gradient-to-br from-slate-50 to-blue-50/70 border border-blue-200/50 rounded-xl shadow-sm flex flex-col justify-between h-[135px] w-full max-w-[210px] mx-auto">
                    <div className="text-xs text-slate-700 space-y-1">
                      <div className="flex flex-col border-b border-slate-300/80 pb-2 mb-2">
                        <span className="font-bold text-slate-900 truncate">Site Health</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2.5 text-slate-700 p-0.1">
                        <div className="aspect-square flex flex-col items-center justify-center bg-amber-100/70 border border-amber-200/80 rounded-lg p-1 shadow-sm hover:shadow-md transition-shadow duration-200">
                          <span className="text-[8px] sm:text-[9.5px] text-amber-800/90 font-bold uppercase mb-1 truncate w-full text-center">Pending</span>
                          <span className="text-base sm:text-xl font-black text-amber-950 tracking-tight">{kpiStatusCounts.pending}</span>
                        </div>
                        <div className="aspect-square flex flex-col items-center justify-center bg-sky-100/70 border border-sky-200/80 rounded-lg p-1 shadow-sm hover:shadow-md transition-shadow duration-200">
                          <span className="text-[8px] sm:text-[9.5px] text-sky-800/90 font-bold uppercase mb-1 truncate w-full text-center">Active</span>
                          <span className="text-base sm:text-xl font-black text-sky-950 tracking-tight">{kpiStatusCounts.in_progress}</span>
                        </div>
                        <div className="aspect-square flex flex-col items-center justify-center bg-purple-100/70 border border-purple-200/80 rounded-lg p-1 shadow-sm hover:shadow-md transition-shadow duration-200">
                          <span className="text-[8px] sm:text-[9.5px] text-purple-800/90 font-bold uppercase mb-1 truncate w-full text-center">Review</span>
                          <span className="text-base sm:text-xl font-black text-amber-950 tracking-tight">{kpiStatusCounts.review}</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.25 mt-2.25">
                        <div className="flex-1 bg-slate-200 border border-slate-350 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${theme.primary.from} ${theme.primary.to} transition-all duration-500`}
                            style={{ width: `${kpiCompletionRate}%` }}
                          ></div>
                        </div>
                        <span className="text-[11px] font-bold text-slate-700 leading-none shrink-0">{kpiCompletionRate}% done</span>
                      </div>
                    </div>
                  </div>

                  {/* KPI Tile 3 */}
                  <div className="p-2.5 bg-gradient-to-br from-slate-50 to-blue-50/70 border border-blue-200/50 rounded-xl shadow-sm flex flex-col justify-between h-[135px] w-full max-w-[210px] mx-auto col-span-2 sm:col-span-1">
                    <div className="text-xs text-slate-700 space-y-1 flex-1">
                      <div className="flex flex-col border-b border-slate-300/80 pb-2 mb-2">
                        <span className="font-bold text-slate-900 truncate">Task Severity</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 p-0.1 text-[8.5px] text-slate-700">
                        <div className="h-9 w-full flex flex-row items-center justify-center gap-1.5 bg-red-50/70 border border-red-200/60 rounded-lg shadow-sm">
                          <span className="text-[11px] text-red-600 font-bold uppercase leading-none">Severe:</span>
                          <span className="text-[13px] font-extrabold text-red-700 leading-none">{kpiSeverityCounts.severe}</span>
                        </div>
                        <div className="h-9 w-full flex flex-row items-center justify-center gap-1.5 bg-yellow-50/70 border border-yellow-200/60 rounded-lg shadow-sm">
                          <span className="text-[10px] text-yellow-600 font-bold uppercase leading-none">Regular:</span>
                          <span className="text-[13px] font-extrabold text-yellow-800 leading-none">{kpiSeverityCounts.regular}</span>
                        </div>
                        <div className="h-9 w-full flex flex-row items-center justify-center gap-1.5 bg-green-50/70 border border-green-200/60 rounded-lg shadow-sm">
                          <span className="text-[10px] text-green-600 font-bold uppercase leading-none">Low:</span>
                          <span className="text-[13px] font-extrabold text-green-700 leading-none">{kpiSeverityCounts.low}</span>
                        </div>
                        <div className="h-9 w-full flex flex-row items-center justify-center gap-1.5 bg-slate-100/70 border border-slate-200/60 rounded-lg shadow-sm">
                          <span className="text-[10px] text-slate-500 font-bold uppercase leading-none">Total:</span>
                          <span className="text-[13px] font-extrabold text-slate-800 leading-none">{kpiTotalTasks}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tasks Feed */}
          {tasksLoading ? (
            <div className="text-center py-12 text-blue-500">
              <Loader className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-xs font-medium animate-pulse">Syncing feed...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No tasks available for this incident.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => {
                const isExpanded = expandedTasks.has(task.id);
                return (
                  <div
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    className={`cursor-pointer bg-gradient-to-br from-slate-50 to-blue-50/70 rounded-xl border-2 shadow-lg hover:shadow-xl transition-all duration-300 ${activeTask?.id === task.id
                      ? `border-blue-500 ring-4 ring-blue-500/20 shadow-blue-500/20`
                      : `${theme.cardBorder} hover:border-blue-300`
                      }`}
                  >
                    <div className="space-y-1.5 p-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`w-[26px] h-[26px] rounded-lg flex items-center justify-center shadow-md text-white shrink-0 ${task.severity_id === 1 ? 'bg-gradient-to-br from-red-500 to-pink-600' :
                            task.severity_id === 2 ? 'bg-gradient-to-br from-yellow-400 to-orange-500' :
                              task.severity_id === 3 ? 'bg-gradient-to-br from-green-400 to-green-600' :
                                'bg-gradient-to-br from-yellow-400 to-orange-500'
                            }`}>
                            <i className={`fa-solid ${getTaskTypeIcon(task.task_type)} text-[11.5px] bg-gradient-to-r from-white to-gray-200 bg-clip-text text-transparent`}></i>
                          </div>
                          {editingTaskId === task.id ? (
                            <input
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 min-w-0 pr-2 rounded-xl border border-slate-300/80 bg-gradient-to-br from-slate-50 to-blue-50/70 px-2 py-1 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none"
                            />
                          ) : (
                            (() => {
                              const isTitleFlipped = flippedTitles.has(task.id);
                              const showTranslatedTitle = isGlobalTranslationEnabled ? !isTitleFlipped : isTitleFlipped;
                              const displayTitle = (showTranslatedTitle && task.task_translated_title) ? task.task_translated_title : task.task_title;
                              const isCurrentlyTranslated = (showTranslatedTitle && !!task.task_translated_title);
                              return (
                                <h3 className="font-semibold text-slate-900 text-sm break-words min-w-0 flex-1 flex items-center gap-3 select-none">
                                  <span>{displayTitle}</span>
                                  {task.task_translated_title && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setFlippedTitles(prev => {
                                          const next = new Set(prev);
                                          if (next.has(task.id)) next.delete(task.id);
                                          else next.add(task.id);
                                          return next;
                                        });
                                        setFlippedDescriptions(prev => {
                                          const next = new Set(prev);
                                          if (next.has(task.id)) next.delete(task.id);
                                          else next.add(task.id);
                                          return next;
                                        });
                                      }}
                                      className={`p-0.5 rounded transition-colors shrink-0 ${isCurrentlyTranslated ? 'bg-blue-100 border border-blue-200 shadow-sm' : 'hover:bg-slate-100 border-transparent'}`}
                                      title={isCurrentlyTranslated ? "Show original English" : "Show translation"}
                                    >
                                      <img src="/trasnlation_icon.png" alt="Translate" className="w-4 h-4 object-contain scale-[1.25]" />
                                    </button>
                                  )}
                                </h3>
                              );
                            })()
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {editingTaskId !== task.id && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTaskForEditing(task);
                                }}
                                title="Modify task"
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                              >
                                <i className="fa-solid fa-pen text-[10px]" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTaskClick(task, true);
                                }}
                                title="Play video"
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                              >
                                <i className="fa-solid fa-play text-[10px]" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-4 mt-2">
                        <div className="min-w-0 flex-1">
                          {editingTaskId === task.id ? (
                            <div className="space-y-3">
                              <textarea
                                value={editingDescription}
                                onChange={(e) => setEditingDescription(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                rows={Math.max(2, (task.task_description ? task.task_description.split('\n').length * 2 : 2))}
                                className="w-full rounded-2xl border border-slate-300/80 bg-gradient-to-br from-slate-50 to-blue-50/70 p-3 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
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
                                  className={`px-3 py-1.5 min-w-[72px] bg-gradient-to-r ${theme.primary.from} ${theme.primary.to} hover:brightness-110 text-white rounded-xl text-[11px] font-bold shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50`}
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
                            (() => {
                              const isDescFlipped = flippedDescriptions.has(task.id);
                              const showTranslatedDesc = isGlobalTranslationEnabled ? !isDescFlipped : isDescFlipped;
                              const displayDesc = (showTranslatedDesc && task.task_translated_description) ? task.task_translated_description : task.task_description;
                              return (
                                <div className="flex flex-col min-w-0 flex-1">
                                  <p
                                    onClick={(e) => {
                                      if (task.task_translated_description) {
                                        e.stopPropagation();
                                        setFlippedTitles(prev => {
                                          const next = new Set(prev);
                                          if (next.has(task.id)) next.delete(task.id);
                                          else next.add(task.id);
                                          return next;
                                        });
                                        setFlippedDescriptions(prev => {
                                          const next = new Set(prev);
                                          if (next.has(task.id)) next.delete(task.id);
                                          else next.add(task.id);
                                          return next;
                                        });
                                      }
                                    }}
                                    className={`text-black text-sm font-normal ${isExpanded ? 'whitespace-pre-wrap' : 'truncate'} ${task.task_translated_description ? 'cursor-pointer hover:text-blue-600 transition-colors select-none' : ''}`}
                                  >
                                    {displayDesc}
                                  </p>
                                </div>
                              );
                            })()
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {editingTaskId === task.id ? (
                            <select
                              value={editingSeverity}
                              onChange={(e) => setEditingSeverity(parseInt(e.target.value))}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] border border-slate-300/80 rounded-lg px-1 py-1 bg-gradient-to-br from-slate-50 to-blue-50/70 text-slate-700 h-[26px]"
                            >
                              <option value={1}>🔴 Severe</option>
                              <option value={2}>🟡 Regular</option>
                              <option value={3}>🟢 Low</option>
                            </select>
                          ) : null}

                          {editingTaskId === task.id ? (
                            <select
                              value={editingStatus}
                              onChange={(e) => setEditingStatus(parseInt(e.target.value))}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] border border-slate-300/80 rounded-lg px-1 py-1 bg-gradient-to-br from-slate-50 to-blue-50/70 text-slate-700 h-[26px]"
                            >
                              <option value={1}>🕒 Pending</option>
                              <option value={2}>🔄 In Progress</option>
                              <option value={3}>👁️ Review</option>
                              <option value={4}>✅ Completed</option>
                              <option value={5}>❌ Failed</option>
                            </select>
                          ) : (
                            task.status_label && (
                              <>
                                <div className="hidden sm:flex items-center gap-1.5 text-xs capitalize text-slate-500 border border-slate-200 rounded px-2 py-0.5 bg-slate-50/50">
                                  <i className={`fa-solid ${getTaskStatusIcon(task.task_status)} ${getTaskStatusColor(task.task_status)} text-[11px]`} />
                                  <span>{task.status_label}</span>
                                </div>
                                <span className="inline sm:hidden text-sm" title={task.status_label}>
                                  {task.task_status === 'pending' ? '🕒' :
                                    task.task_status === 'in_progress' ? '🔄' :
                                      task.task_status === 'review' ? '👁️' :
                                        task.task_status === 'completed' ? '✅' :
                                          task.task_status === 'failed' ? '❌' : '❓'}
                                </span>
                              </>
                            )
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTaskExpansion(task.id);
                            }}
                            className="text-slate-500 hover:text-blue-600 transition-colors p-1 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200 flex items-center justify-center ml-1.5"
                          >
                            <ChevronLeft className={`w-4.5 h-4.5 transform transition-transform ${isExpanded ? 'rotate-90' : '-rotate-90'}`} />
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
          <aside className={`w-full lg:w-2/5 ${theme.header.bg.replace(/bg-gradient-to-r/g, 'bg-gradient-to-b')} flex flex-col shadow-inner relative border-t lg:border-t-0 lg:border-l border-slate-700 mt-4 lg:mt-0`}>
            <div className="absolute inset-0 bg-white/10 pointer-events-none" />
            <div className="px-1.5 py-1 pb-40 flex-1 h-full overflow-y-auto relative z-10 dropdown-scrollbar flex flex-col">
              <div className="flex items-center justify-between py-1 mb-1 shrink-0">
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

              <div className={`relative w-full h-[75%] shrink-0 bg-black rounded-2xl overflow-hidden border transition-all duration-500 shadow-2xl flex flex-col ${activeTask?.severity_id === 1 ? 'border-red-500/50 shadow-red-500/10' :
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
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                    <AlertCircle className="w-8 h-8 opacity-20" />
                    <p className="text-xs font-medium uppercase tracking-widest opacity-40">
                      {activeTask ? 'Evidence Unavailable' : 'Awaiting Task Selection'}
                    </p>
                  </div>
                )}

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
                        className={`flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r ${theme.primary.from} ${theme.primary.to} hover:brightness-110 text-white text-xs font-bold rounded-full transition-all active:scale-95`}
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

            </div>
          </aside>
        )}

        {/* Collapsed Video Toggle */}
        {isVideoCollapsed && (
          <button
            onClick={() => setIsVideoCollapsed(false)}
            className={`w-12 bg-gradient-to-r ${theme.primary.from} ${theme.primary.to} hover:brightness-110 text-white flex items-center justify-center transition-all duration-200 border-l-2 border-white/20 shadow-lg`}
            title="Expand Video Pane"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </main>



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
    </div >
  );
}
