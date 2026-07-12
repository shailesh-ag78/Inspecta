"use client";

import React, { useState, useEffect, forwardRef } from 'react';
import ReactPlayer from 'react-player';
import { BACKEND_URL } from '@/lib/api';

interface VideoPlayerProps {
    /**
     * The path to the video file. Can be a local path or a gs:// GCS path.
     */
    filePath?: string;
    /**
     * Optional JWT token for authenticated GCS URLs.
     */
    token?: string;
    /**
     * Is the current media an audio file?
     */
    isAudio?: boolean;
    [key: string]: any; // Allow other ReactPlayer props to be passed through
}

/**
 * A client-side rendered video player that supports both local file paths
 * and GCS pre-signed URLs by routing requests through the Next.js API.
 * It handles both video and audio files and forwards the ref for external controls.
 */
const VideoPlayer = forwardRef<any, VideoPlayerProps>(
    ({ filePath, token, isAudio = false, ...props }, ref) => {
        const [isClient, setIsClient] = useState(false);
        const [mediaUrl, setMediaUrl] = useState('');

        useEffect(() => {
            // ReactPlayer needs to run on the client side.
            setIsClient(true);

            let cancelled = false;

            const resolveMediaUrl = async () => {
                if (!filePath) {
                    setMediaUrl('');
                    return;
                }

                // Direct http(s) URLs play as-is.
                if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                    setMediaUrl(filePath);
                    return;
                }

                // gs:// (or local dev) paths: ask the backend for a signed URL
                // and point the player straight at it.
                try {
                    const url = new URL(`${BACKEND_URL}/api/get-video-url`);
                    url.searchParams.set('path', filePath);
                    const headers: Record<string, string> = {};
                    if (token) headers['Authorization'] = `Bearer ${token}`;

                    const resp = await fetch(url.toString(), { headers });
                    if (!resp.ok) throw new Error(`get-video-url failed: ${resp.status}`);
                    const json = await resp.json();
                    const signedUrl = json?.data?.url;
                    if (!cancelled && signedUrl) {
                        setMediaUrl(signedUrl);
                    }
                } catch (err) {
                    console.error('Failed to resolve media URL:', err);
                    if (!cancelled) setMediaUrl('');
                }
            };

            resolveMediaUrl();

            return () => {
                cancelled = true;
            };
        }, [filePath, token]);

        const wrapperStyle: React.CSSProperties = isAudio
            ? {}
            : { position: 'relative', paddingTop: '56.25%' /* 16:9 aspect ratio */ };

        const playerStyle: React.CSSProperties = isAudio
            ? { width: '100%', height: '50px' }
            : { position: 'absolute', top: 0, left: 0 };

        // Don't mount the player on the server, or before the media URL has
        // resolved — passing an empty src makes the browser refetch the page.
        if (!isClient || !mediaUrl) {
            return (
                <div className="player-wrapper" style={wrapperStyle}>
                    {!isAudio && (
                        <div
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                            className="flex items-center justify-center text-slate-600 text-xs uppercase tracking-widest"
                        >
                            Loading evidence…
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="player-wrapper" style={wrapperStyle}>
                <ReactPlayer
                    ref={ref}
                    className="react-player"
                    src={mediaUrl}
                    width="100%"
                    height="100%"
                    controls={true}
                    style={playerStyle}
                    {...props}
                />
            </div>
        );
    }
);

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;