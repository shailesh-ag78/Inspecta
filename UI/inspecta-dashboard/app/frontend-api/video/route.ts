import { NextRequest, NextResponse } from 'next/server';
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
    console.log(`Uploading file: ${file.name} for inspectionId: ${inspectionId}`);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create a directory inside the workspace to store uploaded videos
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    // Save the file
    const filePath = path.join(uploadDir, file.name);
    await writeFile(filePath, buffer);

    console.log(`Successfully saved uploaded video to ${filePath}`);

    return NextResponse.json({
      status: 'success',
      filePath: filePath,
      fileName: file.name
    }, { status: 201 });

  } catch (error) {
    console.error('Error saving uploaded video:', error);
    return NextResponse.json({ error: 'Failed to upload video', details: String(error) }, { status: 500 });
  }
}