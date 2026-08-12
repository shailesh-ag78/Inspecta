import React from "react";
import { Loader2, Camera, FileAudio, FileVideo, FileImage } from "lucide-react";

export interface IncidentUpload {
  id: string;
  incidentId?: string;
  fileName: string;
  fileType: "audio" | "video" | "image";
  uploadedAt: string;
  status: "Uploading" | "Processing" | "Completed" | "Failed";
  inspectionName: string;
  siteName: string;
  category: "incident" | "field_note";
  attachedPhotosCount?: number;
  pollingIntervalId?: any;
  displayMessage?: string;
  timestamp?: number;
  primarySizeKB?: number;
  attachedSizesKB?: number[];
}

interface IncidentsUploadListProps {
  incidentUploads: IncidentUpload[];
  clearLocalBundles: () => void;
}

function getTileTitle(incident: IncidentUpload) {
  const idStr = incident.incidentId || incident.id || "";
  const displayId = idStr.length > 8 ? idStr.substring(0, 8) : idStr;

  const typeLabel = incident.category === "field_note" ? "Field Note" : "Incident";

  const getFormattedDate = (uploadedAt?: string) => {
    if (!uploadedAt) return "";
    const d = new Date(uploadedAt);
    if (isNaN(d.getTime())) {
      return `at ${uploadedAt}`;
    }
    return `at ${d.toLocaleString()}`;
  };
  const dateStr = getFormattedDate(incident.uploadedAt)

  return `${displayId} ${dateStr}`;
  // return `${typeLabel} :: ${displayId} ${dateStr}`;
}

export function IncidentsUploadList({ incidentUploads, clearLocalBundles }: IncidentsUploadListProps) {
  const labelHeaderStyle = "text-sm font-bold text-slate-700 tracking-wide";
  const getTotalSize = (incident: IncidentUpload) => {
    let totalSizeKB = 0;
    if (incident.primarySizeKB !== undefined) {
      totalSizeKB += incident.primarySizeKB;
    }
    if (incident.attachedSizesKB && incident.attachedSizesKB.length > 0) {
      totalSizeKB += incident.attachedSizesKB.reduce((a, b) => a + b, 0);
    }

    // Format size string: KB or MB if >= 1024 KB
    let sizeStr = "";
    if (totalSizeKB > 0) {
      if (totalSizeKB >= 1024) {
        const sizeMB = Math.round(totalSizeKB / 1024);
        sizeStr = `(${sizeMB} MB)`;
      } else {
        sizeStr = `(${totalSizeKB} KB)`;
      }
    }
    return sizeStr;
  };

  return (
    <div className="flex flex-col gap-3 mt-2 border-t border-slate-200/70 pt-4 w-full">
      <div className="flex justify-between items-center w-full max-w-[485px]">
        <h3 className={labelHeaderStyle}>Recorded Incidents & Field Notes</h3>
        <button
          onClick={clearLocalBundles}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition-colors"
        >
          Clear Local Storage
        </button>
      </div>

      {incidentUploads.length === 0 ? (
        <div className="text-slate-400 text-xs italic">
          No recordings or field notes in this session yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 w-full max-w-[485px]">
          {[...incidentUploads]
            .sort((a, b) => {
              const timeA = a.timestamp || (a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0);
              const timeB = b.timestamp || (b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0);
              return timeB - timeA;
            })
            .map((incident) => (
              <div
                key={incident.id}
                className="grid grid-cols-[56px_56px_1fr] gap-y-1 gap-x-1 items-center bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm hover:border-slate-350 transition-colors"
              >
                {/* Row 1 : Col 1 and Col 2 merged : Status (Left-aligned) */}
                <div className="col-span-2 w-full flex items-center justify-start text-left">
                  <span
                    className={`inline-flex items-center gap-1 px-3.5 py-1.25 rounded-full text-[10px] font-bold uppercase tracking-wider 
                    ${incident.status === "Uploading"
                        ? "bg-blue-50 text-blue-600 border border-blue-200/50"
                        : incident.status === "Processing"
                          ? "bg-amber-50 text-amber-600 border border-amber-200/50 animate-pulse"
                          : incident.status === "Completed"
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200/50"
                            : "bg-rose-50 text-rose-600 border border-rose-200/50"
                      }`}
                  >
                    {["Processing", "Uploading"].includes(incident.status) && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                    {incident.status}
                  </span>
                </div>

                {/* Row 1 : Col 3 : Show file name */}
                <div className="col-span-1 flex justify-between items-center min-w-0">
                  <span className="text-xs font-bold text-slate-800 truncate block">
                    {getTileTitle(incident)}
                  </span>
                  <span className="text-xs text-slate-600 text-right">
                    {getTotalSize(incident)}
                  </span>
                </div>

                {/* Row 2 : Col 1 & 2 merged : Category, Media type, and Image Icons */}
                <div className="col-span-2 flex items-center justify-start gap-1">
                  {/* Category Icon */}
                  {incident.category === "field_note" ? (
                    <span
                      className="field-note-icon text-xs bg-amber-50 rounded-lg border border-amber-100/70 w-8 h-8 flex items-center justify-center flex-shrink-0"
                      title="Field Note"
                      role="img"
                      aria-label="Field Note"
                    />
                  ) : (
                    <span
                      className="incident-icon text-xs bg-blue-50 rounded-lg border border-blue-100/70 w-8 h-8 flex items-center justify-center flex-shrink-0"
                      title="Incident"
                      role="img"
                      aria-label="Incident"
                    />
                  )}

                  {/* Media Type Icon */}
                  {incident.fileType && incident.fileType !== "image" ? (
                    <div
                      className={`p-2 rounded-lg border flex items-center justify-center w-8 h-8 flex-shrink-0 ${incident.fileType === "audio"
                        ? "bg-[#800000]/8 border-[#800000]/15 text-[#800000]/85"
                        : "bg-blue-50 border-blue-100 text-blue-600"
                        }`}
                    >
                      {incident.fileType === "audio" && <FileAudio className="w-6 h-6" />}
                      {incident.fileType === "video" && <FileVideo className="w-6 h-6" />}
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg border border-slate-100/70 bg-slate-50/50 flex items-center justify-center text-slate-300 flex-shrink-0">
                      -
                    </div>
                  )}

                  {/* Image Icon */}
                  {((incident.attachedPhotosCount || 0) > 0 || incident.fileType === "image") && (
                    <div
                      className="relative flex items-center justify-center w-8 h-8 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg flex-shrink-0"
                      title={incident.fileType === "image" ? "Primary image file" : `${incident.attachedPhotosCount} attached photos`}
                    >
                      <Camera className="w-5 h-5 text-amber-600" />
                      {incident.attachedPhotosCount && incident.attachedPhotosCount > 0 ? (
                        <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                          {incident.attachedPhotosCount}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Row 2 : Col 3 : Display Message */}
                <div className="col-span-1 text-left min-w-0 flex items-center">
                  {incident.displayMessage && (
                    <span
                      className={`text-xs truncate font-semibold ${incident.status === "Failed" ? "text-rose-700" : "text-slate-500"
                        }`}
                      title={incident.displayMessage}
                    >
                      {incident.displayMessage}
                    </span>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
