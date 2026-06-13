FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY UI/backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy local dependencies
COPY DataStore /app/DataStore
COPY UI/backend /app/UI/backend

ENV PYTHONPATH=/app

# Run the application (Cloud Run requires binding to the $PORT env variable, default to 8000 locally)
CMD ["sh", "-c", "uvicorn UI.backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

