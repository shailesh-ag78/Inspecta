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
}

interface IncidentsUploadListProps {
  incidentUploads: IncidentUpload[];
  clearLocalBundles: () => void;
}

export function IncidentsUploadList({ incidentUploads, clearLocalBundles }: IncidentsUploadListProps) {
  const labelHeaderStyle = "text-base font-bold text-slate-700 tracking-wide";

  return (
    <div className="flex flex-col gap-3 mt-2 border-t border-slate-200/70 pt-4">
      <div className="flex justify-between items-center max-w-[644px]">
        <h3 className={labelHeaderStyle}>Recorded Incidents & Field Notes</h3>
        <button
          onClick={clearLocalBundles}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
        >
          Clear Local Storage
        </button>
      </div>

      {incidentUploads.length === 0 ? (
        <div className="text-slate-400 text-sm italic">
          No recordings or field notes in this session yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 max-w-[644px]">
          {[...incidentUploads]
            .sort((a, b) => {
              const timeA = a.timestamp || (a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0);
              const timeB = b.timestamp || (b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0);
              return timeB - timeA;
            })
            .map((incident) => (
              <div
                key={incident.id}
                className="grid grid-cols-[auto_auto_1fr] gap-y-2 gap-x-4 items-center bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-slate-350 transition-colors"
              >
                {/* Row 1 : Col 1 and Col 2 merged : show Stats */}
                <div className="col-span-2 flex items-center justify-start">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider 
                    ${
                      incident.status === "Uploading"
                        ? "bg-blue-50 text-blue-600 border border-blue-200/50"
                        : incident.status === "Processing"
                        ? "bg-amber-50 text-amber-600 border border-amber-200/50 animate-pulse"
                        : incident.status === "Completed"
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200/50"
                        : incident.status === "pending"
                        ? "bg-slate-50 text-slate-600 border border-slate-200/50"
                        : "bg-rose-50 text-rose-600 border border-rose-200/50"
                    }`}
                  >
                    {incident.status === "Processing" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                    {incident.status}
                  </span>
                </div>

                {/* Row 1 : Col 3 : Show file name */}
                <div className="col-span-1 text-left min-w-0">
                  <span className="text-sm font-bold text-slate-800 truncate block" title={incident.fileName}>
                    {incident.incidentId ? incident.incidentId : ""} - {incident.fileName}
                  </span>
                </div>

                {/* Row 2 : Col 1 : Right-aligned icon of Incident or Field Note */}
                <div className="col-span-1 flex justify-end items-center">
                  {incident.category === "fieldnote" || incident.category === "field_note" ? (
                    <span
                      className="text-lg bg-amber-50 p-1.5 rounded-lg border border-amber-100/70"
                      title="Field Note"
                      role="img"
                      aria-label="Field Note"
                    >
                      📋
                    </span>
                  ) : (
                    <span
                      className="text-lg bg-blue-50 p-1.5 rounded-lg border border-blue-100/70"
                      title="Incident"
                      role="img"
                      aria-label="Incident"
                    >
                      📌
                    </span>
                  )}
                </div>

                {/* Row 2 : Col 2 : Left-aligned icon of media type */}
                <div className="col-span-1 flex justify-start items-center gap-2">
                  {incident.fileType && (
                    <div
                      className={`p-2 rounded-lg border flex items-center justify-center ${
                        incident.fileType === "audio"
                          ? "bg-[#800000]/8 border-[#800000]/15 text-[#800000]/80"
                          : incident.fileType === "video"
                          ? "bg-blue-50 border-blue-100 text-blue-500"
                          : "bg-emerald-50 border-emerald-100 text-emerald-500"
                      }`}
                    >
                      {incident.fileType === "audio" && <FileAudio className="w-5 h-5" />}
                      {incident.fileType === "video" && <FileVideo className="w-5 h-5" />}
                      {incident.fileType === "image" && <FileImage className="w-5 h-5" />}
                    </div>
                  )}
                  {/* Attachment Indicator */}
                  {(incident.attachedPhotosCount || 0) > 0 && (
                    <div
                      className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-md border border-slate-200 text-slate-600"
                      title={`${incident.attachedPhotosCount} attached photos`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold">{incident.attachedPhotosCount}</span>
                    </div>
                  )}
                </div>

                {/* Row 2 : Col 3 : Show display message after date time stamp */}
                <div className="col-span-1 text-left min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-slate-700 font-semibold whitespace-nowrap">
                    {incident.uploadedAt}
                  </span>
                  {incident.displayMessage && (
                    <>
                      <span className="text-slate-400 text-sm select-none">•</span>
                      <span
                        className={`text-sm truncate font-semibold ${
                          incident.status === "Failed" ? "text-rose-700" : "text-slate-700"
                        }`}
                        title={incident.displayMessage}
                      >
                        {incident.displayMessage}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
