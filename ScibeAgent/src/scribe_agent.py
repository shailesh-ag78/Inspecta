import requests

class ScribeAgent:
    def __init__(self, api_url="http://localhost:5678"):
        self.api_url = api_url

    def transcribe_audio(self, media_file_obj, filename="media_file"):
        """
        Calls the Whisper ASR API with the provided file object (Audio or Video).
        """
        endpoint = f"{self.api_url}/asr"
        params = {
            "task": "transcribe",
            "output": "tsv",
            "encode": "false" 
        }

        print(f"Sending request to {endpoint} with file: {filename}...")
        files = {"audio_file": (filename, media_file_obj)}
        response = requests.post(endpoint, params=params, files=files)

        if response.status_code == 200:
            return response.text
        else:
            raise Exception(f"ASR Error {response.status_code}: {response.text}")
