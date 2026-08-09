import React, { useState } from "react";
import { Camera, X, Loader2, Maximize2 } from "lucide-react";
import { authenticatedFetch } from "@/lib/api";

interface IncidentImage {
  url: string;
  timestamp_sec?: number;
}

interface IncidentImagesProps {
  images: any; // Can be JSON string, array of objects, or array of strings
  onRemoveImage?: (imgUrl: string) => void;
}

export function IncidentImages({ images, onRemoveImage }: IncidentImagesProps) {
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

  // Normalize image data to an array of objects
  const parsedImages = React.useMemo<IncidentImage[]>(() => {
    if (!images) return [];
    let rawList: any[] = [];
    if (typeof images === "string") {
      try {
        rawList = JSON.parse(images);
      } catch (_) {
        return [];
      }
    } else if (Array.isArray(images)) {
      rawList = images;
    } else {
      return [];
    }

    return rawList.map((item) => {
      if (typeof item === "string") {
        return { url: item };
      }
      return {
        url: item.url || item.file_url || "",
        timestamp_sec: item.timestamp_sec,
      };
    }).filter((img) => img.url);
  }, [images]);

  if (parsedImages.length === 0) return null;

  const handleResolveImage = async (imgUrl: string) => {
    if (resolvedUrls[imgUrl] || loadingStates[imgUrl]) return;

    setLoadingStates((prev) => ({ ...prev, [imgUrl]: true }));

    try {
      if (
        imgUrl.startsWith("http://") ||
        imgUrl.startsWith("https://") ||
        imgUrl.startsWith("data:")
      ) {
        setResolvedUrls((prev) => ({ ...prev, [imgUrl]: imgUrl }));
      } else {
        // Fetch signed or stream proxy URL from backend
        const response = await authenticatedFetch(
          `/api/get-video-url?path=${encodeURIComponent(imgUrl)}`
        );
        if (!response.ok) throw new Error("Failed to get signed/stream URL");
        const json = await response.json();
        const url = json.data?.url;
        if (url) {
          setResolvedUrls((prev) => ({ ...prev, [imgUrl]: url }));
        } else {
          throw new Error("No URL returned");
        }
      }
    } catch (err) {
      console.error("Failed to load image:", err);
    } finally {
      setLoadingStates((prev) => ({ ...prev, [imgUrl]: false }));
    }
  };

  return (
    <>
      {/* Grid for mobile (2 columns), flex-wrap for larger viewports */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full">
        {parsedImages.map((img, i) => {
          const isLoading = loadingStates[img.url];
          const resolved = resolvedUrls[img.url];

          return (
            <div
              key={i}
              className="group relative border border-slate-200 bg-slate-100 rounded-lg flex items-center justify-center shadow-inner flex-shrink-0 overflow-hidden transition-all duration-200"
              style={{ width: "135px", height: "90px" }}
            >
              {isLoading ? (
                // Spinner inside the tile box while loading
                <div className="flex items-center justify-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : resolved ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolved}
                    alt="Attachment"
                    className="w-full h-full object-cover animate-fadeIn"
                  />
                  {/* Hover Overlay with Maximize icon only */}
                  <div
                    onClick={() => setActiveImage(resolved)}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200 cursor-pointer"
                    title="Maximize Image"
                  >
                    <Maximize2 className="w-5 h-5 text-white drop-shadow" />
                  </div>
                </>
              ) : (
                // Initial Placeholder Tile State
                <div
                  onClick={() => handleResolveImage(img.url)}
                  className="w-full h-full flex items-center justify-center text-slate-400 hover:bg-slate-200/50 cursor-pointer transition-colors"
                  title="Click to load image"
                >
                  <Camera className="w-5 h-5 text-slate-400 group-hover:scale-110 transition-transform duration-200" />
                </div>
              )}

              {/* Fixed Delete Button at Top-Right (visible for both resolved & placeholder states) */}
              {onRemoveImage && !isLoading && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveImage(img.url);
                  }}
                  className="absolute top-1 right-1 p-0.5 bg-rose-650 hover:bg-rose-700 text-white rounded-full z-10 transition-colors shadow-sm cursor-pointer"
                  title="Delete Image Attachment"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox Modal */}
      {activeImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fadeIn">
          {/* Close Area */}
          <div className="absolute inset-0" onClick={() => setActiveImage(null)} />

          <div className="relative max-w-[90vw] max-h-[85vh] z-10 flex flex-col items-center gap-4">
            {/* Image display */}
            <div className="relative min-w-[280px] min-h-[200px] flex items-center justify-center bg-slate-900 rounded-lg overflow-hidden border border-white/10 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeImage}
                alt="Attachment"
                className="max-w-[85vw] max-h-[75vh] object-contain rounded"
              />
            </div>

            {/* Bottom Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveImage(null)}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-full text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Close
              </button>
            </div>

            {/* Top Close Button (Desktop Only) */}
            <button
              onClick={() => setActiveImage(null)}
              className="absolute -top-10 -right-2 p-1 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors hidden sm:block cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
