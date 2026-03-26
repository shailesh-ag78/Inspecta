# --- 0. Start Database ---
Read-Host -Prompt "🚀 Start Datbase Deocker Image through Docker Desktop UI. Press enter when doone ... " | Out-Null

# --- 1. Start Audio Agent ---
Write-Host "🚀 Starting Audio Extractor Agent on Port 8001..." -ForegroundColor Cyan
#Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd D:\code\Inspecta\AudioExtractorAgent\src; '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8001 --loop asyncio"
cd D:\code\Inspecta\AudioExtractorAgent
& '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8001 --loop asyncio

# --- 2. Start Transcribe Agent ---
Write-Host "🚀 Starting Transcribe Agent on Port 8002..." -ForegroundColor Cyan
cd D:\code\Inspecta\TranscriptionAgent
& '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8002 --loop asyncio

# --- 3. Start Field Reporter Agent ---
Write-Host "🚀 Starting Field Reporter Agent on Port 8003..." -ForegroundColor Cyan
cd D:\code\Inspecta\FieldReporterAgent
& '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8003 --loop asyncio

# --- 4. Start Executor ---
Write-Host "🚀 Starting Executor on Port 8000..." -ForegroundColor Green
#Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd D:\code\Inspecta\Executor\src; uvicorn main:app --host 0.0.0.0 --port 8000"
cd D:\code\Inspecta\Executor
& '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --loop asyncio

# --- 5. Run the Test ---
Write-Host "⏳ Waiting for services to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 10
Write-Host "🧪 Running Integration Test..." -ForegroundColor Yellow
cd D:\code\Inspecta\Executor\src
#python D:\code\Inspecta\Executor\src\test_executor.py