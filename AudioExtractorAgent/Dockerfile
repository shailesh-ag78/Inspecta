FROM python:3.11-slim

WORKDIR /app

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY AudioExtractorAgent/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY AudioExtractorAgent /app/AudioExtractorAgent

ENV PYTHONPATH=/app

EXPOSE 8080

# Run the application
CMD ["uvicorn", "AudioExtractorAgent.src.main:app", "--host", "0.0.0.0", "--port", "8080"]
