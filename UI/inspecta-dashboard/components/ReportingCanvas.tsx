import React, { useState } from "react";
import { Download, Trash2, LayoutTemplate } from "lucide-react";
import { ReportTemplate } from "./ReportTemplate";

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
  onExportReport?: () => void;
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
  onExportReport,
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
            <Download className="w-3 h-3" />
            <span>Generate Report</span>
          </button>
          <button
            type="button"
            onClick={() => onExportReport?.()}
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

      <ReportTemplate
        selectedSiteName={selectedSiteName}
        companyName={companyName}
        reportSummary={reportSummary}
        setReportSummary={setReportSummary}
        droppedIncidents={droppedIncidents}
        onRemoveIncident={onRemoveIncident}
        userName={userName}
        isDragOver={isDragOver}
        calculatedInsertIndex={calculatedInsertIndex}
        section2Ref={section2Ref}
        handleSection2DragOver={handleSection2DragOver}
        handleSection2DragLeave={handleSection2DragLeave}
        handleSection2Drop={handleSection2Drop}
      />
    </div>
  );
}
