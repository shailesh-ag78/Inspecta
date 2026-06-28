import os
import subprocess
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import asynccontextmanager
from pydantic import BaseModel
import uvicorn
from typing import Optional, Dict, Any
from pathlib import Path
from google.cloud import storage
import logging
import dotenv

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
dotenv.load_dotenv(dotenv_path=env_path)

ENV_MODE = os.getenv("ENV_MODE", "local").lower()
logger.info(f"🚀 Starting AudioExtractorAgent with ENV_MODE={ENV_MODE}")

# Define your local root (where files actually live on your PC)
LOCAL_STORAGE_ROOT = os.path.abspath(os.getenv("LOCAL_STORAGE_ROOT", r"g:\code\Inspecta\Data"))
LOCAL_TEMP_FOLDER = os.path.join(LOCAL_STORAGE_ROOT, "temp")
if not os.path.exists(LOCAL_TEMP_FOLDER):
    os.makedirs(LOCAL_TEMP_FOLDER)

from typing import Tuple
from urllib.parse import urlparse
def extract_bucket_and_blob_from_gs(gs_uri: str) -> Tuple[str, str]:
    """
    Splits a gs:// URI into bucket_name and blob_name.
    """
    # Parse the URI using standard URL rules
    parsed = urlparse(gs_uri)
    
    # Check if the protocol is correct
    if parsed.scheme != "gs":
        raise ValueError("URI scheme must be 'gs'")
        
    bucket_name = parsed.netloc
    # Strip the leading slash from the path to get the exact blob name
    blob_name = parsed.path.lstrip("/")
    
    return bucket_name, blob_name

gcs_client = None
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    logger.info("🔧 Initializing resources...")
    
    # Initialize GCS client if in non-local mode
    global gcs_client
    if ENV_MODE.startswith("local"):
        datastore_path = Path(__file__).parent.parent.parent / "DataStore"
        gcp_key_file = (datastore_path / "gcp-key.json").resolve()
        gcs_client = storage.Client.from_service_account_json(gcp_key_file)
    else:
        gcs_client = storage.Client()
    if not gcs_client:
            logger.error(f"❌ Failed to initialize GCS client")
            raise RuntimeError("GCS client not initialized")
    logger.info("✅ GCS Client initialized")
    
    yield  # Run the application
    
    # Shutdown code
    logger.info("🧹 Cleaning up resources...")
    
app = FastAPI(lifespan=lifespan)

class AudioExtractionRequest(BaseModel):
    video_url: str
    metadata: Optional[Dict[str, Any]] = None # company_name, industry_type, timestamp, etc.

@app.post("/extract_audio")
async def extract_audio_endpoint(request: AudioExtractionRequest):
    """
    Extracts audio from the video_url.
    Saves audio to storage at a specific location.
    Returns the location of audio_url.
    """
    video_url = request.video_url
    metadata = request.metadata

    logger.info(f"Received request to extract audio via POST.")

    # 1. Validation
    if not video_url:
        raise HTTPException(status_code=400, detail="video_url is required")

    logger.info(f"Video URL: {video_url}")
    logger.info(f"Test :Metadata: {metadata}")
    logger.info(f"Test : ENV_MODE: {ENV_MODE}")

    gcp_bucket = ""
    
    # Check if video_url is a local file and exists
    if(ENV_MODE == "local"):
        if not os.path.exists(video_url):
            raise HTTPException(status_code=400, detail=f"Video file not found at: {video_url}")
        
        p = Path(video_url)
        #audio_filename = f"{p.stem}_audio.mp3"
        audio_url_path = str(p.with_name(f"{p.stem}_audio.mp3"))
        audio_url = audio_url_path
        video_url_path = video_url
    else:
        # Check if file is available on GCS
        # File name example : "gs://inspecta-file-bucket/<company_storage>/uploads/a1b2-c3d4.mp4"
        if not gcs_client:
             raise HTTPException(status_code=500, detail="GCS client not initialized")

        #full_gcp_path = f"gs://{INSPCTA_FILE_BUCKET}/{company_storage_id}/UPLOADS_FOLDER/{filename}"    
        bucket_name, blob_name = extract_bucket_and_blob_from_gs(video_url)
        bucket = gcs_client.bucket(bucket_name)
        blob = bucket.get_blob(blob_name)   # blob = {company_storage_id}/UPLOADS_FOLDER/{filename}"
        if not blob:
            raise HTTPException(status_code=400, detail=f"Video file not found at: {video_url}")
        gcp_bucket = bucket_name    

        filename = blob_name.rsplit("/", 1)[-1]
        name_without_ext = filename.rsplit(".", 1)[0]  # Handle multiple dots correctly (e.g., "video.v1_audio.mp3")
        audio_filename = f"{name_without_ext}_audio.mp3"
        audio_url_path = os.path.join(LOCAL_TEMP_FOLDER, audio_filename)
        audio_url = blob_name.rsplit("/", 1)[0] + "/" + audio_filename
            
        # Downloading Video file locally
        temp_video_file_name = "temp_" + Path(blob_name).name
        video_url_path = os.path.join(LOCAL_TEMP_FOLDER, temp_video_file_name)
        logger.info(f"Downloading {video_url} to {video_url_path}...")
        blob.download_to_filename(video_url_path)
        
    # 3. Extract Audio
    try:
        logger.info(f"Extracting audio from {video_url} to {audio_url_path}")
        audio_extraction(video_url_path, audio_url_path)
    except Exception as e:
        logger.error(f"Extraction Error: {e}")
        raise HTTPException(status_code=500, detail=f"Audio extraction failed: {str(e)}")

    # 4. Return Result
    if(ENV_MODE != "local"):
        # Upload Audio file in GCS storage folder and set audio_url
        bucket = gcs_client.bucket(gcp_bucket)
        new_audio_blob = bucket.blob(audio_url)
        new_audio_blob.upload_from_filename(audio_url_path)
        
        # Delete temporary files
        os.remove(video_url_path)
        os.remove(audio_url_path)
        audio_url = f"gs://{bucket_name}/{audio_url}"
    
    return {
        "status": "success",
        "audio_url": audio_url,
        "metadata": { # Additional information to be returned if any
            "ENV_MODE" : ENV_MODE
        }
    }

def audio_extraction(video_url_path: str, audio_url_path: str):
    """
    Extracts high-quality mono audio from video.
    Ready for single-file transcription.
    """
    logger.info(f"Extracting audio from {video_url_path} to {audio_url_path}")
    try:
        # Run ffmpeg command
        # We use mono (ac 1) and 16kHz (ar 16000) for best AI recognition
        # use pcm_s16le : For Wav file : High quality audio but high storage, 
        # use libmp3lame : For MP3 : compressed audio but less storage
        subprocess.run([
            "ffmpeg", "-y", "-i", video_url_path,
            "-vn", "-ac", "1", "-ar", "16000", 
            "-acodec", "libmp3lame", audio_url_path
        ], check=True, capture_output=True)
        
    except subprocess.CalledProcessError as e:
        error_message = e.stderr.decode() if e.stderr else str(e)
        raise RuntimeError(f"ffmpeg failed: {error_message}")
    
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
