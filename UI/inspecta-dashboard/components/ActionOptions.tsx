import React from "react";
import { Mic, Video, Camera, Upload } from "lucide-react";

interface ActionOptionsProps {
  isSiteDisabled: boolean;
  openRecordingOverlay: (mode: "audio" | "video" | "image", category: "incident" | "field_note") => void;
  triggerFileUpload: (category: "incident" | "field_note") => void;
}

export function ActionOptions({
  isSiteDisabled,
  openRecordingOverlay,
  triggerFileUpload
}: ActionOptionsProps) {
  const labelHeaderStyle = "text-base font-bold text-slate-700 tracking-wide";

  // Custom styled tile classes with 10% height reduction (88px -> 80px) and font size boost
  const incidentTileStyle = "relative w-full h-[80px] border border-orange-200/80 bg-orange-50/60 hover:bg-orange-100/85 hover:border-orange-350 rounded-lg flex flex-col items-center justify-center gap-1 shadow-sm transition-all select-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer p-1 text-center font-bold";
  const fieldNoteTileStyle = "relative w-full h-[80px] border border-blue-200/80 bg-blue-100/60 hover:bg-blue-200/85 hover:border-blue-350 rounded-lg flex flex-col items-center justify-center gap-1 shadow-sm transition-all select-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer p-1 text-center font-bold";

  return (
    <>
      {/* Option A: Add New Incident */}
      <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-4">
        <h4 className={`${labelHeaderStyle} flex items-center gap-3`}>
          <span className="incident-icon text-base bg-blue-50 p-1.5 rounded-lg border border-blue-100/70 inline-flex items-center justify-center w-8 h-8 select-none" />
          <span>Add New Incident</span>
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-[560px] px-1 mt-1.5">
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("audio", "incident")}
            className={incidentTileStyle}
          >
            <Mic className="w-6 h-6 text-[#800000] shrink-0" />
            <span className="text-xs text-[#800000] tracking-wide">Record Audio</span>
          </button>

          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("video", "incident")}
            className={incidentTileStyle}
          >
            <Video className="w-6 h-6 text-blue-600 shrink-0" />
            <span className="text-xs text-blue-600 tracking-wide">Record Video</span>
          </button>

          <button
            type="button"
            disabled={true}
            onClick={() => openRecordingOverlay("image", "incident")}
            className={incidentTileStyle}
            title="Picture option under Add New Incident is disabled (will be implemented at a later stage)"
          >
            <Camera className="w-6 h-6 text-green-600 shrink-0 opacity-50" />
            <span className="text-xs text-green-600 opacity-50 tracking-wide">Picture</span>
          </button>

          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => triggerFileUpload("incident")}
            className={incidentTileStyle}
          >
            <Upload className="w-6 h-6 text-purple-600 shrink-0" />
            <span className="text-xs text-purple-600 tracking-wide">Upload File</span>
          </button>
        </div>
      </div>

      {/* Option B: Add Field Note */}
      <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-4">
        <h4 className={`${labelHeaderStyle} flex items-center gap-3`}>
          <span className="field-note-icon text-base bg-slate-50 p-1.5 rounded-lg border border-slate-100/70 text-lg inline-flex items-center justify-center w-8 h-8 select-none" />
          <span>Add Field Note</span>
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-[560px] px-1 mt-1.5">
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("audio", "field_note")}
            className={fieldNoteTileStyle}
          >
            <Mic className="w-6 h-6 text-[#800000] shrink-0" />
            <span className="text-xs text-[#800000] tracking-wide">Record Audio</span>
          </button>

          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("video", "field_note")}
            className={fieldNoteTileStyle}
          >
            <Video className="w-6 h-6 text-blue-600 shrink-0" />
            <span className="text-xs text-blue-600 tracking-wide">Record Video</span>
          </button>

          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("image", "field_note")}
            className={fieldNoteTileStyle}
          >
            <Camera className="w-6 h-6 text-green-600 shrink-0" />
            <span className="text-xs text-green-600 tracking-wide">Picture</span>
          </button>

          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => triggerFileUpload("field_note")}
            className={fieldNoteTileStyle}
          >
            <Upload className="w-6 h-6 text-purple-600 shrink-0" />
            <span className="text-xs text-purple-600 tracking-wide">Upload File</span>
          </button>
        </div>
      </div>
    </>
  );
}
