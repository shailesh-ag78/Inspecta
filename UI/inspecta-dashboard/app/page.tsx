"use client";

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronLeft, Play, User, AlertCircle, Loader } from 'lucide-react';
import { themes, defaultTheme, type Theme } from '@/lib/themes';

interface Site {
  id: string;
  name: string;
  floor: string;
  lastModified: string;
  address?: string;
  company_name?: string;
  industry_name?: string;
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
  // State management
  const [sites, setSites] = useState<Site[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [filters, setFilters] = useState({
    severity: 'all',
    task_type: 'all',
    task_status: 'all'
  });
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);
  const [isVideoCollapsed, setIsVideoCollapsed] = useState(false);
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [selectedIncident, setSelectedIncident] = useState<string>('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [taskSaveLoading, setTaskSaveLoading] = useState(false);
  const [taskEditError, setTaskEditError] = useState<string | null>(null);
  const [pendingPlayTask, setPendingPlayTask] = useState<{ id: string; start: number; end: number } | null>(null);
  // FIX 1: Track playing state to conditionally show/hide the overlay button
  const [isPlaying, setIsPlaying] = useState(false);

  // Loading and error states
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const [hasAutoPaused, setHasAutoPaused] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Fetch sites on component mount
  useEffect(() => {
    const fetchSites = async () => {
      try {
        setSitesLoading(true);
        setSitesError(null);
        const response = await fetch('/api/sites');

        if (!response.ok) {
          throw new Error(`Failed to fetch sites: ${response.statusText}`);
        }

        const data = await response.json();
        setSites(data);

        // Auto-select first site
        if (data.length > 0) {
          setSelectedSite(data[0].id);
        }
      } catch (error) {
        console.error('Error fetching sites:', error);
        setSitesError(error instanceof Error ? error.message : 'Failed to fetch sites');
      } finally {
        setSitesLoading(false);
      }
    };

    fetchSites();
  }, []);

  // Fetch incidents when site changes
  useEffect(() => {
    if (!selectedSite) return;

    const fetchIncidents = async () => {
      try {
        setIncidentsLoading(true);
        setIncidentsError(null);
        const response = await fetch(`/api/incidents?siteId=${selectedSite}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch incidents: ${response.statusText}`);
        }

        const data = await response.json();
        setIncidents(data);

        // Auto-select first incident
        if (data.length > 0) {
          setSelectedIncident(data[0].id);
        } else {
          setSelectedIncident('');
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
  }, [selectedSite]);

  // Fetch tasks when incident changes
  useEffect(() => {
    if (!selectedIncident) return;

    const fetchTasks = async () => {
      try {
        setTasksLoading(true);
        setTasksError(null);
        console.log(`Fetching tasks for incident ${selectedIncident}...`);
        const response = await fetch(`/api/tasks?incidentId=${selectedIncident}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch tasks: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Fetched tasks:', data);
        setTasks(data);

        // Expand all tasks initially
        setExpandedTasks(new Set(data.map((_: any, idx: number) => idx)));
      } catch (error) {
        console.error('Error fetching tasks:', error);
        setTasksError(error instanceof Error ? error.message : 'Failed to fetch tasks');
      } finally {
        setTasksLoading(false);
      }
    };

    fetchTasks();
  }, [selectedIncident]);

  useEffect(() => {
    setHasAutoPaused(false);
  }, [activeTask?.id]);

  const handleSiteChange = (siteId: string) => {
    setSelectedSite(siteId);
  };

  const handleTaskClick = (task: Task, shouldPlay = false) => {
    console.log(`Task clicked: ${task.id} : {task.task_title}`);
    setActiveTask(task);
    setHasAutoPaused(false);
    if (shouldPlay) {
      setPendingPlayTask({ id: task.id, start: task.start_time, end: task.end_time });
    } else {
      setPendingPlayTask(null);
    }
  };

  const handleActiveVideoPlay = () => {
    if (!activeTask || !videoRef.current) return;
    const video = videoRef.current;
    // Seek to task start time then play — direct call, no state indirection
    video.currentTime = activeTask.start_time;
    video.play().catch((err) => console.error('Video play failed:', err));
  };

  // CRITICAL FIX: Update video position and panel state when activeTask changes
  useEffect(() => {
    if (activeTask && videoRef.current) {
      // Reset the auto-pause flag for the new task range
      setHasAutoPaused(false);
      
      // Manually set the video time to the start of the new task
      videoRef.current.currentTime = activeTask.start_time;
      
      // Clear any pending play tasks as we've handled the seek manually
      setPendingPlayTask(null);
    }
  }, [activeTask?.id]); // This triggers on every task switch, even if the video URL is the same


  const formatTime = (seconds: number) => {
    console.log(`Formatting time for ${seconds} seconds`);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    console.log(`Formatting time: ${seconds}s as ${mins}m:${secs}s`);
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

  const toggleTaskExpansion = (index: number) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedTasks(newExpanded);
  };

  const startEditingTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.task_title || '');
    setEditingDescription(task.task_description || '');
    setTaskEditError(null);
  };

  const cancelEditingTask = () => {
    setEditingTaskId(null);
    setEditingTitle('');
    setEditingDescription('');
    setTaskEditError(null);
  };

  const saveTaskEdits = async (task: Task) => {
    const trimmedTitle = editingTitle.trim();
    const trimmedDescription = editingDescription.trim();
    if (
      trimmedTitle === task.task_title.trim() &&
      trimmedDescription === task.task_description.trim()
    ) {
      cancelEditingTask();
      return;
    }

    try {
      setTaskSaveLoading(true);
      setTaskEditError(null);

      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: task.id,
          task_title: trimmedTitle,
          task_description: trimmedDescription,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to save task');
      }

      const updatedTask = await response.json();
      setTasks((prevTasks) => prevTasks.map((item) => item.id === task.id ? {
        ...item,
        task_title: updatedTask.task_title || trimmedTitle,
        task_description: updatedTask.task_description || trimmedDescription,
      } : item));

      if (activeTask?.id === task.id) {
        setActiveTask({
          ...task,
          task_title: updatedTask.task_title || trimmedTitle,
          task_description: updatedTask.task_description || trimmedDescription,
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

  const openTaskForEditing = (task: Task, index: number) => {
    const nextExpanded = new Set(expandedTasks);
    nextExpanded.add(index);
    setExpandedTasks(nextExpanded);
    startEditingTask(task);
  };

  // When activeTask's video_url changes, reload the video element to
  // clear any stale browser buffer from the previous src, and reset play state.
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      setIsPlaying(false);
    }
  }, [activeTask?.video_url]);

  // Otherwise, handleVideoLoadedMetadata is the single source of truth for seeking.
  useEffect(() => {
    if (!pendingPlayTask || !videoRef.current) return;
    const video = videoRef.current;
    if (video.readyState >= 2) {
      video.currentTime = pendingPlayTask.start;
      video.play().catch((err) => console.error('Video play failed:', err));
      setPendingPlayTask(null);
    }
    // Otherwise wait for onLoadedMetadata to fire.
  }, [pendingPlayTask]);

  const handleVideoLoadedMetadata = () => {
    if (!pendingPlayTask || !videoRef.current) return;
    if (activeTask?.id !== pendingPlayTask.id) return;

    videoRef.current.currentTime = pendingPlayTask.start;
    videoRef.current.play().catch((error) => {
      console.error('Video play failed:', error);
    });
    setPendingPlayTask(null);
  };

  const handleVideoTimeUpdate = () => {
    if (!activeTask || !videoRef.current || hasAutoPaused) return;
    if (videoRef.current.currentTime >= activeTask.end_time) {
      videoRef.current.pause();
      setHasAutoPaused(true); // "Unlock" the video so subsequent plays work
      console.log(`Auto-paused at evidence end: ${activeTask.end_time}s`);
    }
  };

  // Return undefined instead of a broken fallback path.
  const getVideoSrc = (videoUrl?: string): string | undefined => {
    if (!videoUrl) return undefined;

    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      return videoUrl;
    }

    return `/api/video?path=${encodeURIComponent(videoUrl)}`;
  };

  const filteredTasks = tasks.filter(task => {
    if (filters.severity !== 'all' && task.severity_id !== parseInt(filters.severity)) return false;
    if (filters.task_type !== 'all' && task.task_type !== filters.task_type) return false;
    if (filters.task_status !== 'all' && task.task_status !== filters.task_status) return false;
    return true;
  });

  return (
    <div className={`h-screen flex flex-col bg-gradient-to-br ${theme.background.gradient}`}>
      {/* Header */}
      <header className={`${theme.header.bg} ${theme.header.text} shrink-0 border-b border-slate-300/20 shadow-lg`}>
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* <div className="h-11 w-11 rounded-[14px] bg-white/10 border border-white/10 flex items-center justify-center text-white shadow-sm">
              <span className="font-black text-lg">I</span>
            </div> */}
            <div className="h-11 w-11 rounded-[14px] bg-white/10 border border-white/10 flex items-center justify-center shadow-sm">
              <img src="/inspectalogo.png" alt="Logo" className="h-full w-full object-cover rounded-full" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/80">INSPECTA</div>
              <div className="text-2xl font-bold">Task Dashboard</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`relative rounded-2xl border ${theme.filters.border} bg-white/10 px-3 py-2 text-sm text-white shadow-sm`}>
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/70">Site</span>
              {sitesLoading ? (
                <Loader className="w-4 h-4 animate-spin text-white/70 ml-2" />
              ) : (
                <select
                  value={selectedSite}
                  onChange={(e) => handleSiteChange(e.target.value)}
                  className="w-full bg-transparent border-none text-sm text-white outline-none appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-white/30"
                >
                  {sites.length === 0 && <option className="text-slate-900 bg-white">No sites available</option>}
                  {sites.map(site => (
                    <option key={site.id} value={site.id} className="text-slate-900 bg-white">{site.name} - {site.floor}</option>
                  ))}
                </select>
              )}
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
            </div>
            <div className={`relative rounded-2xl border ${theme.filters.border} bg-white/10 px-3 py-2 text-sm text-white shadow-sm`}>
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/70">Incident</span>
              {incidentsLoading ? (
                <Loader className="w-4 h-4 animate-spin text-white/70 ml-2" />
              ) : (
                <select
                  value={selectedIncident}
                  onChange={(e) => setSelectedIncident(e.target.value)}
                  className="w-full bg-transparent border-none text-sm text-white outline-none appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-white/30"
                >
                  {incidents.length === 0 && <option className="text-slate-900 bg-white">No incidents available</option>}
                  {incidents.map(incident => (
                    <option key={incident.id} value={incident.id} className="text-slate-900 bg-white">{incident.title}</option>
                  ))}
                </select>
              )}
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
            </div>

            <div className="relative">
              <button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                title="Profile Settings"
              >
                <User className="w-5 h-5" />
              </button>
              {showSettingsMenu && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700 shadow-xl z-50">
                  <div className="px-4 py-3 border-b border-slate-700">
                    <div className="font-medium text-white">Profile</div>
                    <div className="text-xs text-slate-400 mt-1">Settings</div>
                    <div className="text-[10px] text-slate-500 mt-2">Ver 6.0</div>
                  </div>
                  <div className="p-2">
                    <div className="px-3 py-2 text-xs font-medium text-slate-300 uppercase tracking-wider">Theme</div>
                    {Object.values(themes).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTheme(t);
                          setShowSettingsMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all mb-1 ${
                          theme.id === t.id
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
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Error Messages */}
      {(sitesError || incidentsError || tasksError) && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            {sitesError && <div>Sites Error: {sitesError}</div>}
            {incidentsError && <div>Incidents Error: {incidentsError}</div>}
            {tasksError && <div>Tasks Error: {tasksError}</div>}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left Pane - Task Feed */}
        <section className={`${isVideoCollapsed ? 'w-full' : 'w-3/5'} overflow-y-auto p-6 bg-gradient-to-br ${theme.background.section} border border-slate-200/70 transition-all duration-300`}>
          <div className="mb-4"></div>

          {/* Filters */}
          <div className="mb-6 bg-slate-100/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/70">
            <div className="flex items-center justify-between p-4 border-b border-slate-200/70">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-3">
                <i className={`fa-solid fa-filter ${theme.primary.from} ${theme.primary.to} bg-gradient-to-r text-white text-xs p-1.5 rounded-lg`}></i>
                Task Filters
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
                  className={`text-white transition-all p-2 rounded-lg border border-transparent bg-gradient-to-r ${theme.primary.from} ${theme.primary.to}`}
                >
                  <ChevronDown className={`w-5 h-5 transform transition-transform ${isFiltersCollapsed ? '' : 'rotate-180'}`} />
                </button>
              </div>
            </div>
            {!isFiltersCollapsed && (
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <select
                      value={filters.severity}
                      onChange={(e) => setFilters({...filters, severity: e.target.value})}
                      className={`w-full text-sm border ${theme.filters.border} rounded-lg px-3 py-2 bg-white text-slate-700 focus:${theme.filters.focus} transition-all`}
                    >
                      <option value="all">All Severities</option>
                      <option value="1">🔴 Severe</option>
                      <option value="2">🟡 Regular</option>
                      <option value="3">🟢 Low</option>
                    </select>
                  </div>
                  <div>
                    <select
                      value={filters.task_type}
                      onChange={(e) => setFilters({...filters, task_type: e.target.value})}
                      className={`w-full text-sm border ${theme.filters.border} rounded-lg px-3 py-2 bg-white text-slate-700 focus:${theme.filters.focus} transition-all`}
                    >
                      <option value="all">All Types</option>
                      <option value="install">🔧 Install</option>
                      <option value="repair">🔨 Repair</option>
                      <option value="verify">📋 Verify</option>
                      <option value="clear">🧹 Clear</option>
                    </select>
                  </div>
                  <div>
                    <select
                      value={filters.task_status}
                      onChange={(e) => setFilters({...filters, task_status: e.target.value})}
                      className={`w-full text-sm border ${theme.filters.border} rounded-lg px-3 py-2 bg-white text-slate-700 focus:${theme.filters.focus} transition-all`}
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending">● Pending</option>
                      <option value="in_progress">⟳ In Progress</option>
                      <option value="review">🔍 Review</option>
                      <option value="completed">✓ Completed</option>
                      <option value="failed">✗ Failed</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tasks List */}
          {filteredTasks.length === 0 && !tasksLoading ? (
            <div className="text-center py-12 text-slate-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No tasks available for this incident.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTasks.map((task, index) => {
                const isExpanded = expandedTasks.has(index);
                return (
                  <div
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    className={`cursor-pointer bg-white/90 backdrop-blur-sm rounded-xl border-2 shadow-lg hover:shadow-xl transition-all duration-300 ${
                      activeTask?.id === task.id
                        ? `border-blue-500 ring-4 ring-blue-500/20 shadow-blue-500/20`
                        : `${theme.cardBorder} hover:border-blue-300`
                    }`}
                  >
                    {/* Task Header - Always Visible */}
                    <div className="space-y-2 p-2.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-lg ${
                            task.severity_id === 1 ? 'bg-gradient-to-br from-red-500 to-pink-600 text-white' : 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white'
                          }`}>
                            <i className={`fa-solid ${getTaskTypeIcon(task.task_type)} text-[10px] bg-gradient-to-r from-white to-gray-200 bg-clip-text text-transparent`}></i>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-nowrap">
                              {editingTaskId === task.id ? (
                                <input
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  /*className="flex-[1.15] min-w-0 pr-2 rounded-2xl border border-slate-300/80 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"*/
                                  /* Changed flex-[1.15] to w-80 (320px) */
                                  className="w-96 min-w-0 pr-2 rounded-2xl border border-slate-300/80 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                />
                              ) : (
                                /*<h3 className="flex-[1.15] min-w-0 pr-2 font-semibold text-slate-900 text-sm truncate">{task.task_title}</h3>*/
                                /* Changed flex-[1.15] to w-80 to match the input width */
                                <h3 className="w-96 min-w-0 pr-2 font-semibold text-slate-900 text-sm truncate">
                                  {task.task_title}
                                </h3>
                              )}
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
                                  openTaskForEditing(task, index);
                                }}
                                title="Modify task"
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-colors"
                              >
                                <i className="fa-solid fa-pen text-[11px]" />
                              </button>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                              {task.status_label && (
                                <div className="flex items-center gap-2 text-xs capitalize text-slate-500">
                                  <span>{task.status_label}</span>
                                  <i className={`fa-solid ${getTaskStatusIcon(task.task_status)} ${getTaskStatusColor(task.task_status)} text-[11px]`} />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2 py-1 rounded text-white ${
                            task.severity_id === 1 ? 'bg-red-600' : 'bg-yellow-500'
                          }`}>
                            {task.severity_id === 1 ? 'SEVERE' : task.severity_id === 3 ? 'LOW' : 'REGULAR'}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTaskExpansion(index);
                            }}
                            className="text-slate-500 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200 flex items-center justify-center"
                          >
                            <ChevronLeft className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-90' : '-rotate-90'}`} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Content */}
                    {isExpanded && (
                      <>
                        <div className="px-2.5 pb-1.5">
                          {editingTaskId === task.id ? (
                            <div className="space-y-3">
                              <textarea
                                value={editingDescription}
                                onChange={(e) => setEditingDescription(e.target.value)}
                                rows={4}
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
                            <p className="text-slate-600 text-sm mb-3 leading-relaxed">{task.task_description}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Pane - Evidence Vault */}
        {!isVideoCollapsed && (
          <aside className="w-2/5 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col shadow-inner relative border-l border-slate-700">
            <button
              onClick={() => setIsVideoCollapsed(true)}
              className={`absolute top-4 right-4 z-20 w-10 h-10 bg-gradient-to-r ${theme.primary.from} ${theme.primary.to} text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-white/20 hover:scale-105`}
              title="Collapse Video Pane"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="p-6 pt-16 sticky top-0 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-400" /> VIDEO EVIDENCE
                </h3>
                <span className="text-[10px] text-slate-400 font-mono bg-slate-800/50 px-2 py-1 rounded">
                  {activeTask?.video_url ? 'LINKED' : 'NONE'}
                </span>
              </div>

              {/* Video container — no overlay div at all so native controls are always clickable */}
              <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-700 shadow-2xl">
                {getVideoSrc(activeTask?.video_url) ? (
                  <video
                    ref={videoRef}
                    controls
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    // Full size, sits on top of everything, controls always reachable
                    className="w-full h-full object-cover"
                    src={getVideoSrc(activeTask?.video_url)}
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                    {activeTask ? 'No video evidence for this task.' : 'Select a task to view video.'}
                  </div>
                )}
              </div>

              {/* Play-from-timestamp button lives OUTSIDE the video box so it never
                  overlaps the native controls. Only shown when paused and src exists. */}
              {getVideoSrc(activeTask?.video_url) && !isPlaying && (
                <div className="flex justify-center mt-3">
                  <button
                    onClick={handleActiveVideoPlay}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-full shadow-lg transition-all"
                    title="Play from task start time"
                  >
                    <Play className="w-4 h-4 ml-0.5" />
                    Play from {activeTask ? formatTime(activeTask.start_time) : '00:00'}
                  </button>
                </div>
              )}

              <div className="mt-8">
                <h4 className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-3">Task Details</h4>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 leading-relaxed">
                  {activeTask ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-slate-400 text-xs font-semibold">Title:</p>
                        <p className="text-slate-200 text-sm">{activeTask.task_title}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs font-semibold">Status:</p>
                        <p className="text-slate-200 text-sm capitalize">{activeTask.task_status}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs font-semibold">Severity:</p>
                        <p className="text-slate-200 text-sm">{activeTask.severity_label}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs font-semibold">Time Range:</p>
                        <p className="text-slate-200 text-sm">{formatTime(activeTask.start_time)} - {formatTime(activeTask.end_time)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs font-semibold">Evidence at:</p>
                        <p className="text-blue-400 text-sm font-mono">{formatTime(activeTask.start_time)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-300 text-sm">Select a task to view details.</p>
                  )}
                </div>
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
    </div>
  );
}
