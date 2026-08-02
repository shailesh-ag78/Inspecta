"use client";

import React, { useState, useEffect, useRef } from "react";
import { useDashboard } from "@/lib/context";
import {
  Plus,
  Video,
  Mic,
  Camera,
  Upload,
  Square,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileImage,
  FileAudio,
  FileVideo,
  X,
  ChevronRight
} from "lucide-react";
import { authenticatedFetch, uploadMediaFile as apiUploadMediaFile, getRecentIncidents } from "@/lib/api";

const MAX_SESSION_INCIDENTS = 10; // Limit the number of incidents in the session queue
const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds

interface SessionIncident {
  id: string;
  incidentId?: string; // The actual incident ID from the backend
  fileName: string;
  fileType: "audio" | "video" | "image";
  uploadedAt: string;
  status: "Uploading" | "Processing" | "Completed" | "Failed";
  inspectionName: string;
  siteName: string;
  category: "incident" | "field_note";
  pollingIntervalId?: any;
  displayMessage?: string;
  monitoringUrl?: string;
}

export default function InspectionPage() {
  const {
    backendSites,
    siteInspections,
    handleAddInspectionSubmit,
    fetchSiteInspections,
    sessionIncidents,
    setSessionIncidents,
    notifications,
    setNotifications,
    isNotificationsOpen,
    setIsNotificationsOpen,
    pollIncidentStatus,
  } = useDashboard();

  // Selection states
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [selectedInspectionId, setSelectedInspectionId] = useState<string>("");
  const [isAddingInspectionInline, setIsAddingInspectionInline] = useState<boolean>(false);
  const [newInspectionTitle, setNewInspectionTitle] = useState<string>("");
  const [newInspectionDescription, setNewInspectionDescription] = useState<string>("");
  const [isCreatingInspection, setIsCreatingInspection] = useState<boolean>(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);

  // Active Site & Inspection objects
  const activeSite = backendSites.find(s => String(s.site_id || s.id) === selectedSiteId);
  const filteredInspections = siteInspections.filter(
    ins => String(ins.site_id) === selectedSiteId && ins.inspection_id
  );
  const activeInspection = filteredInspections.find(
    ins => String(ins.inspection_id) === selectedInspectionId
  );

  // Recording Overlays state
  const [activeOverlay, setActiveOverlay] = useState<"audio" | "video" | "image" | null>(null);
  const [overlayCategory, setOverlayCategory] = useState<"incident" | "field_note">("incident");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordDuration, setRecordDuration] = useState<number>(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [incidentError, setIncidentError] = useState<string | null>(null);



  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadCategoryRef = useRef<"incident" | "field_note">("incident");

  // Auto-select first site
  useEffect(() => {
    if (backendSites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(String(backendSites[0].site_id || backendSites[0].id));
    }
  }, [backendSites, selectedSiteId]);

  // Reset selected inspection when site changes
  useEffect(() => {
    if (selectedSiteId) {
      const siteIns = siteInspections.filter(
        ins => String(ins.site_id) === selectedSiteId && ins.inspection_id
      );
      if (siteIns.length > 0) {
        setSelectedInspectionId(String(siteIns[0].inspection_id));
      } else {
        setSelectedInspectionId("");
      }
    }
  }, [selectedSiteId, siteInspections]);

  // Timer interval for recording duration
  useEffect(() => {
    if (isRecording) {
      setRecordDuration(0);
      durationIntervalRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  }, [isRecording]);

  // Cleanup helper
  const cleanUpMedia = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setIsRecording(false);
    setPhotoBlob(null);
    setPhotoPreview(null);
    setActiveOverlay(null);
  };

  // Launch Recording Workspace Overlay
  const openRecordingOverlay = async (mode: "audio" | "video" | "image", category: "incident" | "field_note") => {
    setIncidentError(null);
    if (!selectedInspectionId) {
      setIncidentError("Please select or create an inspection before recording.");
      return;
    }

    setOverlayCategory(category);
    setActiveOverlay(mode);
    setPhotoPreview(null);
    setPhotoBlob(null);

    try {
      const constraints = {
        video: mode === "video" || mode === "image" ? { width: 640, height: 480 } : false,
        audio: true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);

      // Delay briefly to allow videoRef component overlay to mount
      setTimeout(() => {
        if (videoRef.current && (mode === "video" || mode === "image")) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error("Video stream play failed:", e));
        }
      }, 300);
    } catch (err) {
      console.error("Error accessing media devices:", err);
      setIncidentError("Could not access camera/microphone. Check permission settings.");
    }
  };

  const startRecording = () => {
    if (!cameraStream) return;
    recordedChunksRef.current = [];

    let options = {};
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
      options = { mimeType: "video/webm;codecs=vp9" };
    } else if (MediaRecorder.isTypeSupported("video/webm")) {
      options = { mimeType: "video/webm" };
    }

    try {
      const recorder = new MediaRecorder(cameraStream, options);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const fileExtension = activeOverlay === "video" ? "webm" : "wav";
        const mimeType = activeOverlay === "video" ? "video/webm" : "audio/wav";
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `recorded_${overlayCategory}_${timestamp}.${fileExtension}`;
        const file = new File([blob], filename, { type: mimeType });

        cleanUpMedia();
        cleanUpMedia(); // Clean up UI immediately after recording stops
        await uploadMediaFile(file, activeOverlay === "video" ? "video" : "audio", overlayCategory);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
    } catch (err) {
      console.error("Media recorder start error:", err);
      setIncidentError("Unable to start recording.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const snapPhoto = () => {
    if (!videoRef.current || !cameraStream) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            setPhotoBlob(blob);
            setPhotoPreview(URL.createObjectURL(blob));
          }
        }, "image/jpeg", 0.95);
      }
    } catch (err) {
      console.error("Snapshot error:", err);
      setIncidentError("Failed to snap picture.");
    }
  };

  const uploadPhoto = async () => {
    if (!photoBlob) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `snapshot_${overlayCategory}_${timestamp}.jpg`;
    const file = new File([photoBlob], filename, { type: "image/jpeg" });

    cleanUpMedia();
    await uploadMediaFile(file, "image", overlayCategory);
  };



  // Upload Logic
  const uploadMediaFile = async (file: File, fileType: "audio" | "video" | "image", category: "incident" | "field_note") => {
    if (!selectedInspectionId) return;
    const newId = `session_${Date.now()}`;
    setIncidentError(null);

    const onProgress = (status: "Uploading" | "Processing" | "Completed" | "Failed", message?: string) => {
      setSessionIncidents(prev =>
        prev.map(inc => {
          if (inc.id === newId) {
            return { ...inc, status, displayMessage: message };
          }
          return inc;
        })
      );
      if (status === "Failed") {
        setIncidentError(message || "Upload failed");
      }
    };
    // Add to session incidents list (limit to MAX_SESSION_INCIDENTS)

    setSessionIncidents(prev => {
      const newIncident: SessionIncident = {
        id: newId,
        fileName: file.name,
        fileType: fileType,
        uploadedAt: new Date().toLocaleTimeString(),
        status: "Uploading",
        displayMessage: `Uploading ${file.name}...`,
        inspectionName: activeInspection?.label || "Inspection",
        siteName: activeSite?.site_name || activeSite?.name || "Site",
        category
      };
      const updatedList = [newIncident, ...prev];
      return updatedList.slice(0, MAX_SESSION_INCIDENTS);
    });

    try {
      const { incidentId, monitoringUrl } = await apiUploadMediaFile(file, selectedInspectionId, onProgress);

      setSessionIncidents(prev =>
        prev.map(inc => {
          if (inc.id === newId) {
            return { ...inc, incidentId, monitoringUrl, status: "Processing", displayMessage: "Processing started..." };
          }
          return inc;
        })
      );
      await pollIncidentStatus(incidentId, monitoringUrl, newId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown upload error occurred";
      setIncidentError(errorMessage);
      setSessionIncidents(prev =>
        prev.map(inc => inc.id === newId ? { ...inc, status: "Failed", displayMessage: errorMessage } : inc)
      );
      console.error("Incident upload failed:", error);
    }
  };

  const triggerFileUpload = (category: "incident" | "field_note") => {
    setIncidentError(null);
    if (!selectedInspectionId) {
      setIncidentError("Please select or create an inspection before uploading.");
      return;
    }
    uploadCategoryRef.current = category;
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let mediaType: "audio" | "video" | "image" = "video";
    if (file.type.startsWith("image/")) {
      mediaType = "image";
    } else if (file.type.startsWith("audio/")) {
      mediaType = "audio";
    }

    await uploadMediaFile(file, mediaType, uploadCategoryRef.current);
    e.target.value = "";
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isSiteDisabled = !selectedSiteId;

  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const handleCreateInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInspectionTitle.trim() || !selectedSiteId) return;
    if (!newInspectionTitle.trim() || !selectedSiteId) {
      setInspectionError("Inspection title and selected site are required.");
      return;
    }

    try {
      setIsCreatingInspection(true);
      setInspectionError(null);

      const friendlyName = newInspectionTitle.trim();
      const url = `/api/inspections?siteId=${selectedSiteId}&friendlyName=${encodeURIComponent(friendlyName)}`;

      const response = await authenticatedFetch(url, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error((await response.json()).detail || "Server error");
      }

      setNewInspectionTitle("");
      setNewInspectionDescription("");
      setIsAddingInspectionInline(false);
      fetchSiteInspections(); // Refetch inspections to show the new one
    } catch (err) {
      console.error("Create inspection failed:", err);
      setInspectionError(err instanceof Error ? err.message : "Failed to create inspection");
    } finally {
      setIsCreatingInspection(false);
      // Refetch inspections to show the new one
      fetchSiteInspections();
    }
  };


  // Increased header/label text size formatting class
  const labelHeaderStyle = "text-base font-bold text-slate-700 tracking-wide";

  // Hyperlink aesthetic class matching "+ Create New Inspection"
  const hyperlinkStyle = "text-base font-bold text-blue-600 hover:text-blue-700 flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50 dropdown-scrollbar">
      <div className="p-6 flex flex-col items-start justify-start w-full">
        {/* Workspace Header with Notification Bell */}
        <div className="w-full flex items-center justify-between mb-6 relative">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Inspection Workspace</h1>
            <p className="text-sm text-slate-500 font-medium">Upload media and manage background inspections</p>
          </div>
          
          <div className="relative">
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative p-2.5 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl shadow-sm transition-colors text-slate-600 hover:text-slate-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2.5 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col">
                <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-black text-white uppercase tracking-wider">Notifications</span>
                  {notifications.length > 0 && (
                    <button
                      onClick={() => {
                        setNotifications([]);
                      }}
                      className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-wider"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dropdown-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-slate-400 text-xs italic">
                      No notifications yet.
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div
                        key={notif.id}
                        className={`p-3 flex items-start gap-2.5 hover:bg-slate-50 transition-colors ${!notif.read ? 'bg-blue-50/20' : ''}`}
                      >
                        <span className="mt-0.5 text-base shrink-0">
                          {notif.type === 'success' ? '✅' : '❌'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 leading-normal break-words">
                            {notif.message}
                          </p>
                          <span className="text-[9px] font-bold text-slate-400 mt-1 block">
                            {notif.timestamp}
                          </span>
                        </div>
                        {!notif.read && (
                          <button
                            onClick={() => {
                              setNotifications(prev =>
                                prev.map(n => n.id === notif.id ? { ...n, read: true } : n)
                              );
                            }}
                            className="text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors shrink-0"
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full bg-pane-bg/98 rounded-2xl border border-slate-200/70 shadow-md overflow-hidden flex flex-col">

          {/* Configuration Body Content */}
          <div className="p-5 flex flex-col gap-6">

            {/* Site Selector (Bounded/fixed width) */}
            <div className="flex flex-col gap-2 w-full max-w-[485px]">
              <label className={labelHeaderStyle}>
                Select Site on which incident to be added
              </label>
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="w-full text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 transition-all cursor-pointer h-11"
              >
                {backendSites.length === 0 ? (
                  <option value="">No Sites Available</option>
                ) : (
                  backendSites.map(site => (
                    <option key={site.site_id || site.id} value={site.site_id || site.id}>
                      🏢 {site.site_name || site.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Inspection Selector & Inline Action (Bounded/fixed width) with increased gap */}
            <div className="flex flex-col gap-3 w-full max-w-[485px]">
              <div className="flex flex-col gap-2">
                <label className={labelHeaderStyle}>Inspection</label>
                <select
                  value={selectedInspectionId}
                  disabled={isSiteDisabled}
                  onChange={(e) => setSelectedInspectionId(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 transition-all cursor-pointer h-11 disabled:opacity-50"
                >
                  {filteredInspections.length === 0 ? (
                    <option value="">No Inspections Available under Site</option>
                  ) : (
                    filteredInspections.map(ins => {
                      const dateStr = formatDate(ins.inspection_created_at);
                      const displayLabel = dateStr ? `${ins.label} (${dateStr})` : ins.label;
                      return (
                        <option key={ins.inspection_id} value={ins.inspection_id || ""}>
                          🔍 {displayLabel}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              {/* Inline Action Trigger */}
              <div className="flex flex-col gap-2 mt-0.5">
                {!isAddingInspectionInline ? (
                  <button
                    type="button"
                    disabled={isSiteDisabled}
                    onClick={() => setIsAddingInspectionInline(true)}
                    className="text-base font-bold text-blue-600 hover:text-blue-700 flex items-center gap-2 self-start transition-colors px-1 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-5 h-5 text-blue-600" />
                    <span>Create New Inspection</span>
                  </button>
                ) : (
                  <form onSubmit={handleCreateInspection} className="flex flex-col gap-3.5 bg-slate-50 p-4 rounded-lg border border-slate-200/80 animate-fadeIn">
                    <span className="text-xs text-slate-600 font-bold uppercase">Adding New Inspection</span>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-500 font-bold">Inspection Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Safety Audit - Boiler Room"
                        value={newInspectionTitle}
                        onChange={(e) => setNewInspectionTitle(e.target.value)}
                        className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-500 font-bold">Description (Optional)</label>
                      <textarea
                        placeholder="Add an optional description about this audit..."
                        value={newInspectionDescription}
                        rows={2}
                        onChange={(e) => setNewInspectionDescription(e.target.value)}
                        className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 resize-none"
                      />
                    </div>

                    <div className="flex gap-2.5 justify-end">
                      <button
                        type="button"
                        onClick={() => setIsAddingInspectionInline(false)}
                        className="px-3.5 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingInspection || !newInspectionTitle.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {isCreatingInspection ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </form>
                )}

                {inspectionError && (
                  <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{inspectionError}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Option A: Add New Incident */}
            <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-4">
              <h4 className={labelHeaderStyle}>📌 Add New Incident</h4>
              <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 max-w-[485px] px-1 mt-1">
                <button
                  type="button"
                  disabled={isSiteDisabled}
                  onClick={() => openRecordingOverlay("audio", "incident")}
                  className={hyperlinkStyle}
                >
                  <div className="flex items-center">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200">
                      <Mic className="w-5 h-5 text-red-600 shrink-0" />
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
                  disabled={isSiteDisabled}
                  onClick={() => openRecordingOverlay("image", "incident")}
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
              <h4 className={labelHeaderStyle}>📋 Add Field Note</h4>
              <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 max-w-[485px] px-1 mt-1">
                <button
                  type="button"
                  disabled={isSiteDisabled}
                  onClick={() => openRecordingOverlay("audio", "field_note")}
                  className={hyperlinkStyle}
                >
                  <div className="flex items-center">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200">
                      <Mic className="w-5 h-5 text-red-600 shrink-0" />
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

            <input
              type="file"
              ref={fileInputRef}
              accept="audio/*,video/*,image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Progress/Error Logs */}
            {uploadProgress && (
              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 shadow-sm max-w-[485px]">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span>{uploadProgress}</span>
              </div>
            )}

            {incidentError && (
              <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5 shadow-sm max-w-[485px]">
                <AlertCircle className="w-4 h-4" />
                <span>{incidentError}</span>
              </div>
            )}

            {/* Session Queue List */}
            <div className="flex flex-col gap-3 mt-2 border-t border-slate-200/70 pt-4">
              <h3 className={labelHeaderStyle}>Session Queue</h3>

              {sessionIncidents.length === 0 ? (
                <div className="text-slate-400 text-sm italic">
                  No incidents in this session yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 max-w-[560px]">
                  {sessionIncidents.map((incident) => (
                    <div
                      key={incident.id}
                      className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm hover:border-slate-350 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-6 min-w-0">
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-slate-400">
                          {incident.fileType === "audio" && <FileAudio className="w-5 h-5 text-red-555" />}
                          {incident.fileType === "video" && <FileVideo className="w-5 h-5 text-blue-555" />}
                          {incident.fileType === "image" && <FileImage className="w-5 h-5 text-emerald-655" />}
                        </div>
                        <div className="flex flex-col items-center text-center min-w-0">
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-slate-800 truncate" title={incident.fileName}>
                              {incident.incidentId ? incident.incidentId.substring(0, 4) + '...' : ''} - {' '}
                              {incident.fileName}
                            </span>
                            <span className="flex items-center text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded gap-1">
                              {incident.category === "incident" ? (
                                <>
                                  <span role="img" aria-label="incident">📌</span> Incident
                                </>
                              ) : (
                                <>
                                  <span role="img" aria-label="incident">📋</span> Field Note
                                </>
                              )}
                            </span>
                          </div>
                          <span className="text-xs text-slate-600 mt-2">
                            {incident.uploadedAt}
                          </span>
                          <span className="text-xs text-slate-500 mt-1 italic">{incident.displayMessage}</span>
                        </div>
                      </div>

                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${incident.status === "Uploading" ? "bg-blue-50 text-blue-600 border border-blue-200/50" :
                        incident.status === "Processing" ? "bg-amber-50 text-amber-600 border border-amber-200/50 animate-pulse" :
                          incident.status === "Completed" ? "bg-emerald-50 text-emerald-600 border border-emerald-200/50" :
                            "bg-rose-50 text-rose-600 border border-rose-200/50"
                        }`}>
                        {incident.status === "Uploading" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                        {incident.status === "Processing" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                        {incident.status === "Completed" ? "Complete" : incident.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recording Overlay Modal */}
      {activeOverlay && (
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

                {/* Audio Visualization UI */}
                {activeOverlay === "audio" && (
                  <div className="flex flex-col items-center gap-3">
                    <div className={`p-4 rounded-full bg-slate-900 text-blue-400 ${isRecording ? "animate-pulse border-2 border-red-500 text-red-500" : ""}`}>
                      <Mic className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-slate-400">
                      {isRecording ? "Live audio recording active..." : "Microphone ready"}
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
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex items-center gap-1.5 px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                    >
                      <Square className="w-4 h-4 fill-white" /> Stop & Save
                    </button>
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
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex items-center gap-1.5 px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full text-xs font-bold shadow-md active:scale-95 transition-all"
                    >
                      <Square className="w-4 h-4 fill-white" /> Stop & Save
                    </button>
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
      )}
    </div>
  );
}
