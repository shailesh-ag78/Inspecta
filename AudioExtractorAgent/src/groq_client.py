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

class GroqClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("GROQ_API_KEY")
        if not self.api_key:
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
            temp_file.close() 
            
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

    def process_chunk(self, chunk_data: Dict[str, Any], prompt: str) -> Dict[str, Any]:
        """Processes a single audio chunk via Groq API."""
        try:
            with open(chunk_data["path"], "rb") as file:
                response = self.client.audio.transcriptions.create(
                    file=(os.path.basename(chunk_data["path"]), file.read()),
                    model=MODEL,
                    prompt=prompt,
                    response_format="verbose_json"
                )
                
                res_dict = response.to_dict()
                
                offset = chunk_data["start_offset_sec"]
                for segment in res_dict.get("segments", []):
                    segment["start"] += offset
                    segment["end"] += offset
                
                return res_dict
        except Exception as e:
            print(f"Error processing chunk {chunk_data['path']}: {e}")
            return {"segments": [], "text": "", "error": str(e)}
        finally:
            if chunk_data.get("is_temp") and os.path.exists(chunk_data["path"]):
                os.remove(chunk_data["path"])

    def merge_results(self, results: List[Dict[str, Any]], overlap_sec: int) -> Dict[str, Any]:
        """Merges multiple chunk JSONs into one, handling overlaps."""
        if not results: return {}
        
        merged = {
            "text": "",
            "segments": [],
            "language": results[0].get("language", "en"),
            "duration": 0
        }
        
        if results and results[-1].get("segments"):
             merged["duration"] = results[-1]["segments"][-1]["end"]

        last_end_time = 0
        for i, res in enumerate(results):
            new_segments = []
            for seg in res.get("segments", []):
                if i > 0 and seg["start"] < (last_end_time - 0.5):
                    continue
                new_segments.append(seg)
            
            if new_segments:
                merged["segments"].extend(new_segments)
                chunk_new_text = " ".join([s["text"] for s in new_segments])
                merged["text"] += " " + chunk_new_text
                last_end_time = new_segments[-1]["end"]
                
        merged["text"] = merged["text"].strip()
        return merged

    def transcribe(self, file_path: str) -> Dict[str, Any]:
        """
        Transcribes the audio file.
        """
        prompt = "Transcribe this incident exactly as spoken. Keep original English, Hindi, and Marathi words verbatim."

        # 1. Chunk if necessary
        chunks = self.get_audio_chunks(file_path, max_size_mb=MAX_FILE_SIZE_MB, overlap_sec=OVERLAP_SEC)
        
        # 2. Process chunks in parallel
        with ThreadPoolExecutor() as executor:
            results = list(executor.map(lambda c: self.process_chunk(c, prompt), chunks))
        
        # 3. Merge chunks
        return self.merge_results(results, OVERLAP_SEC)
