import os
import math
import tempfile
import shutil
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any
from pydub import AudioSegment
from groq import Groq

# Constants
MODEL = "whisper-large-v3"
MAX_FILE_SIZE_MB = 25
OVERLAP_SEC = 5

class GroqService:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("GROQ_API_KEY")
        if not self.api_key:
             # Fallback for local testing if env not set, though not recommended for prod
             print("Warning: GROQ_API_KEY not set.")
        self.client = Groq(api_key=self.api_key)

    def get_audio_chunks(self, file_path: str, max_size_mb: int = 25, overlap_sec: int = 5) -> List[Dict[str, Any]]:
        """
        Splits audio into chunks based on file size limits.
        """
        try:
            audio = AudioSegment.from_file(file_path)
        except Exception as e:
            raise RuntimeError(f"Failed to load audio file {file_path}. Is ffmpeg installed? Error: {e}")

        file_size = os.path.getsize(file_path)
        duration_ms = len(audio)
        
        # If file is small enough, return as single chunk
        if file_size < (max_size_mb * 1024 * 1024):
            return [{"path": file_path, "start_offset_sec": 0, "is_temp": False}]

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
            # Suffix determines format, pydub handles export
            temp_file = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
            temp_file.close() # Close so we can write to it via pydub
            
            chunk_segment.export(temp_file.name, format="mp3")
            
            chunks.append({
                "path": temp_file.name,
                "start_offset_sec": start / 1000.0,
                "is_temp": True
            })
            
            if end == duration_ms:
                break
            start += chunk_duration_ms - overlap_ms
            
        return chunks

    def process_chunk(self, chunk_data: Dict[str, Any], task_type: str, prompt: str) -> Dict[str, Any]:
        """Processes a single audio chunk via Groq API."""
        try:
            with open(chunk_data["path"], "rb") as file:
                if task_type == "translate":
                    response = self.client.audio.translations.create(
                        file=(os.path.basename(chunk_data["path"]), file.read()),
                        model=MODEL,
                        prompt=prompt,
                        response_format="verbose_json"
                    )
                else:
                    response = self.client.audio.transcriptions.create(
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
        except Exception as e:
            print(f"Error processing chunk {chunk_data['path']}: {e}")
            return {"segments": [], "text": "", "error": str(e)}
        finally:
            # Clean up temp chunk file if it was created during chunking
            if chunk_data.get("is_temp") and os.path.exists(chunk_data["path"]):
                os.remove(chunk_data["path"])

    def merge_incident_results(self, results: List[Dict[str, Any]], overlap_sec: int) -> Dict[str, Any]:
        """Merges multiple chunk JSONs into one, handling overlaps."""
        if not results: return {}
        
        merged = {
            "text": "",
            "segments": [],
            "language": results[0].get("language", "en"),
            "duration": 0
        }
        
        # Calculate total duration from last segment of last result
        if results and results[-1].get("segments"):
             merged["duration"] = results[-1]["segments"][-1]["end"]

        last_end_time = 0
        for i, res in enumerate(results):
            # Only add text and segments that fall after the last processed time
            # to avoid duplication from the 5s overlap
            new_segments = []
            for seg in res.get("segments", []):
                # If this isn't the first chunk, skip segments that started 
                # within the previous chunk's overlap window
                # We use a small buffer (0.5s) to avoid cutting words
                if i > 0 and seg["start"] < (last_end_time - 0.5):
                    continue
                new_segments.append(seg)
            
            if new_segments:
                merged["segments"].extend(new_segments)
                # Naive text concat; for better results, reconstruction from segments is ideal
                # but appending filtered segments text is safer than raw text concat
                chunk_new_text = " ".join([s["text"] for s in new_segments])
                merged["text"] += " " + chunk_new_text
                last_end_time = new_segments[-1]["end"]
                
        merged["text"] = merged["text"].strip()
        return merged

    def process_incident(self, file_path: str, task_type: str) -> Dict[str, Any]:
        """Handles logic for a single incident: chunking, parallel processing, and merging."""
        # Define prompts based on task
        if task_type == "translate":
            prompt = "Translate this site inspection into professional English. Marathi and Hindi words should be translated to English."
        else:
            prompt = "Transcribe this inspection exactly as spoken. Keep original English, Hindi, and Marathi words verbatim."

        # 1. Chunk if necessary
        chunks = self.get_audio_chunks(file_path, max_size_mb=MAX_FILE_SIZE_MB, overlap_sec=OVERLAP_SEC)
        
        # 2. Process chunks in parallel
        # Use ThreadPoolExecutor for I/O bound API calls
        with ThreadPoolExecutor() as executor:
            # map maintains order
            results = list(executor.map(lambda c: self.process_chunk(c, task_type, prompt), chunks))
        
        # 3. Merge chunks
        return self.merge_incident_results(results, OVERLAP_SEC)
