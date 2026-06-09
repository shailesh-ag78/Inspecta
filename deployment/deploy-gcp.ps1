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
    .\deploy-gcp.ps1 -ProjectID "my-inspecta-project" -DatabaseURL "postgresql://user:pass@ep-pooler.neon.tech/dbname" -GcpViewerEmail "devops1@example.com" -GcpAdminEmail "devops2@example.com"
#>
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
    [string]$GcpAdminEmail
)

$ErrorActionPreference = "Stop"

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
    "iam.googleapis.com"
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
    @{ Name = "executor-service-sa"; Display = "LangChain Executor Service SA" }
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
$RegistryExists = gcloud artifacts repositories list --location=$Region --filter="name=$RegistryName" --format="value(name)"
if (-not $RegistryExists) {
    Write-Host "Creating Artifact Registry repository: $RegistryName..."
    gcloud artifacts repositories create $RegistryName `
        --repository-format=docker `
        --location=$Region `
        --description="Docker repository for Inspecta services"
}
else {
    Write-Host "Artifact Registry $RegistryName already exists."
}

Write-Host "Configuring Docker authentication..."
gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet

# -------------------------------------------------------------
# 5. Build, Tag, and Push Docker Images
# -------------------------------------------------------------
Write-Host "`n[5/7] Building and pushing Docker container images..." -ForegroundColor Yellow

# Navigate to the workspace root directory (one folder up from deployment/)
$OriginalDir = Get-Location
Set-Location "$PSScriptRoot\.."

$Services = @(
    @{ Target = "Agent-audioextract"; DockerfilePath = "AudioExtractorAgent/Dockerfile" },
    @{ Target = "Agent-transcribe"; DockerfilePath = "TranscriptionAgent/Dockerfile" },
    @{ Target = "Agent-taskgenerator"; DockerfilePath = "FieldReporterAgent/Dockerfile" },
    @{ Target = "executor"; DockerfilePath = "Executor/Dockerfile" },
    @{ Target = "ui-backend"; DockerfilePath = "UI/backend/Dockerfile" }
)

foreach ($Svc in $Services) {
    $Tag = "$Region-docker.pkg.dev/$ProjectID/$RegistryName/$($Svc.Target):latest"
    Write-Host "`nBuilding $($Svc.Target) Docker Image..." -ForegroundColor Cyan
    docker build -t $Tag -f $($Svc.DockerfilePath) .
    
    Write-Host "Pushing $Tag to Artifact Registry..." -ForegroundColor Cyan
    docker push $Tag
}

# Return to script directory
Set-Location $OriginalDir

# -------------------------------------------------------------
# 6. Deploy Services to Cloud Run
# -------------------------------------------------------------
Write-Host "`n[6/7] Deploying microservices to Cloud Run..." -ForegroundColor Yellow

$RegistryUri = "$Region-docker.pkg.dev/$ProjectID/$RegistryName"

# 6.1 Deploy 3 Agents (Internal Ingress, Scale to Zero, Private Network)
Write-Host "Deploying Agent-audioextract (AudioExtractor)..." -ForegroundColor Cyan
gcloud run deploy Agent-audioextract `
    --image="$RegistryUri/Agent-audioextract:latest" `
    --region=$Region `
    --ingress=internal `
    --no-allow-unauthenticated `
    --min-instances=0 `
    --network=$VpcName `
    --subnet=$SubnetName `
    --vpc-egress=private-ranges-only `
    --max-instances=2

Write-Host "Deploying Agent-transcribe (Transcription)..." -ForegroundColor Cyan
gcloud run deploy Agent-transcribe `
    --image="$RegistryUri/Agent-transcribe:latest" `
    --region=$Region `
    --ingress=internal `
    --no-allow-unauthenticated `
    --min-instances=0 `
    --network=$VpcName `
    --subnet=$SubnetName `
    --vpc-egress=private-ranges-only `
    --max-instances=2

Write-Host "Deploying Agent-taskgenerator (FieldReporter)..." -ForegroundColor Cyan
gcloud run deploy Agent-taskgenerator `
    --image="$RegistryUri/Agent-taskgenerator:latest" `
    --region=$Region `
    --ingress=internal `
    --no-allow-unauthenticated `
    --min-instances=0 `
    --network=$VpcName `
    --subnet=$SubnetName `
    --vpc-egress=private-ranges-only `
    --max-instances=2

# Fetch Agent URLs
Write-Host "Retrieving agent endpoints..."
$AgentAudioExtractUrl = (gcloud run services describe Agent-audioextract --region=$Region --format="value(status.url)")
$AgentTranscribeUrl = (gcloud run services describe Agent-transcribe --region=$Region --format="value(status.url)")
$AgentTaskGeneratorUrl = (gcloud run services describe Agent-taskgenerator --region=$Region --format="value(status.url)")

Write-Host "Agent-AudioExtract: $AgentAudioExtractUrl"
Write-Host "Agent-Transcription: $AgentTranscribeUrl"
Write-Host "Agent-TaskGenerator: $AgentTaskGeneratorUrl"

# 6.2 Deploy Executor Service (Internal Ingress, min 1 instance, 900s timeout, Private Network)
Write-Host "Deploying executor-service..." -ForegroundColor Cyan
gcloud run deploy executor-service `
    --image="$RegistryUri/executor:latest" `
    --region=$Region `
    --ingress=internal `
    --no-allow-unauthenticated `
    --min-instances=1 `
    --timeout=900 `
    --network=$VpcName `
    --subnet=$SubnetName `
    --vpc-egress=private-ranges-only `
    --service-account="executor-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --set-env-vars="DATABASE_URL=$DatabaseURL,AGENT_AUDIOEXTRACT_URL=$AgentAudioExtractUrl,AGENT_TRANSCRIBE_URL=$AgentTranscribeUrl,AGENT_TASKGENERATOR_URL=$AgentTaskGeneratorUrl,ENV_MODE=production" `
    --max-instances=2

# Fetch Executor URL
Write-Host "Retrieving executor endpoint..."
$ExecutorUrl = (gcloud run services describe executor-service --region=$Region --format="value(status.url)")
Write-Host "Executor URL: $ExecutorUrl"

# 6.3 Deploy UI Backend Service (Public Ingress, min 1 instance, Private Network)
Write-Host "Deploying ui-backend-service..." -ForegroundColor Cyan
gcloud run deploy ui-backend-service `
    --image="$RegistryUri/ui-backend:latest" `
    --region=$Region `
    --ingress=all `
    --allow-unauthenticated `
    --min-instances=1 `
    --network=$VpcName `
    --subnet=$SubnetName `
    --vpc-egress=private-ranges-only `
    --service-account="ui-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --set-env-vars="db_dsn=$DatabaseURL,EXECUTOR_SERVICE_URL=$ExecutorUrl,ENV_MODE=production" `
    --max-instances=2

$UiUrl = (gcloud run services describe ui-backend-service --region=$Region --format="value(status.url)")
Write-Host "UI Backend URL: $UiUrl" -ForegroundColor Green

# -------------------------------------------------------------
# 7. Configure IAM Security Permissions
# -------------------------------------------------------------
Write-Host "`n[7/7] Setting up secure IAM Roles & service-to-service permissions..." -ForegroundColor Yellow

# 7.1 Enable UI service SA to invoke Executor Service
Write-Host "Allowing ui-service-sa to invoke executor-service..."
gcloud run services add-iam-policy-binding executor-service `
    --region=$Region `
    --member="serviceAccount:ui-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/run.invoker" `
    --platform=managed

# 7.2 Enable Executor service SA to invoke Agent Services
Write-Host "Allowing executor-service-sa to invoke Agent-audioextract, Agent-transcribe, and Agent-taskgenerator..."
gcloud run services add-iam-policy-binding Agent-audioextract `
    --region=$Region `
    --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/run.invoker" `
    --platform=managed

gcloud run services add-iam-policy-binding Agent-transcribe `
    --region=$Region `
    --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/run.invoker" `
    --platform=managed

gcloud run services add-iam-policy-binding Agent-taskgenerator `
    --region=$Region `
    --member="serviceAccount:executor-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/run.invoker" `
    --platform=managed

# 7.3 Enable UI Service SA to verify Firebase auth tokens (Option A)
Write-Host "Granting firebaseauth.admin role to ui-service-sa..."
gcloud projects add-iam-policy-binding $ProjectID `
    --member="serviceAccount:ui-service-sa@$ProjectID.iam.gserviceaccount.com" `
    --role="roles/firebaseauth.admin"

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

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "UI Backend Public URL: $UiUrl" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
