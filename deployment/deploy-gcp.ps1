<#
.SYNOPSIS
    Deploys the Inspecta multi-agent application components to Google Cloud Run.
.DESCRIPTION
    This script initializes the GCP configuration, creates the VPC networks, creates Artifact Registry,
    builds and pushes Docker containers, sets up Service Accounts and IAM permissions, and deploys
    the 5 microservices to Cloud Run as per the target architecture.
.PARAMETER ProjectID
    The Google Cloud Project ID.
.PARAMETER Region
    The GCP region to deploy to (default: us-central1).
.PARAMETER DatabaseURL
    The Neon PostgreSQL Serverless Connection string.
.PARAMETER GcpViewerEmail
    The Google email address for the limited DevOps user (inspectaGCPViewer).
.PARAMETER GcpAdminEmail
    The Google email address for the admin DevOps user (inspectaGCPAdmin).
.EXAMPLE
    .\deploy-gcp.ps1 -ProjectID "inspecta-495004" -DatabaseURL "postgresql://neondb_owner:npg_U8BPRXgnzT6L@ep-floral-hat-ajkt7oqc-pooler.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require" -GcpViewerEmail "shailesh.ag78@gmail.com" -GcpAdminEmail "sa.socialprofile@gmail.com" -DeployUI:$true -DeployAgents:$true
#>

# TODO: Enable API Gateway and define rate limits (quotas) directly on it. UI Backend service will be called only from API Gateway
# Enable Firebase Autehtication at API Gateway level

param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectID,

    [Parameter(Mandatory = $false)]
    [string]$Region = "us-central1",

    [Parameter(Mandatory = $true)]
    [string]$DatabaseURL,

    [Parameter(Mandatory = $true)]
    [string]$GcpViewerEmail,

    [Parameter(Mandatory = $true)]
    [string]$GcpAdminEmail,

    [Parameter(Mandatory = $false)]
    [switch]$DeployUI,

    [Parameter(Mandatory = $false)]
    [switch]$DeployAgents,

    [Parameter(Mandatory = $false)]
    [string]$BuildNumber,

    [Parameter(Mandatory = $false)]
    [string]$ENV_MODE = "production",

    [Parameter(Mandatory = $false)]
    [string]$BucketName = "inspecta-file-bucket",

    [Parameter(Mandatory = $false)]
    [string]$UPLOADS_FOLDER = "uploads"
)

$OPENAI_MODEL = "gpt-4o"
$MODEL_TEMPERATURE = "0.2"

$ErrorActionPreference = "Stop"

# Use timestamp as build number if not provided
if ([string]::IsNullOrEmpty($BuildNumber)) {
    $BuildNumber = Get-Date -Format "yyyyMMdd-HHmmss"
}


Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "🚀 Starting Inspecta Multi-Agent Deployment to GCP" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Project ID: $ProjectID"
Write-Host "Region:     $Region"
Write-Host "=================================================================" -ForegroundColor Cyan

# -------------------------------------------------------------
# 1. Set current project and enable GCP APIs
# -------------------------------------------------------------
Write-Host "`n[1/7] Setting GCP Project and enabling APIs..." -ForegroundColor Yellow
gcloud config set project $ProjectID

$APIs = @(
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "vpcaccess.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "secretmanager.googleapis.com"
)

foreach ($API in $APIs) {
    Write-Host "Enabling $API..."
    gcloud services enable $API
}

# -------------------------------------------------------------
# 2. Setup VPC Networking
# -------------------------------------------------------------
Write-Host "`n[2/7] Configuring VPC Network and Subnet..." -ForegroundColor Yellow

# Create custom VPC if it doesn't exist
$VpcName = "inspecta-vpc"
$VpcExists = gcloud compute networks list --filter="name=$VpcName" --format="value(name)"
if (-not $VpcExists) {
    Write-Host "Creating VPC Network: $VpcName..."
    gcloud compute networks create $VpcName --subnet-mode=custom
}
else {
    Write-Host "VPC Network $VpcName already exists."
}

# Create Subnet if it doesn't exist
$SubnetName = "inspecta-subnet"
$SubnetExists = gcloud compute networks subnets list --network=$VpcName --regions=$Region --filter="name=$SubnetName" --format="value(name)"
if (-not $SubnetExists) {
    Write-Host "Creating Subnet: $SubnetName with Private Google Access enabled..."
    gcloud compute networks subnets create $SubnetName `
        --network=$VpcName `
        --range="10.0.0.0/24" `
        --region=$Region `
        --enable-private-ip-google-access
}
else {
    Write-Host "Subnet $SubnetName already exists."
}

# -------------------------------------------------------------
# 3. Create Service Accounts
# -------------------------------------------------------------
Write-Host "`n[3/7] Setting up Service Accounts..." -ForegroundColor Yellow

$SAs = @(
    @{ Name = "ui-service-sa"; Display = "UI Service Backend SA" },
    @{ Name = "audio-extractor-service-sa"; Display = "Audio Extractor Agent Service SA" },
    @{ Name = "executor-service-sa"; Display = "LangChain Executor Service SA" },
    @{ Name = "transcribe-service-sa"; Display = "Transcription Agent Service SA" },
    @{ Name = "taskgen-service-sa"; Display = "Field Reporter Agent Service SA" }
)

foreach ($SA in $SAs) {
    $SaName = $SA.Name
    $SaEmail = "$SaName@$ProjectID.iam.gserviceaccount.com"
    $SaExists = gcloud iam service-accounts list --filter="email=$SaEmail" --format="value(email)"
    if (-not $SaExists) {
        Write-Host "Creating service account: $SaName..."
        gcloud iam service-accounts create $SaName --display-name=$SA.Display
    }
    else {
        Write-Host "Service account $SaName already exists."
    }
}

# -------------------------------------------------------------
# 4. Create Artifact Registry and Configure Docker Authentication
# -------------------------------------------------------------
Write-Host "`n[4/7] Setting up Artifact Registry..." -ForegroundColor Yellow
$RegistryName = "inspecta-registry"
$RegistryExists = gcloud artifacts repositories list --location=$Region --filter="id=$RegistryName" --format="value(name)"
if (-not $RegistryExists) {
    Write-Host "Creating Artifact Registry repository: $RegistryName..."
    # Wrap in try/catch to prevent non-zero exit codes from halting the script
    try {
        gcloud artifacts repositories create $RegistryName `
            --repository-format=docker `
            --location=$Region `
            --description="Docker repository for Inspecta services" `
            --quiet
    }
    catch {
        if ($_ -like "*ALREADY_EXISTS*") {
            Write-Host "Artifact Registry $RegistryName already exists (handled catch)."
        }
        else {
            throw $_
        }
    }
}
else {
    Write-Host "Artifact Registry $RegistryName already exists."
}

# Configure cleanup policy to keep only the latest 2 images of each service/package
Write-Host "Configuring repository cleanup policies..."
$PolicyJson = @'
[
  {
    "name": "keep-latest-two",
    "action": {
      "type": "Keep"
    },
    "mostRecentVersions": {
      "keepCount": 2
    }
  }
]
'@
$PolicyFilePath = Join-Path $PSScriptRoot "cleanup-policy.json"
[System.IO.File]::WriteAllText($PolicyFilePath, $PolicyJson)

try {
    gcloud artifacts repositories set-cleanup-policies $RegistryName `
        --location=$Region `
        --policy=$PolicyFilePath `
        --quiet
}
catch {
    Write-Warning "Could not set Artifact Registry cleanup policy: $_"
}
finally {
    if (Test-Path $PolicyFilePath) {
        Remove-Item $PolicyFilePath
    }
}

Write-Host "Configuring Docker authentication..."
gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet

# -------------------------------------------------------------
# 5. Build, Tag, and Push Docker Images
# -------------------------------------------------------------
Write-Host "`n[5/7] Building and pushing Docker container images..." -ForegroundColor Yellow

# Verify Docker is running
Write-Host "Checking if Docker daemon is running..." -ForegroundColor Gray
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: Docker daemon is not running. Please start Docker Desktop and try again."
    exit 1
}

# Navigate to the workspace root directory (one folder up from deployment/)
$OriginalDir = Get-Location
Set-Location "$PSScriptRoot\.."

$Services = @()

if ($DeployUI) {
    $Services += @{ Target = "ui-backend"; DockerfilePath = "UI/backend/Dockerfile" }
}

if ($DeployAgents) {
    $Services += @(
        @{ Target = "agent-audioextract"; DockerfilePath = "AudioExtractorAgent/Dockerfile" },
        @{ Target = "agent-transcribe"; DockerfilePath = "TranscriptionAgent/Dockerfile" },
        @{ Target = "agent-taskgenerator"; DockerfilePath = "FieldReporterAgent/Dockerfile" },
        @{ Target = "executor"; DockerfilePath = "Executor/Dockerfile" }
    )
}

foreach ($Svc in $Services) {
    $TagLatest = "$Region-docker.pkg.dev/$ProjectID/$RegistryName/$($Svc.Target):latest"
    $TagVersion = "$Region-docker.pkg.dev/$ProjectID/$RegistryName/$($Svc.Target):$BuildNumber"
    
    Write-Host "`nBuilding $($Svc.Target) Docker Image (tags: $BuildNumber, latest)..." -ForegroundColor Cyan
    docker build -t $TagVersion -t $TagLatest -f $($Svc.DockerfilePath) .
    
    Write-Host "Pushing $TagVersion to Artifact Registry..." -ForegroundColor Cyan
    docker push $TagVersion
    
    Write-Host "Pushing $TagLatest to Artifact Registry..." -ForegroundColor Cyan
    docker push $TagLatest
}

# Return to script directory
Set-Location $OriginalDir

# -------------------------------------------------------------
# 6. Deploy Services to Cloud Run
# -------------------------------------------------------------
Write-Host "`n[6/7] Deploying microservices to Cloud Run..." -ForegroundColor Yellow

$RegistryUri = "$Region-docker.pkg.dev/$ProjectID/$RegistryName"

# 6.1 Deploy 3 Agents (Internal Ingress, Scale to Zero, Private Network)
$AgentAudioExtractUrl = ""
$AgentTranscribeUrl = ""
$AgentTaskGeneratorUrl = ""

if ($DeployAgents) {
    Write-Host "Deploying agent-audioextract (AudioExtractor)..." -ForegroundColor Cyan
    gcloud run deploy agent-audioextract `
        --image="$RegistryUri/agent-audioextract:$BuildNumber" `
        --region=$Region `
        --ingress=internal `
        --no-allow-unauthenticated `
        --min-instances=0 `
        --network=$VpcName `
        --subnet=$SubnetName `
        --vpc-egress=private-ranges-only `
        --service-account="audio-extractor-service-sa@$ProjectID.iam.gserviceaccount.com" `
        --max-instances=2 `
        --set-env-vars="ENV_MODE=$ENV_MODE"

    Write-Host "Deploying agent-transcribe (Transcription)..." -ForegroundColor Cyan
    gcloud run deploy agent-transcribe `
        --image="$RegistryUri/agent-transcribe:$BuildNumber" `
        --region=$Region `
        --ingress=internal `
        --no-allow-unauthenticated `
        --min-instances=0 `
        --network=$VpcName `
        --subnet=$SubnetName `
        --vpc-egress=private-ranges-only `
        --service-account="transcribe-service-sa@$ProjectID.iam.gserviceaccount.com" `
        --set-secrets="GROQ_API_KEY=GROQ_API_KEY:latest" `
        --max-instances=2 `
        --set-env-vars="ENV_MODE=$ENV_MODE"

    Write-Host "Deploying agent-taskgenerator (FieldReporter)..." -ForegroundColor Cyan
    gcloud run deploy agent-taskgenerator `
        --image="$RegistryUri/agent-taskgenerator:$BuildNumber" `
        --region=$Region `
        --ingress=internal `
        --no-allow-unauthenticated `
        --min-instances=0 `
        --network=$VpcName `
        --subnet=$SubnetName `
        --vpc-egress=private-ranges-only `
        --service-account="taskgen-service-sa@$ProjectID.iam.gserviceaccount.com" `
        --set-secrets="OPENAI_API_KEY=OPENAI_API_KEY:latest" `
        --max-instances=2 `
        --set-env-vars="ENV_MODE=$ENV_MODE,OPENAI_MODEL=$OPENAI_MODEL,MODEL_TEMPERATURE=$MODEL_TEMPERATURE"


    # Fetch Agent URLs
    Write-Host "Retrieving agent endpoints..."
    $AgentAudioExtractUrl = (gcloud run services describe agent-audioextract --region=$Region --format="value(status.url)")
    $AgentTranscribeUrl = (gcloud run services describe agent-transcribe --region=$Region --format="value(status.url)")
    $AgentTaskGeneratorUrl = (gcloud run services describe agent-taskgenerator --region=$Region --format="value(status.url)")

    Write-Host "Agent-AudioExtract: $AgentAudioExtractUrl"
    Write-Host "Agent-Transcription: $AgentTranscribeUrl"
    Write-Host "Agent-TaskGenerator: $AgentTaskGeneratorUrl"
}

# 6.2 Deploy Executor Service (Internal Ingress, min 1 instance, 900s timeout, Private Network)
$ExecutorUrl = ""
if ($DeployAgents) {
    Write-Host "Deploying executor-service..." -ForegroundColor Cyan
    gcloud run deploy executor-service `
        --image="$RegistryUri/executor:$BuildNumber" `
        --region=$Region `
        --ingress=internal `
        --no-allow-unauthenticated `
        --min-instances=0 `
        --timeout=900 `
        --network=$VpcName `
        --subnet=$SubnetName `
        --vpc-egress=private-ranges-only `
        --service-account="executor-service-sa@$ProjectID.iam.gserviceaccount.com" `
        --max-instances=2 `
        --set-env-vars="ENV_MODE=$ENV_MODE,DATABASE_URL=$DatabaseURL,AGENT_AUDIOEXTRACT_URL=$AgentAudioExtractUrl,AGENT_TRANSCRIBE_URL=$AgentTranscribeUrl,AGENT_TASKGENERATOR_URL=$AgentTaskGeneratorUrl"
        
    # Fetch Executor URL
    Write-Host "Retrieving executor endpoint..."
    $ExecutorUrl = (gcloud run services describe executor-service --region=$Region --format="value(status.url)")
    Write-Host "Executor URL: $ExecutorUrl"
}

# 6.3 Deploy UI Backend Service (Public Ingress, min 1 instance, Private Network)
if ($DeployUI) {
    if (-not $ExecutorUrl) {
        Write-Host "Retrieving existing executor endpoint for UI configuration..."
        $ExecutorUrl = (gcloud run services describe executor-service --region=$Region --format="value(status.url)" -ErrorAction SilentlyContinue)
    }

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
        --set-env-vars="ENV_MODE=$ENV_MODE,DATABASE_URL=$DatabaseURL,TIMEOUT=60,INSPCTA_FILE_BUCKET=$BucketName,UPLOADS_FOLDER=$UPLOADS_FOLDER,BASE_EXECUTOR_URL=$ExecutorUrl" `
        --max-instances=2

    $UiUrl = (gcloud run services describe ui-backend-service --region=$Region --format="value(status.url)")
    Write-Host "============ UI Backend URL: $UiUrl" -ForegroundColor Green
}

# -------------------------------------------------------------
# 7. Configure IAM Security Permissions
# -------------------------------------------------------------
Write-Host "`n[7/7] Setting up secure IAM Roles & service-to-service permissions..." -ForegroundColor Yellow

# Helper to safely add invoker role only if the target service exists
function Add-InvokerPolicy {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServiceName,
        [Parameter(Mandatory = $true)]
        [string]$ServiceAccount
    )
    
    $exists = gcloud run services list --region=$Region --filter="metadata.name=$ServiceName" --format="value(metadata.name)"
    if ($exists) {
        Write-Host "Allowing $ServiceAccount to invoke $ServiceName..."
        try {
            gcloud run services add-iam-policy-binding $ServiceName `
                --region=$Region `
                --member="serviceAccount:$ServiceAccount" `
                --role="roles/run.invoker" `
                --platform=managed `
                --quiet
        }
        catch {
            Write-Warning "Could not bind IAM policy for ${ServiceName}: $_"
        }
    }
    else {
        Write-Host "Service $ServiceName does not exist in region $Region, skipping policy binding."
    }
}

# 7.1 Enable UI service SA to invoke Executor Service
Add-InvokerPolicy -ServiceName "executor-service" -ServiceAccount "ui-service-sa@$ProjectID.iam.gserviceaccount.com"

# 7.2 Enable Executor service SA to invoke Agent Services
Add-InvokerPolicy -ServiceName "agent-audioextract" -ServiceAccount "executor-service-sa@$ProjectID.iam.gserviceaccount.com"
Add-InvokerPolicy -ServiceName "agent-transcribe" -ServiceAccount "executor-service-sa@$ProjectID.iam.gserviceaccount.com"
Add-InvokerPolicy -ServiceName "agent-taskgenerator" -ServiceAccount "executor-service-sa@$ProjectID.iam.gserviceaccount.com"

# 7.2.1 Enable Agent service SAs to read secrets from Secret Manager
Write-Host "Granting secretAccessor permissions for GROQ_API_KEY to transcribe-service-sa..."
gcloud secrets add-iam-policy-binding GROQ_API_KEY `
    --member="serviceAccount:transcribe-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/secretmanager.secretAccessor" `
    --quiet

Write-Host "Granting secretAccessor permissions for OPENAI_API_KEY to taskgen-service-sa..."
gcloud secrets add-iam-policy-binding OPENAI_API_KEY `
    --member="serviceAccount:taskgen-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/secretmanager.secretAccessor" `
    --quiet

# 7.3 Enable UI Service SA to verify Firebase auth tokens (Option A)
# Write-Host "Granting firebaseauth.admin role to ui-service-sa..."
# gcloud projects add-iam-policy-binding $ProjectID `
#     --member="serviceAccount:ui-service-sa@$ProjectID.iam.gserviceaccount.com" `
#     --role="roles/firebaseauth.admin"

# 7.4 Configure Developer / DevOps Access Control
Write-Host "Assigning limited debug and monitoring roles to DevOps user (inspectaGCPViewer): $GcpViewerEmail..."
gcloud projects add-iam-policy-binding $ProjectID `
    --member="user:$GcpViewerEmail" `
    --role="roles/run.viewer"

gcloud projects add-iam-policy-binding $ProjectID `
    --member="user:$GcpViewerEmail" `
    --role="roles/logging.viewer"

gcloud projects add-iam-policy-binding $ProjectID `
    --member="user:$GcpViewerEmail" `
    --role="roles/monitoring.viewer"

Write-Host "Assigning full admin owner permissions to DevOps Admin user (inspectaGCPAdmin): $GcpAdminEmail..."
gcloud projects add-iam-policy-binding $ProjectID `
    --member="user:$GcpAdminEmail" `
    --role="roles/owner"

Write-Host "Granting GCS Bucket permissions to service accounts..."
# Grant Executor SA permissions on the bucket
gcloud storage buckets add-iam-policy-binding gs://$BucketName `
    --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/storage.serviceAccountTokenCreator"   # Permission for creating pre-signed URLs

gcloud storage buckets add-iam-policy-binding gs://$BucketName `
    --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/storage.objectUser"

# Grant Transcribe Agent SA permissions on the bucket
gcloud storage buckets add-iam-policy-binding gs://$BucketName `
    --member="serviceAccount:audio-extractor-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/storage.objectUser"

gcloud storage buckets add-iam-policy-binding gs://$BucketName `
    --member="serviceAccount:transcribe-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/storage.objectUser"

# Grant Task Generator Agent SA permissions on the bucket
gcloud storage buckets add-iam-policy-binding gs://$BucketName `
    --member="serviceAccount:taskgen-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/storage.objectUser"
# -------------------------------------------------------------
# 8. Create GCP Storage Bucket and Set CORS
# -------------------------------------------------------------
Write-Host "`n[8] Setting up Google Cloud Storage Bucket and CORS..." -ForegroundColor Yellow

# Check if bucket exists
$BucketExists = gcloud storage buckets list --filter="name=gs://$BucketName" --format="value(name)"
if (-not $BucketExists) {
    Write-Host "Creating Storage Bucket: gs://$BucketName..."
    gcloud storage buckets create gs://$BucketName --location=$Region
}
else {
    Write-Host "Storage Bucket gs://$BucketName already exists."
}

# Create temporary CORS configuration file
$CorsFilePath = Join-Path $PSScriptRoot "cors-config.json"
$CorsConfig = ConvertTo-Json -InputObject @(
    @{
        origin         = @("https://yourdomain.com", "http://localhost:3000")
        method         = @("PUT", "GET", "POST", "DELETE", "OPTIONS")
        responseHeader = @("Content-Type", "Access-Control-Allow-Origin")
        maxAgeSeconds  = 3600
    }
) -Depth 4

Set-Content -Path $CorsFilePath -Value $CorsConfig -Encoding UTF8

Write-Host "Setting CORS policy on gs://$BucketName..."
gcloud storage buckets update gs://$BucketName --cors-file=$CorsFilePath

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "UI Backend Public URL: $UiUrl" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
gcloud storage buckets update gs://$BucketName --cors-file=$CorsFilePath

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "UI Backend Public URL: $UiUrl" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
