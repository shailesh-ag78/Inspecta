import sys
import os
import requests
import json

def main():
    # Force UTF-8 encoding for stdout
    sys.stdout.reconfigure(encoding='utf-8')

    if len(sys.argv) < 2:
        print("Usage: python test_app.py <path_to_audio_file1> [path_to_audio_file2 ...]")
        return
    
    input_files = sys.argv[1:]
    
    # Updated port for TranscriptionAgent
    base_url = "http://localhost:8001"
    
    # Prepare files for upload
    files_to_upload = []
    opened_files = []
    
    try:
        for fpath in input_files:
            if os.path.exists(fpath):
                f = open(fpath, "rb")
                opened_files.append(f)
                # 'files' list for requests should be tuples: (field_name, (filename, file_obj))
                files_to_upload.append(("files", (os.path.basename(fpath), f)))
            else:
                print(f"Warning: File {fpath} not found. Skipping.")

        if not files_to_upload:
            print("No valid files to process.")
            return

        # Test Transcribe
        print(f"\n--- Testing Transcribe ({len(files_to_upload)} files) ---")
        try:
            response = requests.post(f"{base_url}/transcribe_incidents", files=files_to_upload)
            if response.status_code == 200:
                print("Success!")
                print(json.dumps(response.json(), indent=2, ensure_ascii=False))
                
                # Save to file
                with open("output_transcribe.json", "w", encoding="utf-8") as f:
                    json.dump(response.json(), f, indent=2, ensure_ascii=False)
            else:
                print(f"Error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Request failed: {e}")

        # # Rewind files for next request
        # for f in opened_files:
        #     f.seek(0)
            
        # # Test Translate
        # print(f"\n--- Testing Translate ({len(files_to_upload)} files) ---")
        # try:
        #     response = requests.post(f"{base_url}/translate_incidents", files=files_to_upload)
        #     if response.status_code == 200:
        #         print("Success!")
        #         # Print only summary to avoid clutter
        #         res = response.json()
        #         print(f"Processed {len(res['incidents'])} incidents.")
                
        #         # Save to file
        #         with open("output_translate.json", "w", encoding="utf-8") as f:
        #             json.dump(res, f, indent=2, ensure_ascii=False)
        #     else:
        #         print(f"Error: {response.status_code} - {response.text}")
        # except Exception as e:
        #     print(f"Request failed: {e}")

    finally:
        for f in opened_files:
            f.close()

if __name__ == "__main__":
    main()
