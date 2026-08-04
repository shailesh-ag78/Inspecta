import React from "react";
import { AlertCircle } from "lucide-react";

interface PermissionHelpModalProps {
  isPermissionModalOpen: boolean;
  setIsPermissionModalOpen: (val: boolean) => void;
}

export function PermissionHelpModal({
  isPermissionModalOpen,
  setIsPermissionModalOpen
}: PermissionHelpModalProps) {
  if (!isPermissionModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-[400px] w-full bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 text-rose-600">
          <AlertCircle className="w-6 h-6" />
          <h3 className="text-lg font-bold">Permissions Required</h3>
        </div>

        <div className="text-sm text-slate-600 space-y-3">
          <p>
            We need access to your camera and microphone to record incidents and field notes. It seems permissions were denied.
          </p>
          <p className="font-semibold text-slate-800">How to fix this in Chrome:</p>
          <ol className="list-decimal list-inside space-y-1.5 ml-1">
            <li>Look at the URL address bar at the top of your browser.</li>
            <li>Click the <strong>Lock (🔒)</strong> or <strong>Tune (⚲)</strong> icon on the left side of the URL.</li>
            <li>Find <strong>Camera</strong> and <strong>Microphone</strong> in the menu.</li>
            <li>Toggle them on or select <strong>Allow</strong>.</li>
            <li>Reload this page.</li>
          </ol>
        </div>

        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={() => setIsPermissionModalOpen(false)}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
