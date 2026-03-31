"use client";

import { useState } from 'react';
import { Clock, ChevronLeft, ChevronRight, Play, User } from 'lucide-react';

// Mock data
const mockData = {
  sites: [
    { id: 'AST', name: 'Astitwa', lastModified: '2026-03-31T10:30:00Z', floor: '3rd Floor' },
    { id: 'MNK', name: 'MNK Towers', lastModified: '2026-03-30T15:45:00Z', floor: '12th Floor' },
    { id: 'RIV', name: 'River View', lastModified: '2026-03-29T09:20:00Z', floor: '8th Floor' },
    { id: 'SUN', name: 'Sunset Plaza', lastModified: '2026-03-28T14:10:00Z', floor: '5th Floor' },
    { id: 'GRN', name: 'Green Valley', lastModified: '2026-03-27T11:55:00Z', floor: '2nd Floor' }
  ].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()), // Sort by last modified
  incidents: {
    'AST': [
      { id: 'AST-2026-03', title: 'Water Leakage Inspection', status: 'active', created: '2026-03-31T08:00:00Z' },
      { id: 'AST-2026-02', title: 'Electrical Wiring Check', status: 'completed', created: '2026-03-25T14:30:00Z' },
      { id: 'AST-2026-01', title: 'HVAC System Review', status: 'pending', created: '2026-03-20T10:15:00Z' }
    ],
    'MNK': [
      { id: 'MNK-2026-05', title: 'Elevator Maintenance', status: 'active', created: '2026-03-30T13:00:00Z' },
      { id: 'MNK-2026-04', title: 'Fire Safety Inspection', status: 'completed', created: '2026-03-28T09:45:00Z' }
    ],
    'RIV': [
      { id: 'RIV-2026-03', title: 'Plumbing System Audit', status: 'active', created: '2026-03-29T11:20:00Z' }
    ],
    'SUN': [
      { id: 'SUN-2026-02', title: 'Security System Upgrade', status: 'pending', created: '2026-03-28T16:00:00Z' }
    ],
    'GRN': [
      { id: 'GRN-2026-01', title: 'Green Certification Prep', status: 'active', created: '2026-03-27T12:30:00Z' }
    ]
  },
  summary: "Inspection completed for site Astitwa, 3rd Floor. Multiple issues detected.",
  tasks: [
    {
      task_title: "Repair water leakage in bathroom",
      task_description: "Fix the water leakage near the tap in the bathroom of bedroom one to prevent water damage to the floor tiles.",
      severity_id: 1,
      start_time: 22,
      area: "Bedroom 1 Bathroom",
      task_type: "repair",
      task_status: "pending"
    },
    {
      task_title: "Organize materials in bedroom one",
      task_description: "Arrange the materials placed in bedroom one correctly to ensure a tidy and safe environment.",
      severity_id: 2,
      start_time: 5,
      area: "Bedroom 1",
      task_type: "clear",
      task_status: "in_progress"
    },
    {
      task_title: "Check electrical wiring",
      task_description: "Potential wiring issue in the main panel.",
      severity_id: 1,
      start_time: 45,
      area: "Main Panel",
      task_type: "verify",
      task_status: "review"
    },
    {
      task_title: "Install new ventilation filter",
      task_description: "Replace the old filter in the ventilation system with a new one.",
      severity_id: 2,
      start_time: 78,
      area: "Ventilation Area",
      task_type: "install",
      task_status: "completed"
    }
  ]
};

interface Task {
  task_title: string;
  task_description: string;
  severity_id: number;
  start_time: number;
  area: string;
  task_type: string;
  task_status: string;
}

export default function ReviewerDashboard() {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set([0, 1, 2, 3])); // Start expanded
  const [filters, setFilters] = useState({
    severity: 'all',
    task_type: 'all',
    task_status: 'all'
  });
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  const [isVideoCollapsed, setIsVideoCollapsed] = useState(false);
  const [selectedSite, setSelectedSite] = useState('AST');
  const [selectedIncident, setSelectedIncident] = useState('AST-2026-03');

  const handleSiteChange = (siteId: string) => {
    setSelectedSite(siteId);
    // Set the first incident of the new site as selected
    const siteIncidents = mockData.incidents[siteId as keyof typeof mockData.incidents] || [];
    if (siteIncidents.length > 0) {
      setSelectedIncident(siteIncidents[0].id);
    }
  };

  const handleTaskClick = (task: Task) => {
    setActiveTask(task);
    if (videoRef) {
      videoRef.currentTime = task.start_time;
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
      case 'pending': return 'fa-circle-dot';
      case 'in_progress': return 'fa-rotate';
      case 'review': return 'fa-magnifying-glass';
      case 'completed': return 'fa-circle-check';
      case 'failed': return 'fa-circle-xmark';
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

  const filteredTasks = mockData.tasks.filter(task => {
    if (filters.severity !== 'all' && task.severity_id !== parseInt(filters.severity)) return false;
    if (filters.task_type !== 'all' && task.task_type !== filters.task_type) return false;
    if (filters.task_status !== 'all' && task.task_status !== filters.task_status) return false;
    return true;
  });

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 text-white h-16 flex items-center justify-between px-6 shrink-0 border-b border-blue-500/30 shadow-lg">
        <div className="flex items-center gap-4">
          <span className="font-black text-xl tracking-tighter text-transparent bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text">INSPECTA</span>
          <div className="h-6 w-px bg-gradient-to-b from-blue-400 to-purple-400"></div>
          
          {/* Site Selection */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Site:</span>
            <select
              value={selectedSite}
              onChange={(e) => handleSiteChange(e.target.value)}
              className="bg-slate-800/50 border border-slate-600 rounded px-3 py-1 text-sm text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            >
              {mockData.sites.map(site => (
                <option key={site.id} value={site.id}>
                  {site.name} - {site.floor}
                </option>
              ))}
            </select>
          </div>

          {/* Incident Selection */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Incident:</span>
            <select
              value={selectedIncident}
              onChange={(e) => setSelectedIncident(e.target.value)}
              className="bg-slate-800/50 border border-slate-600 rounded px-3 py-1 text-sm text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            >
              {mockData.incidents[selectedSite as keyof typeof mockData.incidents]?.map(incident => (
                <option key={incident.id} value={incident.id}>
                  {incident.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-xs bg-gradient-to-r from-blue-500/20 to-purple-500/20 px-2 py-1 rounded border border-blue-400/30 text-blue-300 font-mono">
            ID: {selectedIncident}
          </span>
          <span className="text-xs bg-gradient-to-r from-green-500 to-blue-500 px-2 py-1 rounded text-white font-bold shadow-lg">V5</span>
          <User className="w-5 h-5 text-blue-300" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left Pane - Task Feed */}
        <section className={`${isVideoCollapsed ? 'w-full' : 'w-3/5'} overflow-y-auto p-6 bg-gradient-to-br from-white via-blue-50/20 to-purple-50/10 transition-all duration-300`}>
          <div className="mb-6 flex justify-between items-end">
            <h2 className="text-xl font-bold text-slate-800">Pending Verification ({filteredTasks.length} Tasks)</h2>
            <div className="flex gap-2">
              <button className="text-xs bg-gradient-to-r from-blue-500 to-purple-600 text-white px-3 py-1.5 rounded-lg shadow-md hover:shadow-lg hover:from-blue-600 hover:to-purple-700 font-bold transition-all duration-200">Approve All</button>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-blue-200/50">
            <div className="flex items-center justify-between p-4 border-b border-blue-200/50">
              <h3 className="text-xl font-medium text-slate-900 flex items-center gap-3">
                <i className="fa-solid fa-filter text-blue-600 text-lg"></i>
                Task Filters
              </h3>
              <button
                onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
                className="text-slate-500 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200"
              >
                <ChevronLeft className={`w-5 h-5 transform transition-transform ${isFiltersCollapsed ? 'rotate-90' : '-rotate-90'}`} />
              </button>
            </div>
            {!isFiltersCollapsed && (
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">Severity</label>
                    <select
                      value={filters.severity}
                      onChange={(e) => setFilters({...filters, severity: e.target.value})}
                      className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    >
                      <option value="all">All Severities</option>
                      <option value="1">🔴 Urgent</option>
                      <option value="2">🟡 Medium</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">Task Type</label>
                    <select
                      value={filters.task_type}
                      onChange={(e) => setFilters({...filters, task_type: e.target.value})}
                      className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    >
                      <option value="all">All Types</option>
                      <option value="install">🔧 Install</option>
                      <option value="repair">🔨 Repair</option>
                      <option value="verify">📋 Verify</option>
                      <option value="clear">🧹 Clear</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">Status</label>
                    <select
                      value={filters.task_status}
                      onChange={(e) => setFilters({...filters, task_status: e.target.value})}
                      className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
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

          <div className="space-y-4">
            {filteredTasks.map((task, index) => {
              const isExpanded = expandedTasks.has(index);
              return (
                <div
                  key={index}
                  className={`bg-white/90 backdrop-blur-sm rounded-xl border-2 shadow-lg hover:shadow-xl transition-all duration-300 ${
                    activeTask === task
                      ? 'border-blue-500 ring-4 ring-blue-500/20 shadow-blue-500/20'
                      : 'border-blue-200/50 hover:border-blue-300'
                  }`}
                >
                  {/* Task Header - Always Visible */}
                  <div className="flex justify-between items-start p-5 pb-3">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shadow-lg ${
                        task.severity_id === 1 ? 'bg-gradient-to-br from-red-500 to-pink-600 text-white' : 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white'
                      }`}>
                        <i className={`fa-solid ${getTaskTypeIcon(task.task_type)} text-xl`}></i>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-900 text-lg leading-tight">{task.task_title}</h3>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Area: {task.area}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center ${getTaskStatusColor(task.task_status)}`}>
                        <i className={`fa-solid ${getTaskStatusIcon(task.task_status)} text-lg`}></i>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-1 rounded ${
                        task.severity_id === 1 ? 'bg-red-600 text-white' : 'bg-yellow-500 text-white'
                      }`}>
                        {task.severity_id === 1 ? 'URGENT' : 'MEDIUM'}
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

                  {/* Expandable Content */}
                  {isExpanded && (
                    <>
                      <div className="px-5 pb-3">
                        <p className="text-slate-600 text-sm mb-4 leading-relaxed">{task.task_description}</p>
                      </div>
                      <div className="flex items-center justify-between border-t border-blue-200/50 pt-4 pb-5 px-5">
                        <div className="text-xs font-bold text-blue-600 flex items-center gap-1">
                          <Play className="w-3 h-3" /> Evidence at {formatTime(task.start_time)}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Handle approve action
                            }}
                            className="px-4 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-bold rounded-lg hover:from-blue-600 hover:to-purple-700 shadow-md hover:shadow-lg transition-all duration-200"
                          >
                            APPROVE
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Handle edit action
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
        </section>

        {/* Right Pane - Evidence Vault */}
        {!isVideoCollapsed && (
          <aside className="w-2/5 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col shadow-inner relative border-l border-slate-700">
            <button
              onClick={() => setIsVideoCollapsed(true)}
              className="absolute top-4 right-4 z-20 w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-white/20 hover:scale-105"
              title="Collapse Video Pane"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="p-6 pt-16 sticky top-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-400" /> VIDEO EVIDENCE
                </h3>
                <span className="text-[10px] text-slate-400 font-mono bg-slate-800/50 px-2 py-1 rounded">CLIP_382.MP4</span>
              </div>

              <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-700 shadow-2xl group">
                <video
                  ref={setVideoRef}
                  controls
                  className="w-full h-full object-cover"
                  src="/sample-video.mp4"
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
                <h4 className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-3">AI Detection Context</h4>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 leading-relaxed">
                  <p className="text-slate-300 text-sm">
                    {activeTask
                      ? `"At ${formatTime(activeTask.start_time)}, the camera captures the issue in ${activeTask.area}. The technician confirms the issue verbally."`
                      : 'Select a task to view context.'
                    }
                  </p>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Collapsed Video Toggle */}
        {isVideoCollapsed && (
          <button
            onClick={() => setIsVideoCollapsed(false)}
            className="w-12 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white flex items-center justify-center transition-all duration-200 border-l-2 border-white/20 shadow-lg hover:shadow-xl hover:scale-105"
            title="Expand Video Pane"
          >
            <ChevronLeft className="w-5 h-5 rotate-180" />
          </button>
        )}
      </main>
    </div>
  );
}
