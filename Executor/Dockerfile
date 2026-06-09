FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY Executor/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy local dependencies
COPY DataStore /app/DataStore
COPY Executor /app/Executor

ENV PYTHONPATH=/app

EXPOSE 8080

# Run the application
CMD ["uvicorn", "Executor.src.main:app", "--host", "0.0.0.0", "--port", "8080"]
