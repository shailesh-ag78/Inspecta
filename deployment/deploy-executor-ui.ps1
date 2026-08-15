# Get the directory of the current script
$PSScriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
$OriginalDir = Get-Location
Set-Location "$PSScriptRoot\.."

Write-Host "=== Deploy Inspecta Setup (Executor & UI Backend Only) ===" -ForegroundColor Cyan

# Hardcoded Configuration Values
$ProjectID = "inspecta-495004"
$Region = "us-central1"
$DatabaseURL = "postgresql://neondb_owner:npg_U8BPRXgnzT6L@ep-floral-hat-ajkt7oqc.c-3.us-east-2.aws.neon.tech/inspecta_db?sslmode=require"
$GcpViewerEmail = "shailesh.ag78@gmail.com"
$GcpAdminEmail = "sa.socialprofile@gmail.com"
$BucketName = "inspecta-file-bucket"
$UPLOADS_FOLDER = "uploads"
$UiProjectId = "inspecta-ai"
$ENV_MODE = "production"
$RegistryName = "inspecta-registry"
$VpcName = "inspecta-vpc"
$SubnetName = "inspecta-subnet"
$CLOUD_TASKS_QUEUE_NAME = "inspecta-incident-queue"
$EXECUTOR_BASE_URL = "https://executor-service-860462670211.$Region.run.app"
$TRANSLATION_MODEL = "qwen/qwen-2.5-7b-instruct"
$OPENROUTER_URL = "https://openrouter.ai/api/v1"

$ErrorActionPreference = "Stop"

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

# Generate unique build number based on timestamp
$BuildNumber = Get-Date -Format "yyyyMMdd-HHmmss"

# -------------------------------------------------------------
# 1. Configure gcloud CLI context
# -------------------------------------------------------------
Write-Host "`n[1/5] Configuring gcloud profile and setting project context..." -ForegroundColor Yellow

$ExistingConfigs = & gcloud config configurations list --format="value(name)"
if ($ExistingConfigs -contains "inspecta-backend") {
    Write-Host "[*] Activating gcloud profile 'inspecta-backend'..." -ForegroundColor Yellow
    & gcloud config configurations activate inspecta-backend --quiet
}
& gcloud config set account $GcpAdminEmail --quiet
& gcloud config set project $ProjectID --quiet
& gcloud config set compute/region $Region --quiet

Write-Host "Configuring Docker authentication..."
gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet

# -------------------------------------------------------------
# 2. Build, Tag, and Push Docker Images
# -------------------------------------------------------------
Write-Host "`n[2/5] Building and pushing Docker container images..." -ForegroundColor Yellow
$RegistryUri = "$Region-docker.pkg.dev/$ProjectID/$RegistryName"

# 2.1 Executor
$TagLatestExecutor = "$RegistryUri/executor:latest"
$TagVersionExecutor = "$RegistryUri/executor:$BuildNumber"
Write-Host "`nBuilding executor Docker Image (tags: $BuildNumber, latest)..." -ForegroundColor Cyan
docker build -t $TagVersionExecutor -t $TagLatestExecutor -f "Executor/Dockerfile" .

Write-Host "Pushing $TagVersionExecutor to Artifact Registry..." -ForegroundColor Cyan
docker push $TagVersionExecutor
Write-Host "Pushing $TagLatestExecutor to Artifact Registry..." -ForegroundColor Cyan
docker push $TagLatestExecutor

# 2.2 UI Backend
$TagLatestUI = "$RegistryUri/ui-backend:latest"
$TagVersionUI = "$RegistryUri/ui-backend:$BuildNumber"
Write-Host "`nBuilding ui-backend Docker Image (tags: $BuildNumber, latest)..." -ForegroundColor Cyan
docker build -t $TagVersionUI -t $TagLatestUI -f "UI/backend/Dockerfile" .

Write-Host "Pushing $TagVersionUI to Artifact Registry..." -ForegroundColor Cyan
docker push $TagVersionUI
Write-Host "Pushing $TagLatestUI to Artifact Registry..." -ForegroundColor Cyan
docker push $TagLatestUI

# -------------------------------------------------------------
# 3. Retrieve Existing Agent Enpoints and Deploy Executor
# -------------------------------------------------------------
Write-Host "`n[3/5] Retrieving Agent endpoints and deploying Executor Service..." -ForegroundColor Yellow

Write-Host "Retrieving existing agent endpoints..." -ForegroundColor Gray
$AgentAudioExtractUrl = (gcloud run services list --filter="metadata.name=agent-audioextract" --format="value(URL)")
$AgentTranscribeUrl = (gcloud run services list --filter="metadata.name=agent-transcribe" --format="value(URL)")
$AgentTaskGeneratorUrl = (gcloud run services list --filter="metadata.name=agent-taskgenerator" --format="value(URL)")

Write-Host "Agent-AudioExtract URL: $AgentAudioExtractUrl"
Write-Host "Agent-Transcription URL: $AgentTranscribeUrl"
Write-Host "Agent-TaskGenerator URL: $AgentTaskGeneratorUrl"

# Grant Secret Access to Executor Service Account before deploying
Write-Host "Ensuring Secret Manager Access permissions for executor-service-sa..." -ForegroundColor Gray
gcloud secrets add-iam-policy-binding GEMINI_TRANSLATION_API_KEY --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor" --quiet
gcloud secrets add-iam-policy-binding OPENROUTER_API_KEY --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor" --quiet

Write-Host "Deploying executor-service..." -ForegroundColor Cyan
gcloud run deploy executor-service `
    --image="$RegistryUri/executor:$BuildNumber" `
    --region=$Region `
    --ingress=all `
    --no-allow-unauthenticated `
    --min-instances=0 `
    --timeout=900 `
    --network=$VpcName `
    --subnet=$SubnetName `
    --vpc-egress=private-ranges-only `
    --service-account="executor-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --set-secrets="GEMINI_TRANSLATION_API_KEY=GEMINI_TRANSLATION_API_KEY:latest,OPENROUTER_API_KEY=OPENROUTER_API_KEY:latest" `
    --max-instances=2 `
    --cpu-boost `
    --set-env-vars="ENV_MODE=$ENV_MODE,DATABASE_URL=$DatabaseURL,AGENT_AUDIOEXTRACT_URL=$AgentAudioExtractUrl,AGENT_TRANSCRIBE_URL=$AgentTranscribeUrl,AGENT_TASKGENERATOR_URL=$AgentTaskGeneratorUrl,`
                    UI_PROJECT_ID=$UiProjectId,TRANSLATION_MODEL=$TRANSLATION_MODEL,OPENROUTER_URL=$OPENROUTER_URL,`
                    GCP_SA_EMAIL=executor-service-sa@$ProjectID.iam.gserviceaccount.com,`
                    GCP_PROJECT_ID=$ProjectID,GCP_LOCATION=$Region,CLOUD_TASKS_QUEUE_NAME=$CLOUD_TASKS_QUEUE_NAME,EXECUTOR_BASE_URL=$EXECUTOR_BASE_URL"

# Retrieve Deployed Executor URL
$ExecutorUrl = (gcloud run services list --filter="metadata.name=executor-service" --format="value(URL)")
Write-Host "Deployed Executor URL: $ExecutorUrl" -ForegroundColor Green

# -------------------------------------------------------------
# 4. Deploy UI Backend Service
# -------------------------------------------------------------
Write-Host "`n[4/5] Deploying UI Backend Service..." -ForegroundColor Yellow

# Grant Secret Access to UI Service Account before deploying
Write-Host "Ensuring Secret Manager Access permissions for ui-service-sa..." -ForegroundColor Gray
gcloud secrets add-iam-policy-binding GEMINI_TRANSLATION_API_KEY --member="serviceAccount:ui-service-sa@$ProjectID.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor" --quiet
gcloud secrets add-iam-policy-binding OPENROUTER_API_KEY --member="serviceAccount:ui-service-sa@$ProjectID.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor" --quiet

Write-Host "Deploying ui-backend-service..." -ForegroundColor Cyan
gcloud run deploy ui-backend-service `
    --image="$RegistryUri/ui-backend:$BuildNumber" `
    --region=$Region `
    --ingress=all `
    --allow-unauthenticated `
    --min-instances=0 `
    --network=$VpcName `
    --subnet=$SubnetName `
    --vpc-egress=private-ranges-only `
    --service-account="ui-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --set-secrets="GEMINI_TRANSLATION_API_KEY=GEMINI_TRANSLATION_API_KEY:latest,OPENROUTER_API_KEY=OPENROUTER_API_KEY:latest" `
    --max-instances=2 `
    --cpu-boost `
    --set-env-vars="ENV_MODE=$ENV_MODE,DATABASE_URL=$DatabaseURL,TIMEOUT=60,INSPCTA_FILE_BUCKET=$BucketName,UPLOADS_FOLDER=$UPLOADS_FOLDER,BASE_EXECUTOR_URL=$ExecutorUrl,UI_PROJECT_ID=$UiProjectId,TRANSLATION_MODEL=$TRANSLATION_MODEL,OPENROUTER_URL=$OPENROUTER_URL"

$UiUrl = (gcloud run services list --filter="metadata.name=ui-backend-service" --format="value(URL)")
Write-Host "Deployed UI Backend URL: $UiUrl" -ForegroundColor Green

# -------------------------------------------------------------
# 5. Configure IAM Permissions
# -------------------------------------------------------------
Write-Host "`n[5/5] Configuring IAM Roles and service-to-service permissions..." -ForegroundColor Yellow

# Allow UI service SA to invoke Executor Service
Write-Host "Allowing ui-service-sa to invoke executor-service..." -ForegroundColor Gray
gcloud run services add-iam-policy-binding executor-service `
    --region=$Region `
    --member="serviceAccount:ui-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/run.invoker" `
    --platform=managed `
    --quiet

# Allow Executor service SA to invoke itself (needed when Cloud Tasks invokes Executor using Executor SA OIDC token)
Write-Host "Allowing executor-service-sa to invoke executor-service..." -ForegroundColor Gray
gcloud run services add-iam-policy-binding executor-service `
    --region=$Region `
    --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/run.invoker" `
    --platform=managed `
    --quiet


# Grant Token Creator permission to UI SA and Executor SA at the project level for creating pre-signed URLs
Write-Host "Granting iam.serviceAccountTokenCreator role..." -ForegroundColor Gray
gcloud projects add-iam-policy-binding $ProjectID --member="serviceAccount:ui-service-sa@$ProjectID.iam.gserviceaccount.com" --role="roles/iam.serviceAccountTokenCreator" --quiet
gcloud projects add-iam-policy-binding $ProjectID --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" --role="roles/iam.serviceAccountTokenCreator" --quiet

# Grant Cloud Tasks Enqueuer permission to Executor SA
Write-Host "Granting cloudtasks.enqueuer role to executor-service-sa..." -ForegroundColor Gray
gcloud projects add-iam-policy-binding $ProjectID --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" --role="roles/cloudtasks.enqueuer" --quiet

# Grant serviceAccountUser role to Executor SA on itself (required to enqueue Cloud Tasks using OIDC token)
Write-Host "Granting serviceAccountUser role to executor-service-sa on itself..." -ForegroundColor Gray
gcloud iam service-accounts add-iam-policy-binding executor-service-sa@$ProjectID.iam.gserviceaccount.com --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" --role="roles/iam.serviceAccountUser" --quiet



# Grant storage object user permissions on the bucket
Write-Host "Granting GCS storage.objectUser permissions..." -ForegroundColor Gray
gcloud storage buckets add-iam-policy-binding gs://$BucketName --member="serviceAccount:ui-service-sa@$ProjectID.iam.gserviceaccount.com" --role="roles/storage.objectUser" --quiet
gcloud storage buckets add-iam-policy-binding gs://$BucketName --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" --role="roles/storage.objectUser" --quiet

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host "🎉 Service Deployment and IAM Configuration Complete!" -ForegroundColor Green
Write-Host "Executor URL: $ExecutorUrl" -ForegroundColor Green
Write-Host "UI Backend URL: $UiUrl" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green

# Restore location
Set-Location $OriginalDir
