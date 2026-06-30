"use client";

import React, { useState, useEffect, forwardRef } from 'react';
import ReactPlayer from 'react-player';

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

            if (filePath) {
                // Construct the URL to our backend streaming endpoint.
                // This endpoint will handle serving local files or redirecting to GCS.
                const url = new URL('/frontend-api/video', window.location.origin);
                url.searchParams.set('path', filePath);
                if (token) {
                    url.searchParams.set('token', token);
                }
                setMediaUrl(url.toString());
            } else {
                setMediaUrl('');
            }
        }, [filePath, token]);

        // Render a placeholder or nothing on the server
        if (!isClient) {
            return null;
        }

        const wrapperStyle: React.CSSProperties = isAudio
            ? {}
            : { position: 'relative', paddingTop: '56.25%' /* 16:9 aspect ratio */ };

        const playerStyle: React.CSSProperties = isAudio
            ? { width: '100%', height: '50px' }
            : { position: 'absolute', top: 0, left: 0 };

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