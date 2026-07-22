import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any
from urllib import response
from pathlib import Path
import dotenv
from pydub import AudioSegment
from groq import Groq
from openai import OpenAI
from datetime import datetime

# Constants
MODEL = "whisper-large-v3"

MAX_FILE_SIZE_MB = 25
OVERLAP_SEC = 5

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
dotenv.load_dotenv(dotenv_path=env_path)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
TRANSLATION_MODEL = os.getenv("TRANSLATION_MODEL", "qwen/qwen-2.5-7b-instruct")

class GroqService:
    def __init__(self):
        self.api_key = GROQ_API_KEY
        if not self.api_key:
            msg = f"GROQ_API_KEY is missing from the environment/ .env file. Please set it before running the service. Looked for .env at: {env_path}"
            raise ValueError(msg)
        self.client = Groq(api_key=GROQ_API_KEY)

        self.translation_api_key = OPENROUTER_API_KEY
        if not self.translation_api_key:
            msg = f"OPENROUTER_API_KEY is missing from the environment/ .env file. Please set it before running the service. Looked for .env at: {env_path}"
            raise ValueError(msg)
        self.openrouter_client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENROUTER_API_KEY,
        )

    def generate_translation_prompt(self, metadata: dict):
        prompt_header = (
            "You are an expert technical translator of company {metadata['company_name']} specializing in Indian field inspections in industry {metadata['industry']}. "
            "The input is a raw audio transcript that may contain code-switched phrases in English and other Inidan languages like Hindi or Marathi or other languages.\n"
            "Your job is to translate the inputted audio transcript into standard, professional site-inspection English."
        )
            
        prompt_footer = (
            "RULES:\n"
            "1. ALWAYS use the mapped glossary terms above when the concept appears in the raw text."
            "2. Translate any remaining non-English verbs/phrases into clear, professional site-inspection English."
            "3. Do NOT modify correct English technical terms."
            "4. Output ONLY the final translated English text without preamble, notes, or conversational fluff."
        )

        # 2. Handle the Dynamic Keywords with Truncation
        ALLOWED_PROMPT_LENGTH = 2048  # Adjust based on model limits and expected system prompt size
        available_space = ALLOWED_PROMPT_LENGTH - len(prompt_header) - len(prompt_footer) - 25 # 25 for the label
        
        # Truncate the input_prompt to fit the remaining space
        safe_keywords = metadata.get('input_prompt', '')[:available_space]
        
        # 3. Combine using f-string
        final_prompt = f"{prompt_header}\nDOMAIN GLOSSARY: {safe_keywords}\n{prompt_footer}"
        
        return final_prompt

    def process_incident_audio(self, audio_url_path: str, metadata: dict) -> Dict[str, Any]:
        """Main method to process an incident audio file. Handles chunking, processing, and merging."""
        print(f"{datetime.now()} Processing audio from URL: {audio_url_path}")
        
        try:
            # Open the file from the local path
            prompt=""
            with open(audio_url_path, "rb") as audio_file:
                # Call Groq Transcription (Whisper Large V3 Turbo) : 
                transcription = self.client.audio.translations.create(
                    file=(os.path.basename(audio_url_path), audio_file.read()),
                    model=MODEL,
                    prompt=prompt,
                    temperature=0.0,  # Set to 0 for deterministic output; adjust if you want more creativity
                    response_format="verbose_json" # verbose_json gives you timestamps if needed
                )
                
                # transcription = self.client.audio.transcriptions.create(
                #     file=(os.path.basename(audio_url_path), audio_file.read()),
                #     model=MODEL,
                #     prompt=prompt,
                #     temperature=0,  # Set to 0 for deterministic output; adjust if you want more creativity
                #     response_format="verbose_json" # verbose_json gives you timestamps if needed
                # )
        except FileNotFoundError:
            raise FileNotFoundError(f"Error: The file at {audio_url_path} was not found.")
        except Exception as e:
            raise RuntimeError(f"An unexpected error occurred: {str(e)}")
        
        data = transcription.model_dump()  # Convert to dict to avoid "Object not iterable" errors
        prompt=self.generate_translation_prompt(metadata)

        structured_segments = [
            {
            "start": round(seg['start'], 3),
            "end": round(seg['end'], 3),
            "text": seg['text'].strip()
            }
            for seg in data.get('segments', [])
        ]
        
        combine_segments = self.combine_adjacent_segments(structured_segments)

        trasnlated_segments = [
            {
            "start": seg['start'],
            "end": seg['end'],
            "text": self.translate_text_to_english_llm(seg['text'].strip(), prompt)
            }
            for seg in combine_segments
        ]

        transcript_dict = {
            "text": data.get("text", ""), # Passing o/p text of Groq
            "segments": trasnlated_segments  #structured_segments
        }
        #transcript_dict["segments"] = self.combine_adjacent_segments(transcript_dict["segments"])
        

        return transcript_dict

    def translate_text_to_english_llm(self,raw_text, prompt:str):
        """`
        Translate the mixed transcript into standard, professional site-inspection English.
        """        
        response = self.openrouter_client.chat.completions.create(
            model=TRANSLATION_MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"Raw Transcript:\n\"{raw_text}\""}
            ],
            temperature=0.0
        )
        
        return response.choices[0].message.content.strip()

# Sample dictionary output of the process_incident_audio method
#     {
#   "text": "Hello, this is an inspection at Site A. We found a crack in the pipe.",
#   "segments": [
#     {
#       "start": 0.000,
#       "end": 3.450,
#       "text": "Hello, this is an inspection at Site A."
#     },
#     {
#       "start": 3.450,
#       "end": 7.200,
#       "text": "We found a crack in the pipe."
#     }
#   ]
# }
    
# Sample json output of Groq API
#         {
# "task": "transcribe",
# "language": "english",
# "duration": 7.50,
# "text": "Hello everyone. This is a safety inspection report for Site A. We have identified a small leak in the pressure valve.",
# "segments": [
#     {
#     "id": 0,
#     "seek": 0,
#     "start": 0.0,
#     "end": 2.5,
#     "text": " Hello everyone. This is a safety inspection report for Site A.",
#     "tokens": [50364, 2425, 2300, 13, 639, 307, 257, 4510, 10561, 2213, 329, 3957, 311, 13, 50489],
#     "temperature": 0.0,
#     "avg_logprob": -0.15,
#     "compression_ratio": 1.2,
#     "no_speech_prob": 0.01
#     },
#     {
#     "id": 1,
#     "seek": 250,
#     "start": 2.5,
#     "end": 7.5,
#     "text": " We have identified a small leak in the pressure valve.",
#     "tokens": [50489, 492, 362, 7432, 257, 1402, 10301, 294, 264, 3277, 18567, 13, 50739],
#     "temperature": 0.0,
#     "avg_logprob": -0.12,
#     "compression_ratio": 1.1,
#     "no_speech_prob": 0.02
#     }
# ]
# }
        
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
        
        # Combine adjacent segments where end of one equals start of next
        merged["segments"] = self.combine_adjacent_segments(merged["segments"])
        
        return merged

    def combine_adjacent_segments(self, segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Combines segments where the end time of one segment equals the start time of the next.
        This handles cases where a word or phrase was split across segment boundaries.
        """
        if not segments or len(segments) <= 1:
            return segments
        
        combined = []
        current_segment = segments[0].copy()
        
        for i in range(1, len(segments)):
            next_segment = segments[i]
            
            # Check if current segment's end matches next segment's start
            # Use small tolerance for floating point comparison
            if abs(current_segment["end"] - next_segment["start"]) < 0.01:
                # Combine segments
                current_segment["end"] = next_segment["end"]
                current_segment["text"] += " " + next_segment["text"]
            else:
                # No match, add current to combined and move to next
                combined.append(current_segment)
                current_segment = next_segment.copy()
        
        # Don't forget to add the last segment
        combined.append(current_segment)
        return combined

    def process_incident(self, file_path: str, task_type: str) -> Dict[str, Any]:
        """Handles logic for a single incident: chunking, parallel processing, and merging."""
        # Define prompts based on task
        if task_type == "translate":
            prompt = "Translate this site incident into professional English. Marathi and Hindi words should be translated to English."
        else:
            prompt = "Transcribe this incident exactly as spoken. Keep original English, Hindi, and Marathi words verbatim."

        # 1. Chunk if necessary
        chunks = self.get_audio_chunks(file_path, max_size_mb=MAX_FILE_SIZE_MB, overlap_sec=OVERLAP_SEC)
        
        # 2. Process chunks in parallel
        # Use ThreadPoolExecutor for I/O bound API calls
        with ThreadPoolExecutor() as executor:
            # map maintains order
            results = list(executor.map(lambda c: self.process_chunk(c, task_type, prompt), chunks))
        
        # 3. Merge chunks
        return self.merge_incident_results(results, OVERLAP_SEC)