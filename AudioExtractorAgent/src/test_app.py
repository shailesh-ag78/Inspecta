import sys
import os
import json
import requests
import datetime

def main():
    # Force UTF-8 encoding for stdout
    sys.stdout.reconfigure(encoding='utf-8')

    if len(sys.argv) < 2:
        print("Usage: python test_app.py <path_to_video_file>")
        # Default to a sample file if it exists, otherwise warn
        default_file = r"D:\code\Inspecta\AudioExtractorAgent\Test\sample_video.mp4" 
        # Note: Adjusting default to something that might exist or be created for testing
        if os.path.exists(default_file):
             input_file = default_file
        else:
             # Just use a dummy path for testing the validation if real file not needed for simple connection test
             # But the server checks existence. 
             # Let's assume user passes a file or we create a dummy one.
             input_file = r"D:\code\Inspecta\AudioExtractorAgent\Test\sample.mp4"
             print(f"No input file provided. Using default: {input_file}")
    else:
        input_file = sys.argv[1]

    # Ensure the input file exists for the server to find it (since we are likely running on same machine)
    # If the server is remote, this check is client-side only.
    if not os.path.exists(input_file):
        print(f"Warning: File '{input_file}' not found locally. Sending path anyway in case it exists on server.")

    api_url = "http://localhost:8000/extract_audio"
    
    payload = {
        "video_url": os.path.abspath(input_file),
        "metadata": {
            "company_name": "Acme Corp",
            "industry_type": "Manufacturing",
            "timestamp": datetime.datetime.now().isoformat()
        }
    }

    try:
        print(f"Testing AudioExtractor Agent via FastAPI: {api_url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        headers = {'Content-Type': 'application/json'}
        response = requests.post(api_url, data=json.dumps(payload), headers=headers)
        
        if response.status_code == 200:
            result = response.json()
            
            print("\n--- Extraction Result ---")
            print(json.dumps(result, indent=2))
            print("----------------------------")
            
            # Verify audio file existence if running locally
            audio_url = result.get("audio_url")
            if audio_url and os.path.exists(audio_url):
                print(f"SUCCESS: Audio file verified at {audio_url}")
            elif audio_url:
                 print(f"WARNING: Audio file path returned ({audio_url}) but not found locally (maybe server is remote/containerized?)")

        else:
            print(f"Error: {response.status_code} - {response.text}")

    except Exception as e:
        print(f"\nError occurred: {e}")

if __name__ == "__main__":
    main()
