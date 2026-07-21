import sys
import os
import requests
import json

# Ensure project root directory is in sys.path so imports work smoothly when running/debugging test_app.py directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.main import transcript_extraction

def main():
    # Example usage of the transcript_extraction function
    audio_url_path = r"G:\code\Inspecta\data\test_data\test_videos\test_audio.mp3"
    transcibe_file_path = r"G:\code\Inspecta\data\test_data\test_videos\test_audio_transcribe.json"
    metadata = {
        "company_name": "Test Company",
        "industry": "interior",
        "input_prompt": [
            "granite",
            "bathroom",
            "kitchen",
            "plywood",
            "electric point",
            "paint",
            "pop",
            "curtain",
            "wall cladding",
            "false ceiling",
            "handle",
            "door",
            "window",
            "flooring",
            "wallpaper",
            "tile",
            "cabinet",
            "countertop",
            "lighting",
            "sofa",
            "chair",
            "bedsheet"
        ]
    }
    try:
        transcript_text = transcript_extraction(audio_url_path, transcibe_file_path, metadata)
        print("----------------------------------")
        print("Transcript Text:", transcript_text)
    except Exception as e:
        print(f"Error during transcription: {e}")
 
if __name__ == "__main__":
    main()
