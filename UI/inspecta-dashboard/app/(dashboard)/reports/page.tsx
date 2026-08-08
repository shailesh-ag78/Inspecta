"use client";

import React, { useState } from "react";
import { useDashboard } from "@/lib/context";
import { ChevronDown, BarChart2 } from "lucide-react";
import { ReportingIncidents } from "@/components/ReportingIncidents";
import { ReportingCanvas } from "@/components/ReportingCanvas";

export default function ReportsPage() {
  const { theme, millerIncidents, setIsIncidentPaneCollapsed } = useDashboard();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [droppedIncidents, setDroppedIncidents] = useState<any[]>([]);
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([]);

  // Expand IncidentSelectionPane by default on this page
  React.useEffect(() => {
    setIsIncidentPaneCollapsed(false);
  }, [setIsIncidentPaneCollapsed]);

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, incidentId: string) => {
    const dragIds = selectedIncidentIds.includes(incidentId) 
      ? selectedIncidentIds 
      : [incidentId];
    e.dataTransfer.setData("application/json", JSON.stringify(dragIds));
    e.dataTransfer.setData("text/plain", incidentId);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    let idsToDrop: string[] = [];
    const jsonStr = e.dataTransfer.getData("application/json");
    if (jsonStr) {
      try {
        idsToDrop = JSON.parse(jsonStr);
      } catch (err) {}
    }
    if (idsToDrop.length === 0) {
      const fallbackId = e.dataTransfer.getData("text/plain");
      if (fallbackId) idsToDrop = [fallbackId];
    }

    setDroppedIncidents((prev) => {
      const newItems = [...prev];
      idsToDrop.forEach((id) => {
        if (!newItems.some((item) => item.id === id)) {
          const incident = millerIncidents.find((inc) => inc.id === id);
          if (incident) newItems.push(incident);
        }
      });
      return newItems;
    });
    setSelectedIncidentIds([]);
  };

  const handleAddAll = (ids: string[]) => {
    setDroppedIncidents((prev) => {
      const newItems = [...prev];
      ids.forEach((id) => {
        if (!newItems.some((item) => item.id === id)) {
          const incident = millerIncidents.find((inc) => inc.id === id);
          if (incident) newItems.push(incident);
        }
      });
      return newItems;
    });
  };

  const handleRemoveIncident = (incidentId: string) => {
    setDroppedIncidents((prev) => prev.filter((item) => item.id !== incidentId));
  };

  const handleClearCanvas = () => {
    setDroppedIncidents([]);
  };

  return (
    <div className={`h-full flex flex-col p-4 overflow-hidden ${theme.background.section}`}>
      {/* Report Builder Pane - Matches IncidentSelectionPane look and feel, takes full height */}
      <div className="bg-white border border-slate-200/70 rounded-xl overflow-hidden shadow-md w-full flex-1 flex flex-col">
        {/* Pane Header */}
        <div
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-between px-4 py-3 bg-slate-100 border-b border-slate-200/70 cursor-pointer select-none hover:bg-slate-200/50 transition-colors shrink-0"
        >
          <div className="flex items-center gap-2 text-[15px] font-bold text-slate-700">
            <BarChart2 className="w-5 h-5 text-blue-600 mr-1" />
            <span>Building Daily Progress Report (DPR)</span>
            {droppedIncidents.length > 0 && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                {droppedIncidents.length} Selected
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            className={`text-white transition-all p-1 rounded-lg border ${theme.cardBorder} bg-gradient-to-r ${theme.primary.from} ${theme.primary.to}`}
          >
            <ChevronDown className={`w-3.5 h-3.5 transform transition-transform ${isCollapsed ? "" : "rotate-180"}`} />
          </button>
        </div>

        {/* Pane Body */}
        {!isCollapsed && (
          <div className="p-3 bg-slate-50/50 flex-1 flex flex-col min-h-0">
            <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border border-blue-200/50 rounded-xl flex-1 overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/70 shadow-sm min-h-0">

              {/* ReportingIncidents (Left side, far narrower than canvas on desktop) */}
              <div className="w-full lg:w-[360px] shrink-0 min-w-0 flex flex-col h-[300px] lg:h-full">
                <ReportingIncidents
                  incidents={millerIncidents}
                  selectedIncidentIds={selectedIncidentIds}
                  onToggleSelect={(id) => {
                    setSelectedIncidentIds((prev) =>
                      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
                    );
                  }}
                  onDragStart={handleDragStart}
                  onAddAll={handleAddAll}
                />
              </div>

              {/* ReportingCanvas (Right side, takes up the remaining width) */}
              <div className="flex-1 min-w-0 flex flex-col h-[350px] lg:h-full">
                <ReportingCanvas
                  droppedIncidents={droppedIncidents}
                  onDrop={handleDrop}
                  onClear={handleClearCanvas}
                  onRemoveIncident={handleRemoveIncident}
                />
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
