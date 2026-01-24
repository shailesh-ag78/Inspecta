import asyncio
import os
import sys
from unittest.mock import patch, MagicMock

# Add src to path to import main
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app, extract_audio_endpoint, AudioExtractionRequest

async def test_extract_audio_success():
    print("Running test_extract_audio_success...")
    
    # Mock data
    dummy_video_path = "d:\\videos\\test.mp4"
    dummy_metadata = {"client": "test_client"}
    
    request = AudioExtractionRequest(
        video_url=dummy_video_path,
        metadata=dummy_metadata
    )

    # Patch os.path.exists to return True for our dummy path
    # Patch main.extract_audio (the function imported into main)
    # Patch os.makedirs just in case
    
    with patch('main.os.path.exists') as mock_exists, \
         patch('main.extract_audio') as mock_extract, \
         patch('main.os.path.join', return_value="d:\\data\\test_GUID.mp3") as mock_join:
         
        # Configure mocks
        mock_exists.side_effect = lambda p: p == dummy_video_path or p == r"d:\code\Inspecta\Data" # Allow data dir check and file check
        
        # Call the endpoint
        response = await extract_audio_endpoint(request)
        
        # Assertions
        print("Response:", response)
        assert response["status"] == "success"
        assert "audio_url" in response
        assert response["metadata_received"] == dummy_metadata
        
        # Verify extract_audio was called with correct args
        # Note: since we patched main.extract_audio, we check that
        mock_extract.assert_called_once()
        args, _ = mock_extract.call_args
        assert args[0] == dummy_video_path
        # args[1] is the output path, which we didn't strictly control but can check it ends with .mp3
        assert args[1].endswith(".mp3")
        
        print("✅ test_extract_audio_success PASSED")

async def test_video_not_found():
    print("\nRunning test_video_not_found...")
    
    dummy_video_path = "d:\\videos\\missing.mp4"
    request = AudioExtractionRequest(
        video_url=dummy_video_path,
        metadata={}
    )
    
    with patch('main.os.path.exists') as mock_exists:
        mock_exists.return_value = False # File doesn't exist
        
        try:
            await extract_audio_endpoint(request)
            print("❌ test_video_not_found FAILED (Should have raised HTTPException)")
        except Exception as e:
            # We expect HTTPException
            # FastApi raises HTTPException which is just an exception
            if getattr(e, "status_code", None) == 400:
                print(f"✅ test_video_not_found PASSED (Caught expected 400: {e})")
            else:
                 print(f"❌ test_video_not_found FAILED (Caught unexpected exception: {e})")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(test_extract_audio_success())
    loop.run_until_complete(test_video_not_found())
    loop.close()
