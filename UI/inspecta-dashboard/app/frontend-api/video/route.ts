import { NextRequest, NextResponse } from 'next/server';
import { getUploadUrl, getInspectionUploadUrl, uploadIncident } from '@/lib/backend-client';
import fs from 'fs';
import path from 'path';
import { Readable } from 'node:stream';
import { writeFile, mkdir } from 'fs/promises';

const getMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    default: return 'application/octet-stream';
  }
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');
    const token = searchParams.get('token');

    console.log("Test : Inside Video route: " + filePath)
    if (!filePath) {
      return new Response(JSON.stringify({ error: 'File path is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- GCS File Proxy Logic ---
    if (filePath.startsWith('gs:')) {
      try {
        // 1. Get the secure, pre-signed URL from your backend UI service
        const authHeader = request.headers.get('authorization') || (token ? `Bearer ${token}` : null);
        const authHeaders = authHeader ? { Authorization: authHeader } : undefined;
        const { url: videoUrl } = await getInspectionUploadUrl(authHeaders, filePath);

        console.log("Proxying GCS Signed URL: ", videoUrl);

        // 2. Fetch the video from GCS on behalf of the client, passing through range headers for streaming
        const range = request.headers.get('range');
        let gcsResponse: Response;
        if (range) {
          console.log("Testing: Range header found: " + range);
          const proxyHeaders: HeadersInit = {};
          proxyHeaders['Range'] = range;
          gcsResponse = await fetch(videoUrl, { headers: proxyHeaders });
        } else {
          console.log("Testing : Range header not found, fetching full video");
          gcsResponse = await fetch(videoUrl);
        }
        console.log("Testing GCS Response Status: " + gcsResponse.status);

        // If GCS returned an error (e.g., 403 Forbidden), forward that error to the browser
        if (!gcsResponse.ok) {
          console.log("Testing GCS Response Body: " + gcsResponse.body);
          return new Response(gcsResponse.body, {
            status: gcsResponse.status,
            statusText: gcsResponse.statusText,
          });
        }

        // 3. Stream the GCS response back to the browser.
        const responseHeaders = new Headers();
        const headersToForward = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

        gcsResponse.headers.forEach((value, key) => {
          if (headersToForward.includes(key.toLowerCase())) {
            responseHeaders.set(key, value);
          }
        });

        // Ensure the browser tries to play the video inline instead of downloading it
        responseHeaders.set('Content-Disposition', 'inline');

        return new Response(gcsResponse.body, {
          status: gcsResponse.status,
          headers: responseHeaders,
        });

      } catch (error) {
        console.error('Error proxying GCS file:', error);
        return new Response(JSON.stringify({ error: 'Failed to proxy GCS file', details: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    console.log("Testing : Local file")

    // --- Local File Streaming Logic ---
    const finalFilePath = filePath;

    // Check if file exists
    if (!fs.existsSync(finalFilePath)) {
      console.error('File not found:', finalFilePath);
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get file stats
    const stat = fs.statSync(finalFilePath);
    const fileSize = stat.size;
    const range = request.headers.get('range');
    const contentType = getMimeType(finalFilePath);

    if (range) {
      console.log("Testing : Local Range header found: " + range);
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(finalFilePath, { start, end });

      const stream = new ReadableStream({
        start(controller) {
          file.on('data', (chunk) => controller.enqueue(chunk));
          file.on('end', () => controller.close());
          file.on('error', (err) => controller.error(err));
        },
      });

      return new Response(stream, {
        status: 206, // Partial Content
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
          'Content-Disposition': 'inline',
        },
      });
    } else {
      // Serve entire file if no range is requested
      console.log("Testing : Local file range header not found, fetching full video");
      const fileStream = fs.createReadStream(finalFilePath);
      const stream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => controller.enqueue(chunk));
          fileStream.on('end', () => controller.close());
          fileStream.on('error', (err) => controller.error(err));
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Length': fileSize.toString(),
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          'Content-Disposition': 'inline',
        },
      });
    }
  } catch (error) {
    console.error('Error serving video:', error);
    return new Response(JSON.stringify({ error: 'Failed to serve video', details: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const inspectionId = formData.get('inspectionId') as string;

    if (!file || !inspectionId) {
      return NextResponse.json({ error: 'File and inspectionId are required' }, { status: 400 });
    }
    console.log(`Uploading incident file: ${file.name} for inspectionId: ${inspectionId}`);

    // 1. Fetch signed upload URL, blob name, and storage type from backend client
    const authHeader = request.headers.get('authorization');
    const authHeaders = authHeader ? { Authorization: authHeader } : undefined;
    const { upload_url: uploadUrl, blob_name: blobName, storage_type: storageType } = await getUploadUrl(authHeaders, file.name);
    // TODO: Comment following console.log message for security reasons
    console.log(`Received Upload Path: ${uploadUrl}, Blob Name: ${blobName}, Storage Type: ${storageType}`);

    // 2. Upload file depending on storage_type
    // ToDO: Have a file size check 
    if (storageType === 'local') {
      // Local machine file path
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const dir = path.dirname(uploadUrl);
      await mkdir(dir, { recursive: true });
      await writeFile(uploadUrl, buffer);
      console.log(`Successfully saved uploaded video to local machine at: ${uploadUrl}`);
    } else if (storageType === 'gcs') {
      try {
        const gcsResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'video/mp4',
          },
          body: file,
        });

        if (!gcsResponse.ok) {
          throw new Error(`Failed to upload to GCS: ${gcsResponse.status} ${gcsResponse.statusText}`);
        }

        console.log(`Successfully uploaded video to GCS: ${blobName}`);
      } catch (err) {
        console.error("GCS Upload failed:", err);
        throw err; // Re-throw to handle it in your UI component
      }
    } else {
      throw new Error(`Unknown or unsupported storage type: ${storageType}`);
    }

    // Upload incident in the system
    let inspectorId = 1;  // To Do : This is logged in User specific; ideally this shall come from Firebase token claims
    const { incident_id: incidentId } = await uploadIncident(inspectionId, inspectorId, uploadUrl, blobName, authHeaders);
    console.log(`✅ Uploaded Incident successfully with ID : ${incidentId}`);

    return NextResponse.json({
      message: 'Video uploaded successfully',
      status: 'success',
      incidentId: incidentId,
    }, { status: 201 });

  } catch (error) {
    console.error('Error saving/uploading video:', error);
    return NextResponse.json({ error: 'Failed to upload video', details: String(error) }, { status: 500 });
  }
}