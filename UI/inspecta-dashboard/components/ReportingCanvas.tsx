import React, { useState } from "react";
import { Download, Trash2, LayoutTemplate, FileText } from "lucide-react";

interface Incident {
  id: string;
  title: string;
  status: string;
  summary: string;
  created?: string;
}

interface ReportingCanvasProps {
  droppedIncidents: Incident[];
  onDrop: (e: React.DragEvent) => void;
  onClear: () => void;
  onRemoveIncident: (id: string) => void;
}

export function ReportingCanvas({
  droppedIncidents,
  onDrop,
  onClear,
  onRemoveIncident,
}: ReportingCanvasProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDropInternal = (e: React.DragEvent) => {
    setIsDragOver(false);
    onDrop(e);
  };

  return (
    <div className="flex-1 h-full flex flex-col p-3.5 min-h-[220px]">
      {/* Header controls for the Canvas */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
        <h5 className="text-xs font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
          <LayoutTemplate className="w-3.5 h-3.5 text-blue-500" />
          Reporting Canvas
        </h5>
        {droppedIncidents.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => alert(`Generating report for ${droppedIncidents.length} incidents...`)}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 hover:bg-blue-100/80 px-2 py-1 rounded transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>Export Report</span>
            </button>
            <button
              onClick={onClear}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 bg-rose-55/60 hover:bg-rose-50 px-2 py-1 rounded transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Canvas</span>
            </button>
          </div>
        )}
      </div>

      {/* Drop Zone Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropInternal}
        className={`flex-1 flex flex-col rounded-xl border-2 border-dashed transition-all p-4 ${isDragOver
          ? "border-blue-500 bg-blue-50/40 shadow-inner"
          : droppedIncidents.length === 0
            ? "border-slate-300 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400"
            : "border-slate-200 bg-white"
          }`}
      >
        {droppedIncidents.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto select-none pointer-events-none">
            <FileText className="w-10 h-10 text-slate-800 mb-2.5 stroke-[1.5]" />
            <p className="text-sm font-bold text-slate-800 mb-1">Drag Incidents Here</p>
            <p className="text-xs text-slate-800 max-w-[240px] leading-relaxed">
              Drag tiles from the Incidents list on the left and drop them here to compile your report.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[300px] lg:max-h-[500px] scrollbar-thin">
            {droppedIncidents.map((incident) => {
              const createdDate = incident.created ? new Date(incident.created) : null;
              const dateStr = createdDate ? createdDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
              const timeStr = createdDate ? createdDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'N/A';

              return (
                <div
                  key={incident.id}
                  className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 hover:bg-slate-100 transition-colors animate-fadeIn"
                >
                  <div className="flex flex-col gap-1 truncate w-full">
                    <span className="text-sm font-bold text-slate-800 truncate block w-full" title={incident.summary || `Incident ${incident.id}`}>
                      {incident.summary || `Incident ${incident.id}`}
                    </span>
                    <span className="text-[11px] text-slate-900 font-medium truncate block w-full">
                      <div className="flex gap-4">
                        <span>{incident.id}</span>
                        <span>|</span>
                        <span>{dateStr}</span>
                        <span>|</span>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
