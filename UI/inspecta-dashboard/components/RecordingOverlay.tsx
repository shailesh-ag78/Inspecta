import React from "react";
import { Mic, Video, Camera, X, Square, CheckCircle2 } from "lucide-react";

interface RecordingOverlayProps {
  activeOverlay: "audio" | "video" | "image" | null;
  overlayCategory: "incident" | "field_note";
  cleanUpMedia: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  tempVideoRef: React.RefObject<HTMLVideoElement>;
  photoPreview: string | null;
  isAudioPhotoTaking: boolean;
  isRecording: boolean;
  isRecordingPaused: boolean;
  recordDuration: number;
  formatTimer: (sec: number) => string;
  startRecording: () => void;
  stopRecording: () => void;
  snapSilentPhoto: () => void;
  startAudioPhotoWorkflow: () => void;
  captureAudioPhoto: () => void;
  cancelAudioPhoto: () => void;
  snapPhoto: () => void;
  uploadPhoto: () => void;
  setPhotoBlob: (blob: Blob | null) => void;
  setPhotoPreview: (preview: string | null) => void;
}

export function RecordingOverlay({
  activeOverlay,
  overlayCategory,
  cleanUpMedia,
  videoRef,
  tempVideoRef,
  photoPreview,
  isAudioPhotoTaking,
  isRecording,
  isRecordingPaused,
  recordDuration,
  formatTimer,
  startRecording,
  stopRecording,
  snapSilentPhoto,
  startAudioPhotoWorkflow,
  captureAudioPhoto,
  cancelAudioPhoto,
  snapPhoto,
  uploadPhoto,
  setPhotoBlob,
  setPhotoPreview
}: RecordingOverlayProps) {
  if (!activeOverlay) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-[480px] w-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200">
        {/* Modal Header */}
        <div className="bg-slate-900 px-5 py-3 flex items-center justify-between border-b border-slate-855">
          <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
            {activeOverlay === "audio" && <Mic className="w-4 h-4 text-red-550" />}
            {activeOverlay === "video" && <Video className="w-4 h-4 text-blue-550" />}
            {activeOverlay === "image" && <Camera className="w-4 h-4 text-emerald-400" />}
            <span>Record {activeOverlay} ({overlayCategory === "incident" ? "Incident" : "Field Note"})</span>
          </h4>
          <button
            onClick={cleanUpMedia}
            className="text-slate-400 hover:text-white p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 flex flex-col gap-4">
          <div className="relative aspect-video w-full rounded-2xl bg-black overflow-hidden border border-slate-200 flex flex-col items-center justify-center">
            {/* Video / Camera Viewport */}
            {(activeOverlay === "video" || activeOverlay === "image") && !photoPreview && (
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            )}

            {/* Taken Snapshot Viewport */}
            {activeOverlay === "image" && photoPreview && (
              <img src={photoPreview} alt="Captured preview" className="w-full h-full object-contain" />
            )}

            {/* Temp Audio Photo Viewport */}
            {activeOverlay === "audio" && isAudioPhotoTaking && (
              <video
                ref={tempVideoRef}
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            )}

            {/* Audio Visualization UI */}
            {activeOverlay === "audio" && !isAudioPhotoTaking && (
              <div className="flex flex-col items-center gap-3">
                <div className={`p-4 rounded-full bg-slate-900 text-blue-400 ${isRecording && !isRecordingPaused ? "animate-pulse border-2 border-red-500 text-red-500" : ""}`}>
                  <Mic className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {isRecording ? (isRecordingPaused ? "Audio paused for photo..." : "Live audio recording active...") : "Microphone ready"}
                </span>
              </div>
            )}

            {/* Recording duration badge */}
            {isRecording && (
              <div className="absolute top-3 left-3 bg-black/60 border border-red-500/50 rounded-full px-2.5 py-0.5 text-[9px] text-red-400 font-extrabold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                <span>{formatTimer(recordDuration)}</span>
              </div>
            )}
          </div>

          {/* Action buttons inside Overlay */}
          <div className="flex justify-center gap-3">
            {activeOverlay === "video" && (
              !isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center gap-1.5 px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                >
                  <Video className="w-4 h-4" /> Start Video Record
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={snapSilentPhoto}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                  >
                    <Camera className="w-4 h-4" /> Snap Photo
                  </button>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex items-center gap-1.5 px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                  >
                    <Square className="w-4 h-4 fill-white" /> Stop & Save
                  </button>
                </>
              )
            )}

            {activeOverlay === "audio" && (
              !isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center gap-1.5 px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                >
                  <Mic className="w-4 h-4" /> Start Audio Record
                </button>
              ) : (
                !isAudioPhotoTaking ? (
                  <>
                    <button
                      type="button"
                      onClick={startAudioPhotoWorkflow}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                    >
                      <Camera className="w-4 h-4" /> Snap Photo
                    </button>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex items-center gap-1.5 px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                    >
                      <Square className="w-4 h-4 fill-white" /> Stop & Save
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={captureAudioPhoto}
                      className="flex items-center gap-1.5 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                    >
                      <Camera className="w-4 h-4" /> Capture Now
                    </button>
                    <button
                      type="button"
                      onClick={cancelAudioPhoto}
                      className="flex items-center gap-1.5 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                    >
                      <X className="w-4 h-4" /> Cancel
                    </button>
                  </>
                )
              )
            )}

            {activeOverlay === "image" && (
              !photoPreview ? (
                <button
                  type="button"
                  onClick={snapPhoto}
                  className="flex items-center gap-1.5 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                >
                  <Camera className="w-4 h-4" /> Snap Snapshot
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={uploadPhoto}
                    className="flex items-center gap-1.5 px-6 py-2 bg-green-600 hover:bg-green-750 text-white rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Upload Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPhotoBlob(null); setPhotoPreview(null); }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-255 text-slate-600 rounded-full text-xs font-bold"
                  >
                    Retake
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
