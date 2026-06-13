docker ps

Write-Host "----------------------------------"

# Get the folder containing this script and resolve the workspace root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = (Resolve-Path "$ScriptDir\..").Path

# Save the current location and change to project root for the build context
$OriginalDir = Get-Location
Set-Location $ProjectRoot

# 1. Build the image locally
docker build -t ui-backend-local -f UI/backend/Dockerfile .

# Restore original working directory
Set-Location $OriginalDir

# 2. Run it locally (supplying local env vars)
Write-Host "`nExecute in browser -- http://localhost:8000/health" -ForegroundColor Green
write-host "`n"
docker run -p 8000:8000 `
    -e db_dsn="postgresql://neondb_owner:npg_U8BPRXgnzT6L@ep-floral-hat-ajkt7oqc.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require" `
    -e ENV_MODE="development" `
    ui-backend-local



    