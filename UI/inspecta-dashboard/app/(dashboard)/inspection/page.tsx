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
import { authenticatedFetch, uploadMediaFile as apiUploadMediaFile } from "@/lib/api";
import { saveBundleToIdb, AttachedMedia, IncidentBundle } from "@/lib/idb";

const MAX_SESSION_INCIDENTS = 5; // Limit the number of incidents in the session queue
const MAX_SESSION_PHOTOS = 5; // Limit max photos attached per recording
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
  attachedPhotosCount?: number;
  pollingIntervalId?: any;
  displayMessage?: string;
  timestamp?: number;
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
    processUploadQueue,
    clearLocalBundles,
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
  const [isRecordingPaused, setIsRecordingPaused] = useState<boolean>(false);
  const [isAudioPhotoTaking, setIsAudioPhotoTaking] = useState<boolean>(false);
  const [tempCameraStream, setTempCameraStream] = useState<MediaStream | null>(null);
  const [currentSessionPhotos, setCurrentSessionPhotos] = useState<AttachedMedia[]>([]);

  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState<boolean>(false);

  const showPermissionHelpModal = () => {
    setIsPermissionModalOpen(true);
  };

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const tempVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadCategoryRef = useRef<"incident" | "field_note">("incident");
  const currentBundleIdRef = useRef<string>("");

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
    if (isRecording && !isRecordingPaused) {
      durationIntervalRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isRecording, isRecordingPaused]);

  // Cleanup helper
  const cleanUpMedia = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    if (tempCameraStream) {
      tempCameraStream.getTracks().forEach(track => track.stop());
      setTempCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (tempVideoRef.current) {
      tempVideoRef.current.srcObject = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
    setIsAudioPhotoTaking(false);
    setCurrentSessionPhotos([]);
    setPhotoBlob(null);
    setPhotoPreview(null);
    setActiveOverlay(null);
  };

  const openRecordingOverlay = async (mode: "audio" | "video" | "image", category: "incident" | "field_note") => {
    setIncidentError(null);
    currentBundleIdRef.current = `bundle_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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

      // Handle USB Disconnects
      if (mode === "video" || mode === "image") {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            setIncidentError("Camera disconnected. Saving recording...");
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              mediaRecorderRef.current.stop();
            } else {
              cleanUpMedia();
            }
          };
        }
      }

      // Delay briefly to allow videoRef component overlay to mount
      setTimeout(() => {
        if (videoRef.current && (mode === "video" || mode === "image")) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error("Video stream play failed:", e));
        }
      }, 300);
    } catch (err: any) {
      console.error("Error accessing media devices:", err);
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        setIncidentError("Permission denied for camera/microphone.");
        showPermissionHelpModal();
      } else if (err.name === "NotFoundError") {
        setIncidentError("Camera or microphone not found on this device.");
      } else {
        setIncidentError("Could not access camera/microphone. Check permission settings.");
      }
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
        const filename = `${currentBundleIdRef.current}_recorded_${overlayCategory}_${timestamp}.${fileExtension}`;

        const bundleId = currentBundleIdRef.current;
        
        // Capture current photos before state reset in cleanUpMedia
        const attached = [...currentSessionPhotos];
        const pType = activeOverlay === "video" ? "video" : "audio";

        const bundle: IncidentBundle = {
          id: bundleId,
          inspectionId: selectedInspectionId,
          category: overlayCategory,
          primaryBlob: blob,
          primaryFilename: filename,
          primaryType: pType,
          attachedMedia: attached,
          status: "pending",
          retries: 0,
          createdAt: Date.now()
        };

        cleanUpMedia(); // Resets states, so we must save the bundle after
        
        await saveBundleToIdb(bundle);

        // Add to UI Queue
        setSessionIncidents(prev => [{
          id: bundleId,
          fileName: filename,
          fileType: pType,
          uploadedAt: new Date().toLocaleTimeString(),
          status: "pending",
          inspectionName: activeInspection?.friendly_name || activeInspection?.inspection_name || "Unknown Inspection",
          siteName: activeSite?.site_name || "Unknown Site",
          category: overlayCategory,
          attachedPhotosCount: attached.length,
          displayMessage: "Pending Upload"
        }, ...prev]);

        // Kick off upload processor
        processUploadQueue();
      };

      mediaRecorderRef.current = recorder;
      setRecordDuration(0);
      recorder.start(1000);
      setIsRecording(true);
      setIsRecordingPaused(false);
    } catch (err) {
      console.error("Media recorder start error:", err);
      setIncidentError("Unable to start recording.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && (isRecording || isRecordingPaused)) {
      mediaRecorderRef.current.stop();
    }
  };

  const snapSilentPhoto = () => {
    if (!videoRef.current || !cameraStream) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (blob) {
            if (currentSessionPhotos.length >= MAX_SESSION_PHOTOS) {
              setIncidentError(`Maximum of ${MAX_SESSION_PHOTOS} photos allowed.`);
              return;
            }
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `${currentBundleIdRef.current}_snapshot_${overlayCategory}_${timestamp}_during_video.jpg`;
            setCurrentSessionPhotos(prev => [...prev, { blob, filename, type: "image" }]);

            // Debugging: Save to disk automatically
            try {
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = filename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              console.log("Debug: Saved snapshot to disk:", filename);
            } catch (e) {
              console.error("Debug: Failed to save snapshot to disk:", e);
            }
          }
        }, "image/jpeg", 0.95);
      }
    } catch (err) {
      console.error("Silent snapshot error:", err);
      setIncidentError("Failed to snap picture silently.");
    }
  };

  const startAudioPhotoWorkflow = async () => {
    try {
      // Pause audio recording
      if (mediaRecorderRef.current && isRecording && !isRecordingPaused) {
        mediaRecorderRef.current.pause();
        setIsRecordingPaused(true);
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      setTempCameraStream(stream);
      setIsAudioPhotoTaking(true);
      
      setTimeout(() => {
        if (tempVideoRef.current) {
          tempVideoRef.current.srcObject = stream;
          tempVideoRef.current.play().catch(e => console.error("Temp video play failed:", e));
        }
      }, 300);
    } catch (err) {
      console.error("Error starting camera for audio snapshot:", err);
      setIncidentError("Could not access camera.");
      if (mediaRecorderRef.current && isRecording && isRecordingPaused) {
        mediaRecorderRef.current.resume();
        setIsRecordingPaused(false);
      }
    }
  };

  const captureAudioPhoto = () => {
    if (!tempVideoRef.current || !tempCameraStream) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = tempVideoRef.current.videoWidth || 640;
      canvas.height = tempVideoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(tempVideoRef.current, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (blob) {
            if (currentSessionPhotos.length < MAX_SESSION_PHOTOS) {
              // Append timestamp
              const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
              const filename = `${currentBundleIdRef.current}_snapshot_${overlayCategory}_${timestamp}_at_${recordDuration}s.jpg`;
              setCurrentSessionPhotos(prev => [...prev, { blob, filename, type: "image" }]);

              // Debugging: Save to disk automatically
              try {
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                console.log("Debug: Saved snapshot to disk:", filename);
              } catch (e) {
                console.error("Debug: Failed to save snapshot to disk:", e);
              }
            } else {
              setIncidentError(`Maximum of ${MAX_SESSION_PHOTOS} photos allowed.`);
            }
            
            // Clean up temporary camera
            tempCameraStream.getTracks().forEach(track => track.stop());
            setTempCameraStream(null);
            setIsAudioPhotoTaking(false);
            
            // Resume audio recording
            if (mediaRecorderRef.current && isRecording && isRecordingPaused) {
              mediaRecorderRef.current.resume();
              setIsRecordingPaused(false);
            }
          }
        }, "image/jpeg", 0.95);
      }
    } catch (err) {
      console.error("Audio snapshot error:", err);
      setIncidentError("Failed to snap picture during audio.");
      // Recover state
      if (tempCameraStream) {
        tempCameraStream.getTracks().forEach(track => track.stop());
        setTempCameraStream(null);
      }
      setIsAudioPhotoTaking(false);
      if (mediaRecorderRef.current && isRecording && isRecordingPaused) {
        mediaRecorderRef.current.resume();
        setIsRecordingPaused(false);
      }
    }
  };

  const cancelAudioPhoto = () => {
    if (tempCameraStream) {
      tempCameraStream.getTracks().forEach(track => track.stop());
      setTempCameraStream(null);
    }
    setIsAudioPhotoTaking(false);
    if (mediaRecorderRef.current && isRecording && isRecordingPaused) {
      mediaRecorderRef.current.resume();
      setIsRecordingPaused(false);
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
    const filename = `${currentBundleIdRef.current}_snapshot_${overlayCategory}_${timestamp}.jpg`;
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
      if (status === "Uploading") {
        setUploadProgress(message || `Uploading ${file.name}...`);
      } else {
        setUploadProgress(null);
      }
      if (status === "Failed") {
        setIncidentError(message || "Upload failed");
      }
    };

    try {
      const { incidentId } = await apiUploadMediaFile(file, selectedInspectionId, onProgress, currentBundleIdRef.current);

      setSessionIncidents(prev => {
        const newIncident: SessionIncident = {
          id: newId,
          incidentId,
          fileName: file.name,
          fileType: fileType,
          uploadedAt: new Date().toLocaleString(),
          timestamp: Date.now(),
          status: "Processing",
          displayMessage: "Analysis is in progress.",
          inspectionName: activeInspection?.label || "Inspection",
          siteName: activeSite?.site_name || activeSite?.name || "Site",
          category
        };
        const updatedList = [newIncident, ...prev];
        return updatedList.slice(0, MAX_SESSION_INCIDENTS);
      });

      await pollIncidentStatus(incidentId, newId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown upload error occurred";
      setIncidentError(errorMessage);
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
    <div className="h-full w-full overflow-y-auto bg-bg dropdown-scrollbar">
      <div className="p-6 flex flex-col items-start justify-start w-full">
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
              <h4 className={`${labelHeaderStyle} flex items-center gap-2`}>
                <span className="text-base bg-blue-50 p-1.5 rounded-lg border border-blue-100/70 inline-flex items-center justify-center w-8 h-8 select-none">📌</span>
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
              <h4 className={`${labelHeaderStyle} flex items-center gap-2`}>
                <span className="text-base bg-amber-50 p-1.5 rounded-lg border border-amber-100/70 inline-flex items-center justify-center w-8 h-8 select-none">📋</span>
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
              <div className="flex justify-between items-center max-w-[644px]">
                <h3 className={labelHeaderStyle}>Recorded Incidents & Field Notes</h3>
                <button 
                  onClick={clearLocalBundles}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
                >
                  Clear Local Storage
                </button>
              </div>

              {sessionIncidents.length === 0 ? (
                <div className="text-slate-400 text-sm italic">
                  No recordings or field notes in this session yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 max-w-[644px]">
                  {[...sessionIncidents]
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
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider 
                            ${incident.status === "Uploading" ? "bg-blue-50 text-blue-600 border border-blue-200/50" :
                              incident.status === "Processing" ? "bg-amber-50 text-amber-600 border border-amber-200/50 animate-pulse" :
                                incident.status === "Completed" ? "bg-emerald-50 text-emerald-600 border border-emerald-200/50" :
                                  incident.status === "pending" ? "bg-slate-50 text-slate-600 border border-slate-200/50" :
                                    "bg-rose-50 text-rose-600 border border-rose-200/50"
                            }`}>
                            {incident.status === "Processing" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                            {incident.status}
                          </span>
                        </div>

                        {/* Row 1 : Col 3 : Show file name */}
                        <div className="col-span-1 text-left min-w-0">
                          <span className="text-sm font-bold text-slate-800 truncate block" title={incident.fileName}>
                            {incident.incidentId ? incident.incidentId : ''} - {' '}
                            {incident.fileName}
                          </span>
                        </div>

                        {/* Row 2 : Col 1 : Right-aligned icon of Incident or Field Note */}
                        <div className="col-span-1 flex justify-end items-center">
                          {incident.category === "fieldnote" || incident.category === "field_note" ? (
                            <span className="text-lg bg-amber-50 p-1.5 rounded-lg border border-amber-100/70" title="Field Note" role="img" aria-label="Field Note">📋</span>
                          ) : (
                            <span className="text-lg bg-blue-50 p-1.5 rounded-lg border border-blue-100/70" title="Incident" role="img" aria-label="Incident">📌</span>
                          )}
                        </div>

                        {/* Row 2 : Col 2 : Left-aligned icon of media type */}
                        <div className="col-span-1 flex justify-start items-center gap-2">
                          {incident.fileType && (
                            <div className={`p-2 rounded-lg border flex items-center justify-center ${incident.fileType === "audio" ? "bg-[#800000]/8 border-[#800000]/15 text-[#800000]/80" :
                              incident.fileType === "video" ? "bg-blue-50 border-blue-100 text-blue-500" :
                                "bg-emerald-50 border-emerald-100 text-emerald-500"
                              }`}>
                              {incident.fileType === "audio" && <FileAudio className="w-5 h-5" />}
                              {incident.fileType === "video" && <FileVideo className="w-5 h-5" />}
                              {incident.fileType === "image" && <FileImage className="w-5 h-5" />}
                            </div>
                          )}
                          {/* Attachment Indicator */}
                          {(incident.attachedPhotosCount || 0) > 0 && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-md border border-slate-200 text-slate-600" title={`${incident.attachedPhotosCount} attached photos`}>
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
                                className={`text-sm truncate font-semibold ${incident.status === "Failed"
                                  ? "text-rose-700"
                                  : "text-slate-700"
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
      )}

      {/* Permission Help Modal */}
      {isPermissionModalOpen && (
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
      )}
    </div>
  );
}
