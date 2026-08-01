"use client";

import { useDashboard } from '@/lib/context';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import React from 'react';

export default function IncidentSelectionPane() {
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
  } = useDashboard();

  const availableInspections = siteInspections.filter(ins => selectedMillerSites.includes(ins.site_name));

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
        ? (millerIncidents.find(inc => inc.id === selectedMillerIncidents[0])?.title || "1 Selected")
        : `${selectedMillerIncidents.length} Selected`;

  return (
    <div className="bg-pane-bg/98 border-b border-slate-200/70 overflow-hidden shadow-md w-full mb-2">
      <div
        onClick={() => setIsIncidentPaneCollapsed(!isIncidentPaneCollapsed)}
        className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200/70 cursor-pointer select-none hover:bg-slate-200/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-[13.5px]">
          <i className="fa-solid fa-building text-slate-500 text-base mr-2"></i>
          <span className="select-none flex items-center flex-wrap gap-x-1.5">
            <span className="font-medium text-slate-500">Site:</span>
            <span className="text-amber-800 font-bold mr-3.5">{currentSiteName}</span>
            <span className="font-medium text-slate-500">Inspection:</span>
            <span className="text-blue-600 font-bold mr-3.5">{currentInspectionName}</span>
            <span className="font-medium text-slate-500">Incident:</span>
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
          <div className="flex flex-row divide-x divide-slate-200 border border-blue-200/50 rounded-xl h-[180px] overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/70 shadow-sm">
            {/* Column 1: Sites */}
            {isSiteColumnCollapsed ? (
              <div
                onClick={() => setIsSiteColumnCollapsed(false)}
                className="w-8 bg-slate-100 hover:bg-slate-200 border-r border-slate-200 flex flex-col items-center py-3 cursor-pointer transition-colors"
                title="Expand sites column"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-500 transform rotate-180 mb-4" />
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest [writing-mode:vertical-lr] rotate-180 select-none">
                  SITES ({selectedMillerSites.length})
                </span>
              </div>
            ) : (
              <div className="w-48 flex-shrink-0 h-full overflow-y-auto p-2 space-y-1 scrollbar-thin flex flex-col">
                <div className="flex items-center justify-between mb-1.5 border-b border-slate-200 pb-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1">
                    Sites ({selectedMillerSites.length})
                  </span>
                  <button
                    onClick={() => setIsSiteColumnCollapsed(true)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
                    title="Collapse sites column"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 px-1 mb-1.5 text-[10px]">
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

                {backendSites.map(site => {
                  const siteId = String(site.site_name || site.name || '');
                  const isChecked = selectedMillerSites.includes(siteId);
                  return (
                    <label key={siteId} className="flex items-center gap-2 text-xs font-normal text-slate-900 hover:text-slate-1000 cursor-pointer select-none py-0.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedMillerSites(prev =>
                            prev.includes(siteId) ? prev.filter(s => s !== siteId) : [...prev, siteId]
                          );
                        }}
                        className="sr-only"
                      />
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${isChecked ? 'border-slate-600 bg-slate-200/80 shadow-inner' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                        {isChecked && <i className="fa-solid fa-check text-[9px] text-slate-800 font-extrabold" />}
                      </div>
                      <span className="truncate">🏢 {siteId}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Column 2: Inspections */}
            <div className="flex-1 h-full overflow-y-auto p-2 space-y-1 scrollbar-thin">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1 mb-1.5 border-b border-slate-200 pb-1">
                Inspections ({selectedMillerInspections.length})
              </div>

              <div className="flex items-center gap-2 px-1 mb-1.5 text-[10px]">
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

              {availableInspections.map(item => {
                const val = item.inspection_id || item.site_id;
                if (!val) return null;
                const isChecked = selectedMillerInspections.includes(val);
                return (
                  <label key={val} className="flex items-center gap-2 text-xs font-normal text-slate-900 hover:text-slate-1000 cursor-pointer select-none py-0.5">
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
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${isChecked ? 'border-slate-600 bg-slate-200/80 shadow-inner' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                      {isChecked && <i className="fa-solid fa-check text-[9px] text-slate-800 font-extrabold" />}
                    </div>
                    <span className="truncate">🔍 {item.label}</span>
                  </label>
                );
              })}
            </div>

            {/* Column 3: Incidents */}
            <div className="flex-1 h-full overflow-y-auto p-2 space-y-1 scrollbar-thin">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1 mb-1.5 border-b border-slate-200 pb-1">
                Incidents ({selectedMillerIncidents.length})
              </div>

              {millerIncidents.length > 0 && (
                <div className="flex items-center gap-2 px-1 mb-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setSelectedMillerIncidents(millerIncidents.map(inc => inc.id))}
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
                </div>
              )}

              {millerIncidents.length === 0 ? (
                <div className="text-xs text-slate-450 italic px-2 py-1">No incidents found</div>
              ) : (
                millerIncidents.map(incident => {
                  const isChecked = selectedMillerIncidents.includes(incident.id);
                  const label = incident.title || `Incident ${incident.id.slice(0, 4)}`;
                  return (
                    <label key={incident.id} className="flex items-center gap-2 text-xs font-normal text-slate-800 hover:text-slate-950 cursor-pointer select-none py-0.5">
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
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${isChecked ? 'border-slate-600 bg-slate-200/80 shadow-inner' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                        {isChecked && <i className="fa-solid fa-check text-[9px] text-slate-800 font-extrabold" />}
                      </div>
                      <span className="truncate">📱 {label}</span>
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
