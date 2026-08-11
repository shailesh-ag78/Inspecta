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
  const labelHeaderStyle = "text-sm font-bold text-slate-700 tracking-wide";
  // Glassmorphism classes: added backdrop-blur-md, semi-transparent borders, and inner highlight reflections
  // const incidentCommonClass = "relative rounded-xl p-3 flex flex-col items-center justify-center text-white font-medium text-xs shadow-md border border-white/20 backdrop-blur-md shadow-[inset_0_1.5px_0_rgba(255,255,255,0.35)] before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-b before:from-white/20 before:via-transparent before:to-transparent before:pointer-events-none hover:brightness-110 active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed select-none";
  // const fieldNoteCommonClass = "relative rounded-xl p-3 flex flex-col items-center justify-center font-medium text-xs shadow-sm border border-white/30 backdrop-blur-md shadow-[inset_0_1.5px_0_rgba(255,255,255,0.65)] before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-b before:from-white/45 before:via-transparent before:to-transparent before:pointer-events-none hover:brightness-105 active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed select-none";
  const incidentCommonClass = `
  relative rounded-xl p-3 flex flex-col items-center justify-center text-white font-medium text-xs
  shadow-md border border-white/20 backdrop-blur-md
  shadow-[inset_0_1.5px_0_rgba(255,255,255,0.45)]
  before:absolute before:inset-0 before:rounded-xl
  before:bg-gradient-to-b before:from-white/25 before:via-white/10 before:to-transparent
  after:absolute after:top-0 after:left-0 after:right-0 after:h-[40%]
  after:rounded-t-xl after:bg-gradient-to-b after:from-white/40 after:to-transparent
  before:pointer-events-none after:pointer-events-none
  hover:brightness-110 active:scale-95 transition-all duration-200
  disabled:opacity-40 disabled:cursor-not-allowed select-none
`;
  const fieldNoteCommonClass = `
  relative rounded-xl p-3 flex flex-col items-center justify-center font-medium text-xs
  shadow-sm border border-white/30 backdrop-blur-md
  shadow-[inset_0_1.5px_0_rgba(255,255,255,0.65)]
  before:absolute before:inset-0 before:rounded-xl
  before:bg-gradient-to-b before:from-white/50 before:via-white/20 before:to-transparent
  after:absolute after:top-0 after:left-0 after:right-0 after:h-[35%]
  after:rounded-t-xl after:bg-gradient-to-b after:from-white/60 after:to-transparent
  before:pointer-events-none after:pointer-events-none
  hover:brightness-105 active:scale-95 transition-all duration-200
  disabled:opacity-40 disabled:cursor-not-allowed select-none
`;


  return (
    <>
      {/* Option A: Add New Incident */}
      <div className="flex flex-col gap-2 border-t border-slate-100 pt-3.5">
        <h4 className={`${labelHeaderStyle} flex items-center gap-3`}>
          <span className="incident-icon text-sm bg-blue-50 p-1.5 rounded-lg border border-blue-100/70 inline-flex items-center justify-center w-8 h-8 select-none" />
          <span>Add New Incident</span>
        </h4>
        <div className="grid grid-cols-4 gap-3 max-w-[435px] mt-1.5">
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("audio", "incident")}
            className={`${incidentCommonClass} bg-gradient-to-b from-amber-500 to-amber-600 shadow-md`}
          >
            <Mic className="w-7 h-7 mb-1.5 shrink-0 z-10" />
            <span className="z-10 text-center">Record Audio</span>
          </button>

          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("video", "incident")}
            className={`${incidentCommonClass} bg-gradient-to-b from-blue-500 to-blue-600`}
          >
            <Video className="w-7 h-7 mb-1.5 shrink-0 z-10" />
            <span className="z-10 text-center">Record Video</span>
          </button>

          <button
            type="button"
            disabled={true}
            onClick={() => openRecordingOverlay("image", "incident")}
            className="relative rounded-xl p-3 flex flex-col items-center justify-center text-white font-medium text-xs bg-gradient-to-b from-green-500 to-green-600 shadow-md opacity-40 cursor-not-allowed select-none border border-black/10"
            title="Picture option under Add New Incident is disabled (will be implemented at a later stage)"
          >
            <Camera className="w-7 h-7 mb-1.5 shrink-0 z-10" />
            <span className="z-10 text-center">Picture</span>
          </button>

          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => triggerFileUpload("incident")}
            className={`${incidentCommonClass} bg-gradient-to-b from-purple-400 to-purple-500`}
          >
            <Upload className="w-7 h-7 mb-1.5 shrink-0 z-10" />
            <span className="z-10 text-center">Upload File</span>
          </button>
        </div>
      </div>

      {/* Option B: Add Field Note */}
      <div className="flex flex-col gap-2 border-t border-slate-100 pt-3.5">
        <h4 className={`${labelHeaderStyle} flex items-center gap-3`}>
          <span className="field-note-icon text-sm bg-slate-50 p-1.5 rounded-lg border border-slate-100/70 inline-flex items-center justify-center w-8 h-8 select-none" />
          <span>Add Field Note</span>
        </h4>
        <div className="grid grid-cols-4 gap-3 max-w-[435px] mt-1.5">
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("audio", "field_note")}
            className={`${fieldNoteCommonClass} text-red-600 bg-gradient-to-b from-red-100 to-red-200`}
          >
            <Mic className="w-7 h-7 mb-1.5 shrink-0 z-10" />
            <span className="z-10 text-center">Record Audio</span>
          </button>

          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("video", "field_note")}
            className={`${fieldNoteCommonClass} text-blue-600 bg-gradient-to-b from-blue-100 to-blue-200`}
          >
            <Video className="w-7 h-7 mb-1.5 shrink-0 z-10" />
            <span className="z-10 text-center">Record Video</span>
          </button>

          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("image", "field_note")}
            className={`${fieldNoteCommonClass} text-green-600 bg-gradient-to-b from-green-100 to-green-200`}
          >
            <Camera className="w-7 h-7 mb-1.5 shrink-0 z-10" />
            <span className="z-10 text-center">Picture</span>
          </button>

          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => triggerFileUpload("field_note")}
            className={`${fieldNoteCommonClass} text-purple-600 bg-gradient-to-b from-purple-100 to-purple-200`}
          >
            <Upload className="w-7 h-7 mb-1.5 shrink-0 z-10" />
            <span className="z-10 text-center">Upload File</span>
          </button>
        </div>
      </div>
    </>
  );
}
