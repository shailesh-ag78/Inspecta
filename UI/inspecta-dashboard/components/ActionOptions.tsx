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
  const hyperlinkStyle = "text-base font-bold text-blue-600 hover:text-blue-700 flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

  return (
    <>
      {/* Option A: Add New Incident */}
      <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-4">
        <h4 className={`${labelHeaderStyle} flex items-center gap-3`}>
          <span className="incident-icon text-base bg-blue-50 p-1.5 rounded-lg border border-blue-100/70 inline-flex items-center justify-center w-8 h-8 select-none" />
          <span>Add New Incident</span>
        </h4>
        <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 max-w-[485px] px-1 mt-1">
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("audio", "incident")}
            className={hyperlinkStyle}
          >
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200">
                <Mic className="w-5 h-5 text-[#800000] shrink-0" />
              </div>
              <span className="ml-3 text-left">Record Audio</span>
            </div>
          </button>
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("video", "incident")}
            className={hyperlinkStyle}
          >
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200">
                <Video className="w-5 h-5 text-blue-600 shrink-0" />
              </div>
              <span className="ml-3 text-left">Record Video</span>
            </div>
          </button>
          <button
            type="button"
            disabled={true}
            onClick={() => openRecordingOverlay("image", "incident")}
            className={hyperlinkStyle}
            title="Picture option under Add New Incident is disabled (will be implemented at a later stage)"
          >
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200">
                <Camera className="w-5 h-5 text-green-600 shrink-0" />
              </div>
              <span className="ml-3 text-left font-normal text-slate-400">Picture (Disabled)</span>
            </div>
          </button>
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => triggerFileUpload("incident")}
            className={hyperlinkStyle}
          >
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200">
                <Upload className="w-5 h-5 text-purple-600 shrink-0" />
              </div>
              <span className="ml-3 text-left">Upload File</span>
            </div>
          </button>
        </div>
      </div>

      {/* Option B: Add Field Note */}
      <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-4">
        <h4 className={`${labelHeaderStyle} flex items-center gap-3`}>
          <span className="field-note-icon text-base bg-slate-50 p-1.5 rounded-lg border border-slate-100/70 text-lg inline-flex items-center justify-center w-8 h-8 select-none" />
          <span>Add Field Note</span>
        </h4>
        <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 max-w-[485px] px-1 mt-1">
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("audio", "field_note")}
            className={hyperlinkStyle}
          >
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200">
                <Mic className="w-5 h-5 text-[#800000] shrink-0" />
              </div>
              <span className="ml-3 text-left">Record Audio</span>
            </div>
          </button>
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("video", "field_note")}
            className={hyperlinkStyle}
          >
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200">
                <Video className="w-5 h-5 text-blue-600 shrink-0" />
              </div>
              <span className="ml-3 text-left">Record Video</span>
            </div>
          </button>
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => openRecordingOverlay("image", "field_note")}
            className={hyperlinkStyle}
          >
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200">
                <Camera className="w-5 h-5 text-green-600 shrink-0" />
              </div>
              <span className="ml-3 text-left">Picture</span>
            </div>
          </button>
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => triggerFileUpload("field_note")}
            className={hyperlinkStyle}
          >
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200">
                <Upload className="w-5 h-5 text-purple-600 shrink-0" />
              </div>
              <span className="ml-3 text-left">Upload File</span>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
