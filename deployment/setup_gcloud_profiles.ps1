# Setup gcloud Configuration Profiles for Inspecta
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "🛠️ Configuring gcloud profiles for Inspecta Multi-Project Setup" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Create or Update inspecta-backend configuration
Write-Host "[*] Setting up 'inspecta-backend' profile..." -ForegroundColor Yellow
$ExistingConfigs = & gcloud config configurations list --format="value(name)"
if ($ExistingConfigs -notcontains "inspecta-backend") {
    & gcloud config configurations create inspecta-backend --quiet
}
& gcloud config configurations activate inspecta-backend
& gcloud config set account sa.socialprofile@gmail.com
& gcloud config set project inspecta-495004
& gcloud config set compute/region us-central1
Write-Host "[+] 'inspecta-backend' profile configured successfully!" -ForegroundColor Green

# 2. Create or Update inspecta-frontend configuration
Write-Host "[*] Setting up 'inspecta-frontend' profile..." -ForegroundColor Yellow
if ($ExistingConfigs -notcontains "inspecta-frontend") {
    & gcloud config configurations create inspecta-frontend --quiet
}
& gcloud config configurations activate inspecta-frontend
# Using the dedicated service account key to authenticate this profile
if (Test-Path "inspecta-360-firebase-adminsdk-fbsvc-bd599894b5.json") {
    & gcloud auth activate-service-account --key-file="inspecta-360-firebase-adminsdk-fbsvc-bd599894b5.json" --quiet
}
& gcloud config set project inspecta-360
Write-Host "[+] 'inspecta-frontend' profile configured successfully!" -ForegroundColor Green

# 3. Switch back to backend configuration as default active
& gcloud config configurations activate inspecta-backend

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host "🎉 gcloud Profiles Initialized!" -ForegroundColor Green
Write-Host "To switch environments, run:" -ForegroundColor Gray
Write-Host "  Backend (inspecta-495004):  gcloud config configurations activate inspecta-backend" -ForegroundColor Cyan
Write-Host "  Frontend (inspecta-360):   gcloud config configurations activate inspecta-frontend" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Green
