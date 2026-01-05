import wave
import struct
import math

# def create_sample_wav(filename="sample.wav", duration=2.0):
#     # Audio parameters
#     sample_rate = 44100
#     n_channels = 1
#     sample_width = 2
#     n_frames = int(sample_rate * duration)
    
#     # Generate a simple 440Hz sine wave (A4 note)
#     data = []
#     frequency = 440.0
#     amplitude = 16000 # Max 32767 for 16-bit audio
    
#     for i in range(n_frames):
#         value = int(amplitude * math.sin(2 * math.pi * frequency * i / sample_rate))
#         data.append(struct.pack('<h', value))
        
#     # Write to WAV file
#     with wave.open(filename, 'w') as wav_file:
#         wav_file.setnchannels(n_channels)
#         wav_file.setsampwidth(sample_width)
#         wav_file.setframerate(sample_rate)
#         wav_file.writeframes(b''.join(data))
        
#     print(f"Created sample audio file: {filename}")

if __name__ == "__main__":
    create_sample_wav()
