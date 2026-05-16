import sys
import os
import requests
import json

from src.main import transcript_extraction

def main():
    # Example usage of the transcript_extraction function
    audio_url_path = r"G:\code\Inspecta\data\test_data\test_videos\video1.mp4"
    transcibe_file_path = r"G:\code\Inspecta\data\test_data\test_videos\video1_transcribe.json"
    metadata = {
        "company_name": "Test Company",
        "industry": "Farming",
        "input_prompt": ""
    }
    
    try:
        transcript_text = transcript_extraction(audio_url_path, transcibe_file_path, metadata)
        print("Debug : Transcript Extraction Successful!")
        print("Transcript Text:", transcript_text)
    except Exception as e:
        print(f"Error during transcription: {e}")
 
if __name__ == "__main__":
    main()
