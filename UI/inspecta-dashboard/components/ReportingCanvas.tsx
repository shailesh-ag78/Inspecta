import React, { useState } from "react";
import { Download, Trash2, LayoutTemplate, FileText } from "lucide-react";

interface Incident {
  id: string;
  status: string;
  summary: string;
  created?: string;
  incident_type?: string;
}

interface ReportingCanvasProps {
  droppedIncidents: Incident[];
  onDrop: (e: React.DragEvent, index?: number) => void;
  onClear: () => void;
  onRemoveIncident: (id: string) => void;
  companyName: string;
  selectedSiteName: string;
  userName: string;
  onGenerateReport?: (summary: string) => void;
}

export function ReportingCanvas({
  droppedIncidents,
  onDrop,
  onClear,
  onRemoveIncident,
  companyName,
  selectedSiteName,
  userName,
  onGenerateReport,
}: ReportingCanvasProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [reportSummary, setReportSummary] = useState("");
  const [calculatedInsertIndex, setCalculatedInsertIndex] = useState<number | null>(null);

  const section2Ref = React.useRef<HTMLDivElement>(null);

  // Auto-generate summary when droppedIncidents changes
  const prevCount = React.useRef(droppedIncidents.length);
  React.useEffect(() => {
    if (droppedIncidents.length !== prevCount.current) {
      prevCount.current = droppedIncidents.length;
      const summaries = droppedIncidents
        .map((inc) => inc.summary)
        .filter(Boolean);
      setReportSummary(summaries.join("\n\n"));
    }
  }, [droppedIncidents]);

  // Section 2 Drag Over Handler with edge auto-scrolling & Y-coordinate insertion calculation
  const handleSection2DragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);

    const container = section2Ref.current;
    if (!container) return;

    // 1. Edge Auto-Scrolling
    const rect = container.getBoundingClientRect();
    const scrollThreshold = 60; // 60px threshold from top/bottom
    if (e.clientY > rect.bottom - scrollThreshold) {
      container.scrollTop += 14;
    } else if (e.clientY < rect.top + scrollThreshold) {
      container.scrollTop -= 14;
    }

    // 2. Dynamic Insertion Index Calculation
    if (droppedIncidents.length === 0) {
      setCalculatedInsertIndex(0);
      return;
    }

    const tileElements = Array.from(container.querySelectorAll<HTMLElement>('[data-incident-tile]'));
    if (tileElements.length === 0) {
      setCalculatedInsertIndex(droppedIncidents.length);
      return;
    }

    let targetIndex = tileElements.length;
    for (let i = 0; i < tileElements.length; i++) {
      const tileRect = tileElements[i].getBoundingClientRect();
      const tileMidY = tileRect.top + tileRect.height / 2;
      if (e.clientY < tileMidY) {
        targetIndex = i;
        break;
      }
    }
    setCalculatedInsertIndex(targetIndex);
  };

  // Section 2 Drag Leave Handler (prevents premature resets when passing over child elements)
  const handleSection2DragLeave = (e: React.DragEvent) => {
    const container = section2Ref.current;
    if (container && !container.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setCalculatedInsertIndex(null);
    }
  };

  // Section 2 Drop Handler
  const handleSection2Drop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const targetIndex = calculatedInsertIndex !== null ? calculatedInsertIndex : droppedIncidents.length;
    setCalculatedInsertIndex(null);
    onDrop(e, targetIndex);
  };

  return (
    <div className="flex-1 h-full flex flex-col p-3.5 min-h-[220px]">
      {/* Header controls for the Canvas */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
        <h5 className="text-xs font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
          <LayoutTemplate className="w-3.5 h-3.5 text-blue-500" />
          Reporting Canvas
        </h5>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onGenerateReport?.(reportSummary)}
            disabled={droppedIncidents.length === 0}
            className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100/80 px-2 py-1 rounded transition-colors disabled:cursor-not-allowed cursor-pointer"
          >
            <FileText className="w-3 h-3" />
            <span>Generate Report</span>
          </button>
          <button
            type="button"
            onClick={() => alert(`Exporting report for ${droppedIncidents.length} incidents...`)}
            disabled={droppedIncidents.length === 0}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50 flex items-center gap-1 bg-blue-50 hover:bg-blue-100/80 px-2 py-1 rounded transition-colors disabled:cursor-not-allowed cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>Export Report</span>
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={droppedIncidents.length === 0}
            className="text-[11px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50 flex items-center gap-1 bg-rose-50/60 hover:bg-rose-50 px-2 py-1 rounded transition-colors disabled:cursor-not-allowed cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear Canvas</span>
          </button>
        </div>
      </div>

      {/* Main partitioned container with pale green sections and vertical divides */}
      <div className="flex-1 flex flex-col divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">

        {/* Section 1: Header Meta & Summary (Pale Green) */}
        <div className="p-3.5 bg-emerald-50/20 space-y-2.5">
          <div className="grid grid-cols-3 gap-4 text-xs font-bold text-slate-700">
            <div className="text-slate-800">
              {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="text-slate-950 font-extrabold">
              Site : {selectedSiteName}
            </div>
            <div className="text-slate-800">
              {companyName}
            </div>
          </div>
          <div className="flex flex-col gap-1 mt-1">
            <textarea
              value={reportSummary}
              onChange={(e) => setReportSummary(e.target.value)}
              placeholder="Report summary will generate here automatically based on selection..."
              className="w-full text-xs bg-white border border-slate-200/80 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:border-emerald-500 min-h-[50px] resize-y scrollbar-thin font-medium"
            />
          </div>
        </div>

        {/* Section 2: Droppable Items List (White) */}
        <div
          ref={section2Ref}
          onDragOver={handleSection2DragOver}
          onDragLeave={handleSection2DragLeave}
          onDrop={handleSection2Drop}
          className={`flex-1 p-3.5 flex flex-col min-h-[180px] overflow-y-auto scrollbar-thin transition-colors ${isDragOver && droppedIncidents.length === 0 ? "bg-emerald-50/20 border-2 border-dashed border-emerald-400" : ""
            }`}
        >
          {droppedIncidents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 select-none pointer-events-none">
              <FileText className="w-10 h-10 text-slate-800 mb-2.5 stroke-[1.5]" />
              <p className="text-sm font-bold text-slate-800 mb-1">Drag Incidents Here</p>
              <p className="text-xs text-slate-650 max-w-[240px] leading-relaxed">
                Drag tiles from the list and drop them here to compile your report.
              </p>
            </div>
          ) : (
            <div className="flex flex-col min-h-full gap-1.5">
              {droppedIncidents.map((incident, idx) => {
                const createdDate = incident.created ? new Date(incident.created) : null;
                const dateStr = createdDate ? createdDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
                const timeStr = createdDate ? createdDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'N/A';
                const showIndicatorHere = isDragOver && calculatedInsertIndex === idx;

                return (
                  <React.Fragment key={incident.id}>
                    {showIndicatorHere && (
                      <div className="w-full h-10 border border-dashed border-emerald-400 bg-emerald-50/60 rounded-lg flex items-center justify-center text-[10px] text-emerald-800 font-bold animate-fadeIn my-0.5 shadow-sm">
                        Drop here to insert
                      </div>
                    )}
                    <div
                      data-incident-tile
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/json", JSON.stringify([incident.id]));
                        e.dataTransfer.setData("text/plain", incident.id);
                      }}
                      title={incident.summary || `Incident ${incident.id}`}
                      className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 hover:bg-slate-100 transition-colors animate-fadeIn shadow-sm cursor-grab active:cursor-grabbing select-none"
                    >
                      <div className="flex flex-col gap-1 truncate w-full">
                        <span className="text-sm font-bold text-slate-800 truncate block w-full">
                          {incident.summary || `Incident ${incident.id}`}
                        </span>
                        <span className="text-[11px] text-slate-900 font-medium truncate block w-full">
                          <div className="flex gap-2.5 items-center">
                            <span className="inline-flex items-center">
                              <span className="bg-gradient-to-br from-orange-100/60 to-orange-100 font-semibold ml-0.5 text-[11px]">
                                {incident.id.slice(0, 8)}
                              </span>
                              {incident.id.length > 8 && (
                                <span className="text-slate-400 font-normal ml-0.5 text-[10px]">
                                  {incident.id.slice(8)}
                                </span>
                              )}
                            </span>
                            <span className="text-slate-300">|</span>
                            <span>{dateStr}</span>
                            <span className="text-slate-300">|</span>
                            <span>{timeStr}</span>
                          </div>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveIncident(incident.id)}
                        className="text-slate-600 hover:text-rose-600 p-1 rounded hover:bg-white border border-transparent hover:border-slate-200/50 transition-all shrink-0"
                        title="Remove from report"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Indicator if dropping after the last item */}
              {isDragOver && calculatedInsertIndex === droppedIncidents.length && (
                <div className="w-full h-10 border border-dashed border-emerald-400 bg-emerald-50/60 rounded-lg flex items-center justify-center text-[10px] text-emerald-800 font-bold animate-fadeIn my-0.5 shadow-sm">
                  Drop here to insert
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 3: Bottom Credits Panel (Pale Green) */}
        <div className="p-3 bg-emerald-50/20 flex items-center justify-between text-[10px] text-slate-500 font-bold">
          <div>
            <span className="text-slate-400 font-medium mr-1 uppercase">Created by:</span>
            <span className="text-slate-700">{userName}</span>
          </div>
          <div className="text-slate-400 font-medium">
            © {new Date().getFullYear()} Inspecta. All rights reserved.
          </div>
          <div className="text-slate-700 uppercase">
            Page 1 of 1
          </div>
        </div>

      </div>
    </div>
  );
}
