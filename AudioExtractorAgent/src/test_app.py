import sys
import os
import json
import requests
import re   
import unicodedata
#from indicnlp.normalize.indic_normalize import IndicNormalizerFactory

def normalize_text(text: str) -> str:
    """
    Convert mixed Hindi text containing Unicode escape sequences
    (e.g. '\\u0926\\u0947\\u0936') and already readable Hindi script
    into clean Hindi output.
    """
    try:
        # Step 1: Find all unicode escape sequences in the text
        # Regex matches \uXXXX patterns
        def decode_match(match):
            return match.group(0).encode('utf-8').decode('unicode_escape')
        
        #normalized = re.sub(r'\\u[0-9a-fA-F]{4}', decode_match, text)
        decoded = re.sub(r'\\u[0-9a-fA-F]{4}', decode_match, text)
        
        # Step 2: Normalize to NFC form (canonical composition)
        normalized = unicodedata.normalize("NFC", decoded)

        # Step 3: Return normalized text
        return normalized.strip()

    except Exception as e:
        return f"Error converting text: {e}"

def main():
    # Force UTF-8 encoding for stdout to ensure Hindi characters display correctly on Windows
    sys.stdout.reconfigure(encoding='utf-8')

    if len(sys.argv) < 2:
        print("Usage: python test_app.py <path_to_audio_or_video_file>")
        print("Using default 'sample.wav' if available...")
        input_file = "sample.wav"
    else:
        input_file = sys.argv[1]

    if not os.path.exists(input_file):
        print(f"Error: File '{input_file}' not found.")
        sys.exit(1)
    
    api_url = "http://localhost:8000/transcribeAudio"
    
    try:
        print(f"Testing AudioExtractor Agent via FastAPI: {input_file}")
        with open(input_file, "rb") as f:
            files = {"file": (os.path.basename(input_file), f)}
            response = requests.post(api_url, files=files)
            
        if response.status_code == 200:
            result_text = response.text
            
            # Save raw response (TSV) to response.txt in the same directory as output files
            output_dir = r"D:\code\Inspecta\AudioExtractorAgent\Test"
            response_file_path = os.path.join(output_dir, "response.txt")
            with open(response_file_path, "w", encoding="utf-8") as f:
                f.write(result_text)
            
            print("\n--- Transcription Result ---")
            print(result_text)
            print("----------------------------")

        else:
            print(f"Error: {response.status_code} - {response.text}")

    except Exception as e:
        print(f"\nError occurred: {e}")

if __name__ == "__main__":
    main()
