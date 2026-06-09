FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY TranscriptionAgent/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY TranscriptionAgent /app/TranscriptionAgent

ENV PYTHONPATH=/app

EXPOSE 8080

# Run the application
CMD ["uvicorn", "TranscriptionAgent.src.main:app", "--host", "0.0.0.0", "--port", "8080"]
