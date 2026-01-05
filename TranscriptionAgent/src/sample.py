import os
import json
import math
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pydub import AudioSegment
from groq import Groq

# --- CONFIGURATION ---
GROQ_API_KEY = "your_groq_api_key_here"
MODEL = "whisper-large-v3"
MAX_FILE_SIZE_MB = 25
OVERLAP_SEC = 5  # 5-second overlap as requested

client = Groq(api_key=GROQ_API_KEY)

def get_audio_chunks(file_path, max_size_mb=25, overlap_sec=5):
    """
    Splits audio into chunks based on file size limits.
    Estimates duration for the size limit and exports chunks with overlap.
    """
    audio = AudioSegment.from_file(file_path)
    file_size = os.path.getsize(file_path)
    duration_ms = len(audio)
    
    # Estimate ms per MB to determine chunk duration
    # We use a 10% safety margin to ensure we stay under 25MB
    ms_per_mb = duration_ms / (file_size / (1024 * 1024))
    chunk_duration_ms = int((max_size_mb * 0.9) * ms_per_mb)
    overlap_ms = overlap_sec * 1000
    
    chunks = []
    start = 0
    while start < duration_ms:
        end = min(start + chunk_duration_ms, duration_ms)
        chunk_segment = audio[start:end]
        
        # Create a named temp file for the chunk
        temp_file = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        chunk_segment.export(temp_file.name, format="mp3")
        
        chunks.append({
            "path": temp_file.name,
            "start_offset_sec": start / 1000.0
        })
        
        if end == duration_ms:
            break
        start += chunk_duration_ms - overlap_ms
        
    return chunks

def process_chunk(chunk_data, task_type, prompt):
    """Processes a single audio chunk via Groq API."""
    try:
        with open(chunk_data["path"], "rb") as file:
            if task_type == "translate":
                response = client.audio.translations.create(
                    file=(os.path.basename(chunk_data["path"]), file.read()),
                    model=MODEL,
                    prompt=prompt,
                    response_format="verbose_json"
                )
            else:
                response = client.audio.transcriptions.create(
                    file=(os.path.basename(chunk_data["path"]), file.read()),
                    model=MODEL,
                    prompt=prompt,
                    response_format="verbose_json"
                )
            
            # Convert response to dict for manipulation
            res_dict = response.to_dict()
            
            # Offset timestamps by the chunk's start time
            offset = chunk_data["start_offset_sec"]
            for segment in res_dict.get("segments", []):
                segment["start"] += offset
                segment["end"] += offset
            
            return res_dict
    finally:
        # Clean up temp chunk file
        if os.path.exists(chunk_data["path"]):
            os.remove(chunk_data["path"])

def merge_incident_results(results, overlap_sec):
    """Merges multiple chunk JSONs into one, handling overlaps."""
    if not results: return {}
    
    merged = {
        "text": "",
        "segments": [],
        "language": results[0].get("language"),
        "duration": results[-1].get("segments", [{}])[-1].get("end", 0)
    }
    
    last_end_time = 0
    for i, res in enumerate(results):
        # Only add text and segments that fall after the last processed time
        # to avoid duplication from the 5s overlap
        new_segments = []
        for seg in res.get("segments", []):
            # If this isn't the first chunk, skip segments that started 
            # within the previous chunk's overlap window
            if i > 0 and seg["start"] < (last_end_time - 0.5):
                continue
            new_segments.append(seg)
        
        if new_segments:
            merged["segments"].extend(new_segments)
            merged["text"] += " " + " ".join([s["text"] for s in new_segments])
            last_end_time = new_segments[-1]["end"]
            
    merged["text"] = merged["text"].strip()
    return merged

def process_incident(file_path, task_type):
    """Handles logic for a single incident: chunking, parallel processing, and merging."""
    # Define prompts based on task
    if task_type == "translate":
        prompt = "Translate this site inspection into professional English. Marathi and Hindi words should be translated to English."
    else:
        prompt = "Transcribe this inspection exactly as spoken. Keep original English, Hindi, and Marathi words verbatim."

    # 1. Chunk if necessary
    chunks = get_audio_chunks(file_path)
    
    # 2. Process chunks in parallel
    with ThreadPoolExecutor() as executor:
        results = list(executor.map(lambda c: process_chunk(c, task_type, prompt), chunks))
    
    # 3. Merge chunks
    return merge_incident_results(results, OVERLAP_SEC)

def run_pipeline(incident_files, mode="transcribe"):
    """
    Main entry point.
    incident_files: List of file paths
    mode: 'transcribe' or 'translate'
    """
    final_output = {"incidents": []}
    
    # Process all incidents
    for file in incident_files:
        print(f"Processing Incident: {file}...")
        incident_data = process_incident(file, mode)
        final_output["incidents"].append({
            "file_name": os.path.basename(file),
            "verbose_json": incident_data
        })
        
    return final_output

# --- EXAMPLE USAGE ---
if __name__ == "__main__":
    my_incidents = ["incident_001.mp4", "incident_002.wav"]
    
    # Example: Transcribe as-is
    transcription_result = run_pipeline(my_incidents, mode="transcribe")
    
    # Save to a single consolidated JSON
    with open("consolidated_output.json", "w") as f:
        json.dump(transcription_result, f, indent=2)
        
    print("Processing complete. Consolidated JSON saved.")