FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY UI/backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy local dependencies
COPY DataStore /app/DataStore
COPY UI/backend /app/UI/backend

ENV PYTHONPATH=/app

EXPOSE 8000

# Run the application
CMD ["uvicorn", "UI.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
