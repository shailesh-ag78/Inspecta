# # --- 0. Start Database ---
# Read-Host -Prompt "🚀 Start Datbase Deocker Image through Docker Desktop UI. Press enter when doone ... " | Out-Null

# # --- 1. Start Audio Agent ---
# Write-Host "🚀 Starting Audio Extractor Agent on Port 8001..." -ForegroundColor Cyan
# #Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd G:\code\Inspecta\AudioExtractorAgent\src; '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8001 --loop asyncio"
# cd G:\code\Inspecta\AudioExtractorAgent
# .\.venv\Scripts\Activate.ps1
# & '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8001 --loop asyncio

# # --- 2. Start Transcribe Agent ---
# Write-Host "🚀 Starting Transcribe Agent on Port 8002..." -ForegroundColor Cyan
# cd G:\code\Inspecta\TranscriptionAgent
# .\.venv\Scripts\Activate.ps1
# & '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8002 --loop asyncio

# # --- 3. Start Field Reporter Agent ---
# 
# cd G:\code\Inspecta\FieldReporterAgentWrite-Host "🚀 Starting Field Reporter Agent on Port 8003..." -ForegroundColor Cyan
# .\.venv\Scripts\Activate.ps1
# & '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8003 --loop asyncio

# # --- 4. Start Executor ---
# Write-Host "🚀 Starting Executor on Port 8000..." -ForegroundColor Green
# #Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd D:\code\Inspecta\Executor\src; uvicorn main:app --host 0.0.0.0 --port 8000"
# cd G:\code\Inspecta\Executor
# .\.venv\Scripts\Activate.ps1
# & '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --loop asyncio
# #& '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --loop asyncio --reload

# # --- 5. Run the Test ---
# Write-Host "⏳ Waiting for services to initialize..." -ForegroundColor Gray
# Start-Sleep -Seconds 10
# Write-Host "🧪 Running Integration Test..." -ForegroundColor Yellow
# cd G:\code\Inspecta\Executor\src
# #python G:\code\Inspecta\Executor\src\test_executor.py

# # --- 5. Run backend UI ---
# Write-Host "🚀 Starting Backend UI on Port 8004..." -ForegroundColor Cyan
# cd G:\code\Inspecta\UI\Backend
# .\.venv\Scripts\Activate.ps1
# & '.\.venv\Scripts\python.exe' -m uvicorn main:app --host 0.0.0.0 --port 8004 --loop asyncio --reload

# # --- 6. Run frontend UI ---
# Write-Host "🚀 Starting Frontend UI on Port 3000..." -ForegroundColor Cyan
# cd G:\code\Inspecta\UI\inspecta-dashboard
# npm run dev
#========================================
# --- 1. Start Audio Agent in a New Terminal ---
Write-Host "🚀 Spawning Audio Extractor Agent on Port 8001..." -ForegroundColor Cyan

#$Host.UI.RawUI.WindowTitle = "Agent - Audio Extractor (Port 8001)"
$AudioScript = {
    Set-Location "G:\code\Inspecta\AudioExtractorAgent"
    $Host.UI.RawUI.WindowTitle = Split-Path (Get-Location).Path -Leaf
    .\.venv\Scripts\Activate.ps1
    & '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8001 --loop asyncio
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", $AudioScript
#================================================================================

# --- 2. Start Transcribe Agent in a New Terminal ---
Write-Host "🚀 Spawning Transcribe Agent on Port 8002..." -ForegroundColor Cyan

#$Host.UI.RawUI.WindowTitle = "Agent - Transcription (Port 8002)"
$TranscribeScript = {
    Set-Location "G:\code\Inspecta\TranscriptionAgent"
    $Host.UI.RawUI.WindowTitle = Split-Path (Get-Location).Path -Leaf
    .\.venv\Scripts\Activate.ps1
    & '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8002 --loop asyncio
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", $TranscribeScript

#================================================================================
Write-Host "🚀 Starting Field Reporter Agent on Port 8003..." -ForegroundColor Cyan
#$Host.UI.RawUI.WindowTitle = "Agent - Field Reporter (Port 8003)"
$FieldReporterScript = {
    Set-Location "G:\code\Inspecta\FieldReporterAgent"
    $Host.UI.RawUI.WindowTitle = Split-Path (Get-Location).Path -Leaf
    .\.venv\Scripts\Activate.ps1
    & '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8003 --loop asyncio
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", $FieldReporterScript
#================================================================================
Write-Host "🚀 Starting Executor on Port 8004..." -ForegroundColor Cyan
#$Host.UI.RawUI.WindowTitle = "Agent - Executor (Port 8004)"
$ExecutorScript = {
    Set-Location "G:\code\Inspecta\Executor"
    $Host.UI.RawUI.WindowTitle = Split-Path (Get-Location).Path -Leaf
    .\.venv\Scripts\Activate.ps1
    & '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8004 --loop asyncio
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", $ExecutorScript
#================================================================================
Write-Host "🚀 Starting Executor on Port 8004..." -ForegroundColor Green
#$Host.UI.RawUI.WindowTitle = "Executor (Port 8000)"
$ExecutorScript = {
    
    Set-Location "G:\code\Inspecta\Executor"
    $Host.UI.RawUI.WindowTitle = Split-Path (Get-Location).Path -Leaf
    .\.venv\Scripts\Activate.ps1
    & '.\.venv\Scripts\python.exe' -m uvicorn src.main:app --host 0.0.0.0 --port 8004 --loop asyncio
}
#Start-Process powershell -ArgumentList "-NoExit", "-Command", $ExecutorScript
#================================================================================
Write-Host "✅ All agents spawned successfully!" -ForegroundColor Green

Write-Host "🚀 Starting Backend UI on Port 8000..." -ForegroundColor Cyan
#$Host.UI.RawUI.WindowTitle = "Backend UI (Port 8000)"
$BackendUIScript = {
    Set-Location "G:\code\Inspecta\UI\Backend"
    $Host.UI.RawUI.WindowTitle = Split-Path (Get-Location).Path -Leaf
    .\.venv\Scripts\Activate.ps1
    & '.\.venv\Scripts\python.exe' -m uvicorn main:app --host 0.0.0.0 --port 8000 --loop asyncio --reload
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", $BackendUIScript
#================================================================================
# # --- 6. Run frontend UI ---
# Write-Host "🚀 Starting Frontend UI on Port 3000..." -ForegroundColor Cyan
# cd G:\code\Inspecta\UI\inspecta-dashboard
# npm run dev
