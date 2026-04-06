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
  
  // Loading and error states
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  
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
        const response = await fetch(`/api/tasks?incidentId=${selectedIncident}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch tasks: ${response.statusText}`);
        }
        
        const data = await response.json();
        setTasks(data);
        
        // Expand all tasks initially
        setExpandedTasks(new Set(data.map((_, idx) => idx)));
      } catch (error) {
        console.error('Error fetching tasks:', error);
        setTasksError(error instanceof Error ? error.message : 'Failed to fetch tasks');
      } finally {
        setTasksLoading(false);
      }
    };

    fetchTasks();
  }, [selectedIncident]);

  const handleSiteChange = (siteId: string) => {
    setSelectedSite(siteId);
  };

  const handleTaskClick = (task: Task) => {
    setActiveTask(task);
    if (videoRef.current) {
      videoRef.current.currentTime = task.start_time;
    }
  };

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

  const toggleTaskExpansion = (index: number) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedTasks(newExpanded);
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
            <div className="h-11 w-11 rounded-[14px] bg-white/10 border border-white/10 flex items-center justify-center text-white shadow-sm">
              <span className="font-black text-lg">I</span>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/80">INSPECTA</div>
              <div className="text-2xl font-bold">Home Dashboard</div>
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
                  {sites.length === 0 && <option>No sites available</option>}
                  {sites.map(site => (
                    <option key={site.id} value={site.id}>{site.name} - {site.floor}</option>
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
                  {incidents.length === 0 && <option>No incidents available</option>}
                  {incidents.map(incident => (
                    <option key={incident.id} value={incident.id}>{incident.title}</option>
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
                <button className={`text-xs bg-gradient-to-r ${theme.primary.from} ${theme.primary.to} text-white px-3 py-1.5 rounded-lg shadow-md hover:shadow-lg font-bold transition-all duration-200`}>
                  Apply All
                </button>
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
                    className={`bg-white/90 backdrop-blur-sm rounded-xl border-2 shadow-lg hover:shadow-xl transition-all duration-300 ${
                      activeTask?.id === task.id
                        ? `border-blue-500 ring-4 ring-blue-500/20 shadow-blue-500/20`
                        : `${theme.cardBorder} hover:border-blue-300`
                    }`}
                  >
                    {/* Task Header - Always Visible */}
                    <div className="space-y-2 p-2.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
                            task.severity_id === 1 ? 'bg-gradient-to-br from-red-500 to-pink-600 text-white' : 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white'
                          }`}>
                            <i className={`fa-solid ${getTaskTypeIcon(task.task_type)} text-sm bg-gradient-to-r from-white to-gray-200 bg-clip-text text-transparent`}></i>
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-slate-900 text-sm truncate">{task.task_title}</h3>
                            <div className="flex items-center gap-3 text-sm text-slate-500">
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
                          <p className="text-slate-600 text-sm mb-3 leading-relaxed">{task.task_description}</p>
                        </div>
                        <div className="flex items-center justify-between border-t border-blue-200/50 pt-2.5 pb-2.5 px-2.5">
                          <div className="text-xs font-bold text-blue-600 flex items-center gap-1">
                            <Play className="w-3 h-3" /> Evident at {formatTime(task.start_time)}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTaskClick(task);
                              }}
                              className={`px-4 py-1.5 bg-gradient-to-r ${theme.primary.from} ${theme.primary.to} text-white text-xs font-bold rounded-lg shadow-md hover:shadow-lg transition-all duration-200`}
                            >
                              PLAY
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              className="px-4 py-1.5 bg-gradient-to-r from-slate-100 to-slate-200 text-slate-600 text-xs font-bold rounded-lg border border-slate-300 hover:from-slate-200 hover:to-slate-300 shadow-sm hover:shadow-md transition-all duration-200"
                            >
                              EDIT
                            </button>
                          </div>
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

              <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-700 shadow-2xl group">
                <video
                  ref={videoRef}
                  controls
                  className="w-full h-full object-cover"
                  src={activeTask?.video_url || '/sample-video.mp4'}
                >
                  Your browser does not support the video tag.
                </video>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl shadow-xl">
                    <Play className="w-6 h-6 ml-1" />
                  </div>
                </div>
              </div>

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
