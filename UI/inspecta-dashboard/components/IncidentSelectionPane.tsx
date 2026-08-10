"use client";

import { useDashboard } from '@/lib/context';
import { ChevronDown, ChevronLeft, Filter, AlertTriangle, FileText } from 'lucide-react';
import React from 'react';

export default function IncidentSelectionPane({
  singleSiteMode = false,
  defaultShowIncidents = true,
  defaultShowFieldNotes = false
}: {
  singleSiteMode?: boolean;
  defaultShowIncidents?: boolean;
  defaultShowFieldNotes?: boolean;
}) {
  const {
    theme,
    siteInspections,
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
    millerIncidents,
    showIncidents,
    setShowIncidents,
    showFieldNotes,
    setShowFieldNotes,
    incidentDateFilter,
    setIncidentDateFilter,
  } = useDashboard();

  // Enforce single site selection when in singleSiteMode
  React.useEffect(() => {
    if (singleSiteMode && selectedMillerSites.length > 1) {
      setSelectedMillerSites([selectedMillerSites[0]]);
    }
  }, [singleSiteMode, selectedMillerSites, setSelectedMillerSites]);

  // Responsive auto-collapse site column on mobile
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSiteColumnCollapsed(true);
    }
  }, [setIsSiteColumnCollapsed]);

  // Incident Filtering State
  const [isIncidentFilterCollapsed, setIsIncidentFilterCollapsed] = React.useState(true);

  const filteredIncidents = React.useMemo(() => {
    return millerIncidents.filter(inc => {
      // Type filter
      const type = inc.incident_type ? inc.incident_type.toLowerCase() : 'incident';
      if (type === 'fieldnote' && !showFieldNotes) return false;
      if (type === 'incident' && !showIncidents) return false;

      // Date filter
      if (incidentDateFilter !== 'All') {
        if (!inc.created) return false;
        const incDate = new Date(inc.created);
        const now = new Date();
        const diffDays = (now.getTime() - incDate.getTime()) / (1000 * 3600 * 24);

        if (incidentDateFilter === 'Today' && diffDays > 1) return false;
        if (incidentDateFilter === 'Last week' && diffDays > 7) return false;
      }
      return true;
    });
  }, [millerIncidents, incidentDateFilter, showIncidents, showFieldNotes]);

  // Uncheck incidents that become hidden
  React.useEffect(() => {
    const visibleIds = new Set(filteredIncidents.map(inc => inc.id));
    const newSelected = selectedMillerIncidents.filter(id => visibleIds.has(id));
    if (newSelected.length !== selectedMillerIncidents.length) {
      setSelectedMillerIncidents(newSelected);
    }
  }, [filteredIncidents, selectedMillerIncidents, setSelectedMillerIncidents]);

  const availableInspections = siteInspections
    .filter(ins => selectedMillerSites.includes(ins.site_name))
    .sort((a, b) => new Date(b.inspection_created_at || 0).getTime() - new Date(a.inspection_created_at || 0).getTime());

  const currentSiteName = selectedMillerSites.length === 0
    ? "None"
    : selectedMillerSites.length === backendSites.length
      ? "All Sites"
      : selectedMillerSites.length === 1
        ? selectedMillerSites[0]
        : `${selectedMillerSites.length} Selected`;

  const currentInspectionName = selectedMillerInspections.length === 0
    ? "None"
    : selectedMillerInspections.length === availableInspections.length
      ? "All Inspections"
      : selectedMillerInspections.length === 1
        ? (availableInspections.find(ins => String(ins.inspection_id || ins.site_id) === selectedMillerInspections[0])?.label || "1 Selected")
        : `${selectedMillerInspections.length} Selected`;

  const currentIncidentName = selectedMillerIncidents.length === 0
    ? "None"
    : selectedMillerIncidents.length === millerIncidents.length
      ? "All Incidents"
      : selectedMillerIncidents.length === 1
        ? `${selectedMillerIncidents[0].slice(0, 8)} - XXX`
        : `${selectedMillerIncidents.length} Selected`;

  return (
    <div className="bg-pane-bg/98 border-b border-slate-200/70 overflow-hidden shadow-md w-full mb-2">
      <div
        onClick={() => setIsIncidentPaneCollapsed(!isIncidentPaneCollapsed)}
        className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200/70 cursor-pointer select-none hover:bg-slate-200/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-[15px] font-bold text-slate-500">
          <i className="fa-solid fa-building text-slate-600 text-lg mr-2"></i>
          <span className="select-none flex items-center flex-wrap gap-x-1">
            <span>Site : </span>
            <span className="text-amber-800 font-bold mr-3.5">{currentSiteName}</span>
            <span>Inspection : </span>
            <span className="text-blue-600 font-bold mr-3.5">{currentInspectionName}</span>
            <span>Incident : </span>
            <span className="text-emerald-700 font-bold">{currentIncidentName}</span>
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsIncidentPaneCollapsed(!isIncidentPaneCollapsed);
          }}
          className={`text-white transition-all p-1 rounded-lg border ${theme.cardBorder} bg-gradient-to-r ${theme.primary.from} ${theme.primary.to}`}
        >
          <ChevronDown className={`w-3.5 h-3.5 transform transition-transform ${isIncidentPaneCollapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>
      {!isIncidentPaneCollapsed && (
        <div className="p-3 bg-slate-50/50">
          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 border border-blue-200/50 rounded-xl min-h-[220px] md:h-[220px] overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/70 shadow-sm">
            {/* Column 1: Sites */}
            {isSiteColumnCollapsed ? (
              <div
                onClick={() => setIsSiteColumnCollapsed(false)}
                className="md:w-8 md:h-full h-8 bg-slate-100 hover:bg-slate-200 md:border-r md:border-b-0 border-b border-slate-200 flex md:flex-col flex-row items-center justify-center md:py-3 cursor-pointer transition-colors"
                title="Expand sites column"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-500 transform md:rotate-180 rotate-[-90deg] md:mb-4 md:mr-0 mr-3" />
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest md:[writing-mode:vertical-lr] md:rotate-180 select-none">
                  SITES ({selectedMillerSites.length})
                </span>
              </div>
            ) : (
              <div className="flex-1 h-full overflow-y-auto p-2 space-y-1 scrollbar-thin flex flex-col">
                <div className="flex items-center justify-between mb-1.5 border-b border-slate-200 pb-1">
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wider px-1 shrink-0">
                    Sites ({singleSiteMode ? (selectedMillerSites.length > 0 ? 1 : 0) : selectedMillerSites.length})
                  </span>
                  {!singleSiteMode && (
                    <div className="flex items-center gap-2 text-xs ml-auto mr-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedMillerSites(backendSites.map(s => String(s.site_name || s.name || '')))}
                        className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedMillerSites([])}
                        className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer"
                      >
                        Deselect All
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setIsSiteColumnCollapsed(true)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors shrink-0 ml-auto"
                    title="Collapse sites column"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>

                {[...backendSites].sort((a, b) => {
                  const nameA = a.site_name || a.name || '';
                  const nameB = b.site_name || b.name || '';
                  return nameA.localeCompare(nameB);
                }).map(site => {
                  const siteId = String(site.site_name || site.name || '');
                  const isChecked = selectedMillerSites.includes(siteId);
                  return (
                    <label key={siteId} className="flex items-center gap-2 text-[13px] font-normal text-slate-900 hover:text-slate-1000 cursor-pointer select-none py-0.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (singleSiteMode) {
                            if (isChecked) {
                              setSelectedMillerSites([]);
                            } else {
                              setSelectedMillerSites([siteId]);
                            }
                          } else {
                            setSelectedMillerSites(prev =>
                              prev.includes(siteId) ? prev.filter(s => s !== siteId) : [...prev, siteId]
                            );
                          }
                        }}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 border flex items-center justify-center transition-all ${singleSiteMode ? 'rounded-full' : 'rounded'} ${isChecked ? 'border-slate-600 bg-slate-200/80 shadow-inner' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                        {isChecked && (
                          singleSiteMode ? (
                            <div className="w-2 h-2 bg-slate-800 rounded-full" />
                          ) : (
                            <i className="fa-solid fa-check text-[10px] text-slate-800 font-extrabold" />
                          )
                        )}
                      </div>
                      <span className="truncate flex items-center gap-1">
                        <span className="site-icon" />
                        {siteId}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Column 2: Inspections */}
            <div className="flex-1 h-full overflow-y-auto p-2 space-y-1 scrollbar-thin">
              <div className="flex items-center justify-between mb-1.5 border-b border-slate-200 pb-1">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider px-1 shrink-0">
                  Inspections ({selectedMillerInspections.length})
                </span>
                <div className="flex items-center gap-2 text-xs ml-auto px-1">
                  <button
                    type="button"
                    onClick={() => setSelectedMillerInspections(availableInspections.map(item => item.inspection_id || item.site_id).filter(Boolean) as string[])}
                    className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedMillerInspections([])}
                    className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {availableInspections.map(item => {
                const val = item.inspection_id || item.site_id;
                if (!val) return null;
                const isChecked = selectedMillerInspections.includes(val);
                return (
                  <label key={val} className="flex items-center gap-2 text-[13px] font-normal text-slate-900 hover:text-slate-1000 cursor-pointer select-none py-0.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setSelectedMillerInspections(prev =>
                          prev.includes(val) ? prev.filter(id => id !== val) : [...prev, val]
                        );
                      }}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isChecked ? 'border-slate-600 bg-slate-200/80 shadow-inner' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                      {isChecked && <i className="fa-solid fa-check text-[10px] text-slate-800 font-extrabold" />}
                    </div>
                    <span className="truncate flex items-center gap-1.5">
                      <img src="/SiteInspection.ico" alt="Inspection" className="w-5 h-5 object-contain opacity-95 shrink-0" />
                      {item.label}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Column 3: Incidents */}
            <div className="flex-1 md:h-full overflow-y-auto p-2 space-y-1 scrollbar-thin">
              <div className="flex flex-wrap items-center justify-between mb-1.5 border-b border-slate-200 pb-1 gap-1">
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider px-1 shrink-0">
                  Incidents ({selectedMillerIncidents.length})
                </span>
                <div className="flex items-center gap-2 text-xs ml-auto px-1">
                  <button
                    type="button"
                    onClick={() => setIsIncidentFilterCollapsed(!isIncidentFilterCollapsed)}
                    className={`flex items-center gap-1 font-bold px-1.5 py-0.5 rounded transition-colors ${!isIncidentFilterCollapsed ? 'bg-slate-200/50 text-slate-600' : 'bg-slate-200/50 text-slate-500 hover:text-slate-800'}`}
                  >
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    Filter
                  </button>
                  {filteredIncidents.length > 0 && (
                    <>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedMillerIncidents(filteredIncidents.map(inc => inc.id))}
                        className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedMillerIncidents([])}
                        className="text-slate-500 hover:text-slate-700 font-bold cursor-pointer"
                      >
                        Deselect All
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Filter Bar */}
              {!isIncidentFilterCollapsed && (
                <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-2.5 mb-2 shadow-inner space-y-3">
                  {/* Modern Segmented Control for Dates */}
                  <div className="inline-flex bg-slate-200/50 p-1 rounded-md border border-slate-200">
                    {(['All', 'Today', 'Last week'] as const).map(opt => {
                      const isActive = incidentDateFilter === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setIncidentDateFilter(opt)}
                          className={`px-4 py-1.5 rounded text-xs font-bold transition-all duration-200 ${isActive ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 border border-transparent'}`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {/* Modern Independent Pill Toggles */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowIncidents(!showIncidents)}
                      className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 border ${showIncidents ? 'bg-gradient-to-br from-orange-50 to-orange-100/60 border-orange-200 text-orange-800 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:border-slate-300'}`}
                    >
                      <span className={`incident-icon ${!showIncidents ? 'opacity-50 grayscale' : ''}`} />
                      Incidents
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowFieldNotes(!showFieldNotes)}
                      className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 border ${showFieldNotes ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:border-slate-300'}`}
                    >
                      <span className={`field-note-icon ${!showFieldNotes ? 'opacity-50 grayscale' : ''}`} />
                      Field Notes
                    </button>
                  </div>
                </div>
              )}

              {filteredIncidents.length === 0 ? (
                <div className="text-[13px] text-slate-500 italic px-2 py-1">No incidents found</div>
              ) : (
                [...filteredIncidents].sort((a, b) => new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime()).map(incident => {
                  const isChecked = selectedMillerIncidents.includes(incident.id);
                  const label = `${incident.id.slice(0, 8)}-XXX`;
                  const createdDate = incident.created ? new Date(incident.created) : null;
                  const dateStr = createdDate ? createdDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                  const timeStr = createdDate ? createdDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
                  const timestampLabel = dateStr && timeStr ? `${dateStr} ${timeStr}` : '';
                  return (
                    <label key={incident.id} className="flex items-center gap-2 text-[13px] font-normal text-slate-800 hover:text-slate-950 cursor-pointer select-none py-0.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedMillerIncidents(prev =>
                            prev.includes(incident.id) ? prev.filter(id => id !== incident.id) : [...prev, incident.id]
                          );
                        }}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isChecked ? 'border-slate-600 bg-slate-200/80 shadow-inner' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                        {isChecked && <i className="fa-solid fa-check text-[10px] text-slate-800 font-extrabold" />}
                      </div>
                      <span className="truncate flex items-center gap-1">
                        <span className={incident.incident_type === 'fieldnote' ? 'field-note-icon' : 'incident-icon'} />
                        <span>{label} &nbsp;&nbsp; {timestampLabel ? `(${timestampLabel})` : ''}</span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
