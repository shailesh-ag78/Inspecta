# Get the directory of the current script
$PSScriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
Set-Location $PSScriptRoot

Write-Host "=== Deploy Inspecta Setup ===" -ForegroundColor Cyan

# Programmatically ensure that Docker is running
$dockerRunning = $false
while (-not $dockerRunning) {
    Write-Host "Verifying Docker status..." -ForegroundColor Cyan
    & docker info >$null 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dockerRunning = $true
        Write-Host "Docker is running successfully." -ForegroundColor Green
    }
    else {
        Write-Host "Docker does not appear to be running." -ForegroundColor Red
        $choice = Read-Host "Please start Docker Desktop and press Enter to try again, or type 'Q' to quit"
        if ($choice -eq 'Q' -or $choice -eq 'q') {
            Write-Host "Deployment aborted by user." -ForegroundColor Yellow
            exit 1
        }
    }
}

Write-Host "Starting deployment via deploy-gcp.ps1..." -ForegroundColor Cyan

# Call deploy-gcp.ps1 with specified parameters
& ".\deploy-gcp.ps1" `
    -ProjectID "inspecta-495004" `
    -DatabaseURL "postgresql://neondb_owner:npg_U8BPRXgnzT6L@ep-floral-hat-ajkt7oqc-pooler.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require" `
    -GcpViewerEmail "shailesh.ag78@gmail.com" `
    -GcpAdminEmail "sa.socialprofile@gmail.com" `
    -DeployUI:$true `
    -DeployAgents:$true `
    -ENV_MODE "production" `
    -BucketName "inspecta-file-bucket" `
    -UPLOADS_FOLDER "uploads"
