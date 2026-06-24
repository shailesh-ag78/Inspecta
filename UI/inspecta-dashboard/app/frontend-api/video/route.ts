import { NextRequest, NextResponse } from 'next/server';
import { getUploadUrl, uploadIncident } from '@/lib/backend-client';
import fs from 'fs';
import path from 'path';
import { Readable } from 'node:stream';
import { writeFile, mkdir } from 'fs/promises';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');

    console.log('Received request for video with path:', filePath);

    if (!filePath) {
      return new Response(JSON.stringify({ error: 'File path is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Security check: ensure the file path is within allowed directories
    // const allowedBasePaths = [
    //   'g:\\code\\Inspecta\\DataStore', // Adjust based on your actual data directory
    //   'G:\\code\\Inspecta\\DataStore',
    //   'C:\\code\\Inspecta\\DataStore',
    //   // Add other allowed paths
    // ];

    // const isAllowed = allowedBasePaths.some(basePath =>
    //   filePath.startsWith(basePath)
    // );

    // if (!isAllowed) {
    //   return new Response(JSON.stringify({ error: 'Access denied' }), {
    //     status: 403,
    //     headers: { 'Content-Type': 'application/json' },
    //   });
    // }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get file stats
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = request.headers.get('range');
    //const contentType = getMimeType(filePath); // ✅ Dynamic MIME type

    if (range) {
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });

      const stream = new ReadableStream({
        start(controller) {
          file.on('data', (chunk) => controller.enqueue(chunk));
          file.on('end', () => controller.close());
          file.on('error', (err) => controller.error(err));
        },
      });
      console.log(`Serving video range: ${start}-${end} of ${fileSize} bytes`);

      return new Response(stream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': 'video/mp4', // Adjust based on actual file type
          'Cache-Control': 'no-cache',
          'Content-Disposition': 'inline',   // ✅ Forces browser to display, not download
        },
      });
    } else {
      // Serve entire file
      const file = fs.createReadStream(filePath);
      const stream = new ReadableStream({
        start(controller) {
          file.on('data', (chunk) => controller.enqueue(chunk));
          file.on('end', () => controller.close());
          file.on('error', (err) => controller.error(err));
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Length': fileSize.toString(),
          'Content-Type': 'video/mp4', // Adjust based on actual file type
          'Accept-Ranges': 'bytes',          // ✅ Critical fix — was missing!
          'Cache-Control': 'no-cache',
          'Content-Disposition': 'inline',   // ✅ Forces browser to display, not download
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
    const { upload_url: uploadUrl, blob_name: blobName, storage_type: storageType } = await getUploadUrl(authHeaders);
    // TODO: Comment following console.log message for security reasons
    console.log(`Received Upload Path: ${uploadUrl}, Blob Name: ${blobName}, Storage Type: ${storageType}`);

    // 2. Upload file depending on storage_type
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