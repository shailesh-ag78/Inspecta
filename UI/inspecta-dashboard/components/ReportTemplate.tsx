import React from "react";
import { FileText, Trash2, Sparkles, Camera } from "lucide-react";
import { IncidentImages } from "./IncidentImages";

interface Incident {
  id: string;
  status: string;
  summary: string;
  created?: string;
  incident_type?: string;
}

interface ReportTemplateProps {
  selectedSiteName: string;
  companyName: string;
  reportSummary: string;
  setReportSummary: (val: string) => void;
  droppedIncidents: Incident[];
  onRemoveIncident: (id: string) => void;
  userName: string;
  isDragOver: boolean;
  calculatedInsertIndex: number | null;
  section2Ref: React.RefObject<HTMLDivElement | null>;
  handleSection2DragOver: (e: React.DragEvent) => void;
  handleSection2DragLeave: (e: React.DragEvent) => void;
  handleSection2Drop: (e: React.DragEvent) => void;
}

export function ReportTemplate({
  selectedSiteName,
  companyName,
  reportSummary,
  setReportSummary,
  droppedIncidents,
  onRemoveIncident,
  userName,
  isDragOver,
  calculatedInsertIndex,
  section2Ref,
  handleSection2DragOver,
  handleSection2DragLeave,
  handleSection2Drop,
}: ReportTemplateProps) {
  return (
    <div className="flex-1 flex flex-col divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Section 1: Header Meta & Summary (Pale Green) */}
      <div className="p-4.5 bg-emerald-50/20 space-y-2.5">
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
        <div className="flex flex-col gap-2 mt-1 relative">
          <textarea
            value={reportSummary}
            onChange={(e) => setReportSummary(e.target.value)}
            placeholder="Click the sparkles button to generate the report summary from selected incidents..."
            rows={4}
            // className="w-full text-sm bg-white border border-slate-200/80 rounded-lg p-2.5 text-slate-950 focus:outline-none focus:border-slate-500 min-h-[100px] resize-y scrollbar-thin font-large"
            className="
                        w-full min-h-[100px] resize-y
                        p-3 pr-12 rounded-lg
                        text-sm font-lg text-slate-900
                        bg-gradient-to-br from-white to-slate-50
                        border-2 border-emerald-200 shadow-sm
                        focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500
                        placeholder-slate-400
                        scrollbar-thin
                      "
          />
          <button
            type="button"
            onClick={() => {
              const summaries = droppedIncidents
                .map((inc) => inc.summary)
                .filter(Boolean);
              setReportSummary(summaries.join("\n\n"));
            }}
            disabled={droppedIncidents.length === 0}
            className="absolute right-3.5 bottom-3.5 p-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-emerald-200 transition-colors shadow-sm cursor-pointer"
            title="Generate Summary"
          >
            <Sparkles className="w-4 h-4 text-emerald-800 animate-pulse" />
          </button>
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
            <p className="text-xs text-slate-800 max-w-[240px] leading-relaxed">
              Drag tiles from the list and drop them here to compile your report.
            </p>
          </div>
        ) : (
          <div className="flex flex-col min-h-full gap-2.5">
            {droppedIncidents.map((incident, idx) => {
              const createdDate = incident.created ? new Date(incident.created) : null;
              const dateStr = createdDate ? createdDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
              const timeStr = createdDate ? createdDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'N/A';
              const showIndicatorHere = isDragOver && calculatedInsertIndex === idx;

              let imgCount = 0;
              if (incident.images) {
                if (Array.isArray(incident.images)) {
                  imgCount = incident.images.length;
                } else if (typeof incident.images === 'string') {
                  try {
                    imgCount = JSON.parse(incident.images).length;
                  } catch (_) {}
                }
              }

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
                    className="relative flex flex-col bg-slate-50 border border-slate-200/80 rounded-lg p-3.5 pr-12 hover:bg-slate-100 transition-colors animate-fadeIn shadow-sm cursor-grab active:cursor-grabbing select-none w-full"
                  >
                    <div className="flex flex-col gap-1 w-full">
                      <span className="text-sm font-normal text-slate-800 break-words block w-full whitespace-normal">
                        {incident.summary || `Incident ${incident.id}`}
                      </span>
                    </div>

                    {/* Reusable Image Component */}
                    {imgCount > 0 && (
                      <div className="mt-3 pb-2 w-full">
                        <IncidentImages images={incident.images} />
                      </div>
                    )}

                    {/* Incident metadata (ID, date, time) displayed below images */}
                    <div className={`text-[11px] text-slate-900 font-medium truncate block w-full mt-1.5 ${imgCount > 0 ? "border-t border-slate-200/60 pt-2.5" : ""}`}>
                      <div className="flex gap-2.5 items-center flex-wrap">
                        <span className="inline-flex items-center">
                          <span className="bg-gradient-to-br from-orange-100/60 to-orange-100 font-semibold ml-0.5 text-[11px]">
                            {incident.id.slice(0, 8)}
                          </span>
                          {incident.id.length > 8 && (
                            <span className="text-slate-900 font-normal ml-0.5 text-[11px]">
                              {incident.id.slice(8)}
                            </span>
                          )}
                        </span>
                        <span className="text-slate-400">|</span>
                        <span>{dateStr}</span>
                        <span className="text-slate-400">|</span>
                        <span>{timeStr}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveIncident(incident.id)}
                      className="absolute bottom-3.5 right-3.5 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 p-1.5 rounded-lg border border-slate-200 transition-colors shadow-sm cursor-pointer"
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
  );
}
