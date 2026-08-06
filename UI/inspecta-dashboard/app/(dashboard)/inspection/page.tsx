"use client";

import React, { useState, useEffect, useRef } from "react";
import { useDashboard } from "@/lib/context";
import { Loader2, AlertCircle } from "lucide-react";
import { authenticatedFetch, uploadFileToStorage, registerIncident } from "@/lib/api";
import { saveBundleToIdb, AttachedMedia, IncidentBundle } from "@/lib/idb";

// Import Refactored Components
import { RecordingOverlay } from "@/components/RecordingOverlay";
import { IncidentsUploadList, IncidentUpload } from "@/components/IncidentsUploadList";
import { ActionOptions } from "@/components/ActionOptions";
import { InspectionSelector } from "@/components/InspectionSelector";
import { PermissionHelpModal } from "@/components/PermissionHelpModal";

const MAX_INCIDENT_UPLOADS = 5; // Limit the number of incidents in the session queue
const MAX_SESSION_PHOTOS = 5; // Limit max photos attached per recording
const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds

// Interface moved to components/IncidentsUploadList.tsx

export default function InspectionPage() {
  const {
    backendSites,
    siteInspections,
    handleAddInspectionSubmit,
    fetchSiteInspections,
    incidentUploads,
    setIncidentUploads,
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
  const currentSessionPhotosRef = useRef<AttachedMedia[]>([]);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const tempCameraStreamRef = useRef<MediaStream | null>(null);

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

  // Keep refs in sync with state for unmount cleanup
  useEffect(() => {
    cameraStreamRef.current = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    tempCameraStreamRef.current = tempCameraStream;
  }, [tempCameraStream]);

  // Stop streams on unmount to prevent camera/microphone resource leaks
  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (tempCameraStreamRef.current) {
        tempCameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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
    currentSessionPhotosRef.current = [];
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
    setCurrentSessionPhotos([]);
    currentSessionPhotosRef.current = [];
    currentBundleIdRef.current = `bundle_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

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
        const filename = `${currentBundleIdRef.current}_${overlayCategory}_${timestamp}.${fileExtension}`;

        const bundleId = currentBundleIdRef.current;

        // Capture current photos before state reset in cleanUpMedia
        const attached = [...currentSessionPhotosRef.current];
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
        const primarySizeKB = Math.round(blob.size / 1024);
        const attachedSizesKB = attached.map(media => Math.round(media.blob.size / 1024));

        setIncidentUploads(prev => [{
          id: bundleId,
          fileName: filename,
          fileType: pType,
          uploadedAt: new Date().toLocaleTimeString(),
          status: "Uploading",
          inspectionName: activeInspection?.label || "Unknown Inspection",
          siteName: activeSite?.site_name || "Unknown Site",
          category: overlayCategory,
          attachedPhotosCount: attached.length,
          displayMessage: "Uploading...",
          primarySizeKB,
          attachedSizesKB
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
            const newPhoto = { blob, filename, type: "image" as const };
            setCurrentSessionPhotos(prev => [...prev, newPhoto]);
            currentSessionPhotosRef.current.push(newPhoto);
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
              const newPhoto = { blob, filename, type: "image" as const };
              setCurrentSessionPhotos(prev => [...prev, newPhoto]);
              currentSessionPhotosRef.current.push(newPhoto);
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

    const primarySizeKB = Math.round(file.size / 1024);

    // Immediately add to UI Queue with Uploading status
    setIncidentUploads(prev => [{
      id: newId,
      fileName: file.name,
      fileType: fileType,
      uploadedAt: new Date().toLocaleTimeString(),
      timestamp: Date.now(),
      status: "Uploading",
      inspectionName: activeInspection?.label || "Unknown Inspection",
      siteName: activeSite?.site_name || "Unknown Site",
      category,
      displayMessage: `Uploading ${fileType}...`,
      primarySizeKB
    }, ...prev].slice(0, MAX_INCIDENT_UPLOADS));

    const onProgress = (status: "Uploading" | "Processing" | "Completed" | "Failed", message?: string) => {
      if (status === "Uploading") {
        setUploadProgress(message || `Uploading ${file.name}...`);
        setIncidentUploads(prev => prev.map(inc => inc.id === newId ? { ...inc, status: "Uploading", displayMessage: message || `Uploading ${fileType}...` } : inc));
      } else {
        setUploadProgress(null);
      }
      if (status === "Failed") {
        setIncidentError(message || "Upload failed");
        setIncidentUploads(prev => prev.map(inc => inc.id === newId ? { ...inc, status: "Failed", displayMessage: message || "Upload failed." } : inc));
      }
    };

    try {
      const { uploadUrl, blobName } = await uploadFileToStorage(file, onProgress);
      setUploadProgress(null);
      const { incidentId } = await registerIncident(selectedInspectionId, uploadUrl, [], blobName, []);

      setIncidentUploads(prev => prev.map(inc => inc.id === newId ? {
        ...inc,
        incidentId,
        status: "Processing",
        displayMessage: "Analysis is in progress."
      } : inc));

      await pollIncidentStatus(incidentId, newId);
    } catch (error) {
      setUploadProgress(null);
      const errorMessage = error instanceof Error ? error.message : "An unknown upload error occurred";
      setIncidentError(errorMessage);
      console.error("Incident upload failed:", error);
      setIncidentUploads(prev => prev.map(inc => inc.id === newId ? {
        ...inc,
        status: "Failed",
        displayMessage: errorMessage
      } : inc));
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

  return (
    <div className="h-full w-full overflow-y-auto bg-bg dropdown-scrollbar">
      <div className="p-6 flex flex-col items-start justify-start w-full">
        <div className="w-full bg-pane-bg/98 rounded-2xl border border-slate-200/70 shadow-md overflow-hidden flex flex-col">

          {/* Configuration Body Content */}
          <div className="p-5 flex flex-col gap-6">

            <InspectionSelector
              backendSites={backendSites}
              selectedSiteId={selectedSiteId}
              setSelectedSiteId={setSelectedSiteId}
              filteredInspections={filteredInspections}
              selectedInspectionId={selectedInspectionId}
              setSelectedInspectionId={setSelectedInspectionId}
              isSiteDisabled={isSiteDisabled}
              isAddingInspectionInline={isAddingInspectionInline}
              setIsAddingInspectionInline={setIsAddingInspectionInline}
              newInspectionTitle={newInspectionTitle}
              setNewInspectionTitle={setNewInspectionTitle}
              newInspectionDescription={newInspectionDescription}
              setNewInspectionDescription={setNewInspectionDescription}
              isCreatingInspection={isCreatingInspection}
              handleCreateInspection={handleCreateInspection}
              inspectionError={inspectionError}
              formatDate={formatDate}
            />

            <ActionOptions
              isSiteDisabled={isSiteDisabled}
              openRecordingOverlay={openRecordingOverlay}
              triggerFileUpload={triggerFileUpload}
            />

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

            <IncidentsUploadList
              incidentUploads={incidentUploads}
              clearLocalBundles={clearLocalBundles}
            />

          </div>
        </div>
      </div>

      <RecordingOverlay
        activeOverlay={activeOverlay}
        overlayCategory={overlayCategory}
        cleanUpMedia={cleanUpMedia}
        videoRef={videoRef}
        tempVideoRef={tempVideoRef}
        photoPreview={photoPreview}
        isAudioPhotoTaking={isAudioPhotoTaking}
        isRecording={isRecording}
        isRecordingPaused={isRecordingPaused}
        recordDuration={recordDuration}
        formatTimer={formatTimer}
        startRecording={startRecording}
        stopRecording={stopRecording}
        snapSilentPhoto={snapSilentPhoto}
        startAudioPhotoWorkflow={startAudioPhotoWorkflow}
        captureAudioPhoto={captureAudioPhoto}
        cancelAudioPhoto={cancelAudioPhoto}
        snapPhoto={snapPhoto}
        uploadPhoto={uploadPhoto}
        setPhotoBlob={setPhotoBlob}
        setPhotoPreview={setPhotoPreview}
      />

      <PermissionHelpModal
        isPermissionModalOpen={isPermissionModalOpen}
        setIsPermissionModalOpen={setIsPermissionModalOpen}
      />
    </div>
  );
}
