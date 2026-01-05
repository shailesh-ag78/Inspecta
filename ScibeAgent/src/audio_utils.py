import subprocess
import os
import shutil

def extract_audio(input_path: str, output_path: str = None) -> str:
    """
    Extracts audio from a video file using ffmpeg.
    
    Args:
        input_path (str): Path to the input video file.
        output_path (str, optional): Path for the output audio file. 
                                     If None, replaces extension with .wav.
    
    Returns:
        str: Path to the generated audio file.
    """
    if output_path is None:
        base, _ = os.path.splitext(input_path)
        output_path = f"{base}.wav"

    # Ensure ffmpeg is available
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg executable not found in PATH. Please install ffmpeg.")

    # ffmpeg command as requested:
    # ffmpeg -i /tmp/test.mp4 -vn -ar 16000 -ac 1 -acodec pcm_s16le /tmp/output_audio.wav
    command = [
        "ffmpeg",
        "-y", # Overwrite output file if exists
        "-i", input_path,
        "-vn", # Disable video recording
        "-ar", "16000", # Audio sampling rate
        "-ac", "1", # Audio channels
        "-acodec", "pcm_s16le", # Codec
        output_path
    ]

    print(f"Running command: {' '.join(command)}")

    try:
        # Run ffmpeg command
        subprocess.run(command, check=True, capture_output=True)
        return output_path
    except subprocess.CalledProcessError as e:
        error_message = e.stderr.decode() if e.stderr else str(e)
        raise RuntimeError(f"ffmpeg failed: {error_message}")
