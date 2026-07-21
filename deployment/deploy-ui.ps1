# deploy-ui.ps1
# PowerShell script to deploy UI: installs firebase tools, configures GCP/Firebase services, and logs in using JSON key.
# PS G:\code\Inspecta\UI\inspecta-dashboard> G:\code\Inspecta\deployment\deploy-ui.ps1 -firebaseprojectid "inspecta-ai" -jsonkeyfile "G:\code\Inspecta\deployment\inspecta-ai-firebase-adminsdk-fbsvc-895e11e210.json"
[CmdletBinding(DefaultParameterSetName = "DeploySet")]
param (
    [Parameter(Mandatory = $true, ParameterSetName = "HelpSet")]
    [Alias("h", "help", "?")]
    [switch]$ShowHelp,

    [Parameter(Mandatory = $true, ParameterSetName = "DeploySet")]
    [string]$FirebaseProjectId,

    [Parameter(Mandatory = $true, ParameterSetName = "DeploySet")]
    [string]$JsonKeyFile,

    [Parameter(Mandatory = $false, ParameterSetName = "DeploySet")]
    [string]$GcpProjectId,

    [Parameter(Mandatory = $false, ParameterSetName = "DeploySet")]
    [string]$BackendProjectID,

    [Parameter(Mandatory = $false, ParameterSetName = "DeploySet")]
    [switch]$SkipGcpSetup
)

# Display help message if requested
if ($PsCmdlet.ParameterSetName -eq "HelpSet" -or $ShowHelp) {
    Write-Host "`nUsage: .\deploy-ui.ps1 -FirebaseProjectId <id> -JsonKeyFile <path> [-GcpProjectId <id>]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Parameters:"
    Write-Host "  -FirebaseProjectId   Target Firebase Project ID"
    Write-Host "  -JsonKeyFile         Path to Firebase Admin / GCP JSON key file"
    Write-Host "  -GcpProjectId        (Optional) Target Google Cloud Project ID. Defaults to FirebaseProjectId if omitted."
    Write-Host "  -BackendProjectID    (Optional) Target Backend Google Cloud Project ID. Defaults to inspecta-backend if omitted."
    Write-Host "  -Help / -h           Show this help documentation"
    exit 0
}

# Set execution policy for the process scope to ensure scripts can run
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force

# Validate current directory
$CurrentDirName = Split-Path -Leaf $pwd
if ($CurrentDirName -ne "inspecta-dashboard" -and $CurrentDirName -ne "inspecta_dashboard") {
    Write-Error "This script must be run from the 'inspecta-dashboard' directory. Current directory is '$CurrentDirName'."
    exit 1
}

# Set GCP project ID default if not provided
if ([string]::IsNullOrEmpty($GcpProjectId)) {
    $GcpProjectId = $FirebaseProjectId
    Write-Host "[*] GCP Project ID not specified. Defaulting to Firebase Project ID: $GcpProjectId" -ForegroundColor Yellow
}

if ([string]::IsNullOrEmpty($BackendProjectID)) {
    $BackendProjectID = "inspecta-backend"
    Write-Host "[*] Backend Project ID not specified. Defaulting to inspecta-backend: $BackendProjectID" -ForegroundColor Yellow
}


# 1. Install firebase tools if not installed already
Write-Host "`n[*] Checking if Firebase CLI is installed..." -ForegroundColor Cyan
$FirebaseInstalled = $false
try {
    $FirebasePath = Get-Command firebase -ErrorAction SilentlyContinue
    if ($FirebasePath) {
        $FirebaseInstalled = $true
        Write-Host "[+] Firebase CLI is already installed." -ForegroundColor Green
    }
}
catch {}

if (-not $FirebaseInstalled) {
    Write-Host "[*] Firebase CLI not found. Attempting to install it globally via npm..." -ForegroundColor Yellow
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Error "npm is not installed or not in PATH. Please install Node.js/npm and try again."
        exit 1
    }
    & npm install -g firebase-tools
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install firebase-tools via npm."
        exit 1
    }
    Write-Host "[+] Firebase CLI installed successfully." -ForegroundColor Green
}

# 2. Firebase and GCP login / authentication using JSON key file
if (-not [string]::IsNullOrEmpty($JsonKeyFile)) {
    if (-not (Test-Path $JsonKeyFile)) {
        Write-Error "JSON key file not found at path: $JsonKeyFile"
        exit 1
    }
    $AbsoluteKeyPath = (Resolve-Path $JsonKeyFile).Path
    Write-Host "`n[*] Authenticating Firebase and gcloud with JSON key: $AbsoluteKeyPath" -ForegroundColor Cyan

    # Set GOOGLE_APPLICATION_CREDENTIALS for firebase commands
    $env:GOOGLE_APPLICATION_CREDENTIALS = $AbsoluteKeyPath
    Write-Host "[+] GOOGLE_APPLICATION_CREDENTIALS env variable set to key path." -ForegroundColor Green

    # Authenticate gcloud if gcloud is installed
    if (Get-Command gcloud -ErrorAction SilentlyContinue) {
        # Bootstrap service account permissions using current active user session
        Write-Host "`n[*] Bootstrapping service account permissions using active admin session..." -ForegroundColor Cyan
        
        $KeyContent = Get-Content -Raw -Path $AbsoluteKeyPath | ConvertFrom-Json
        $SaEmail = $KeyContent.client_email.ToString().Trim()
        Write-Host "[+] Extracted Service Account Email: $SaEmail" -ForegroundColor Green

        # # Check if the active account is already the service account
        # $ActiveAccount = (& gcloud config get-value account 2>$null)
        # if ($ActiveAccount) {
        #     $ActiveAccount = $ActiveAccount.ToString().Trim()
        # }
        # if ($ActiveAccount -eq $SaEmail) {
        #     Write-Warning "The active gcloud account is already the service account ($SaEmail)."
        #     Write-Warning "A service account cannot grant permissions to itself."
        #     $Confirm = Read-Host "Would you like to run 'gcloud auth login' to switch to your Administrator account? (Y/N)"
        #     if ($Confirm -eq 'Y' -or $Confirm -eq 'y') {
        #         & gcloud auth login
        #         if ($LASTEXITCODE -ne 0) {
        #             Write-Error "Admin login failed."
        #             exit 1
        #         }
        #     } else {
        #         Write-Error "Cannot bootstrap using the service account's own credentials. Exiting."
        #         exit 1
        #     }
        # }

        # Attempt to grant roles
        Write-Host "[*] Granting 'Service Usage Admin' to service account..." -ForegroundColor Yellow
        & gcloud projects add-iam-policy-binding $GcpProjectId --member="serviceAccount:$SaEmail" --role="roles/serviceusage.serviceUsageAdmin" --quiet 2>&1
        $Grant1Status = $LASTEXITCODE

        Write-Host "[*] Granting 'Project IAM Admin' to service account..." -ForegroundColor Yellow
        & gcloud projects add-iam-policy-binding $GcpProjectId --member="serviceAccount:$SaEmail" --role="roles/resourcemanager.projectIamAdmin" --quiet 2>&1
        $Grant2Status = $LASTEXITCODE

        if ($Grant1Status -ne 0 -or $Grant2Status -ne 0) {
            Write-Warning "Failed to automatically bootstrap permissions using the current session."
            $Confirm = Read-Host "Would you like to run 'gcloud auth login' to authenticate as an Admin now? (Y/N)"
            if ($Confirm -eq 'Y' -or $Confirm -eq 'y') {
                & gcloud auth login
                if ($LASTEXITCODE -ne 0) {
                    Write-Error "Admin login failed."
                    exit 1
                }
                
                # Retry
                Write-Host "[*] Retrying permission assignment..." -ForegroundColor Yellow
                & gcloud projects add-iam-policy-binding $GcpProjectId --member="serviceAccount:$SaEmail" --role="roles/serviceusage.serviceUsageAdmin" --quiet
                $Retry1 = $LASTEXITCODE
                & gcloud projects add-iam-policy-binding $GcpProjectId --member="serviceAccount:$SaEmail" --role="roles/resourcemanager.projectIamAdmin" --quiet
                $Retry2 = $LASTEXITCODE

                if ($Retry1 -ne 0 -or $Retry2 -ne 0) {
                    Write-Error "Failed to grant required bootstrap permissions to the service account even after logging in. Please check your admin privileges."
                    exit 1
                }
            }
            else {
                Write-Error "Permissions could not be bootstrapped. Stopping execution."
                exit 1
            }
        }
        Write-Host "[+] Permissions bootstrapped successfully." -ForegroundColor Green

        Write-Host "[*] Authenticating gcloud service account..." -ForegroundColor Yellow
        & gcloud auth activate-service-account --key-file="$AbsoluteKeyPath" --quiet
        if ($LASTEXITCODE -ne 0) {
            Write-Error "gcloud service account activation failed."
            exit 1
        }
        & gcloud config set project $GcpProjectId --quiet
        Write-Host "[+] gcloud authenticated and active project set to: $GcpProjectId" -ForegroundColor Green
    }
    else {
        Write-Warning "gcloud CLI not found in PATH. Skipping gcloud service account activation."
    }

    # Verify firebase login work
    firebase use inspecta-ai
    Write-Host "[*] Verifying Firebase login works..." -ForegroundColor Yellow
    & firebase projects:list --non-interactive
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Firebase login verification failed using the provided JSON key."
        exit 1
    }
    Write-Host "[+] Firebase authentication verified successfully." -ForegroundColor Green
}
else {
    Write-Host "`n[!] No JSON key file provided. Relying on active/cached CLI login sessions." -ForegroundColor Yellow
    if (Get-Command gcloud -ErrorAction SilentlyContinue) {
        & gcloud config set project $GcpProjectId --quiet
    }
    & firebase projects:list --non-interactive > $null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "No active firebase session found. Please run 'firebase login' or specify a -JsonKeyFile."
        exit 1
    }
}

# 3. Enable GCP Services & 4. Assign Roles (Can be skipped if already configured)
if (-not $SkipGcpSetup) {
    Write-Host "`n[*] Enabling required GCP services on project '$GcpProjectId' in batch..." -ForegroundColor Cyan
    if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
        Write-Error "gcloud CLI is required to enable GCP services but was not found in PATH."
        exit 1
    }

    $ServicesToEnable = @(
        "compute.googleapis.com",
        "artifactregistry.googleapis.com",
        "cloudaicompanion.googleapis.com",
        "cloudapis.googleapis.com",
        "cloudbilling.googleapis.com",
        "cloudbuild.googleapis.com",
        "cloudfunctions.googleapis.com",
        "cloudresourcemanager.googleapis.com",
        "cloudtrace.googleapis.com",
        "developerconnect.googleapis.com",
        "eventarc.googleapis.com",
        "firebase.googleapis.com",
        "firebaseappdistribution.googleapis.com",
        "firebaseapphosting.googleapis.com",
        "firebasehosting.googleapis.com",
        "firebaseinstallations.googleapis.com",
        "firebaseremoteconfig.googleapis.com",
        "firebaseremoteconfigrealtime.googleapis.com",
        "firebaserules.googleapis.com",
        "run.googleapis.com",
        "servicemanagement.googleapis.com",
        "serviceusage.googleapis.com",
        "storage-api.googleapis.com",
        "storage-component.googleapis.com",
        "storage.googleapis.com",
        "logging.googleapis.com"
    )

    # Try enabling all services in a single batch call to save time using splatting
    Write-Host "[*] Attempting to batch-enable GCP services..." -ForegroundColor Yellow
    $ServiceArgs = $ServicesToEnable + @("--project", $GcpProjectId, "--quiet")
    & gcloud services enable @ServiceArgs 2>$null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Batch service enablement failed. Falling back to enabling services individually..."
        foreach ($Service in $ServicesToEnable) {
            Write-Host "[*] Enabling service: $Service..." -ForegroundColor Yellow
            & gcloud services enable $Service --project $GcpProjectId --quiet 2>$null
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Could not enable service: $Service (this might be expected depending on your subscription/region)."
            }
        }
    }
    Write-Host "[+] Required services enabled successfully on project '$GcpProjectId'." -ForegroundColor Green

    $SaEmail = "firebase-adminsdk-fbsvc@$FirebaseProjectId.iam.gserviceaccount.com"
    Write-Host "`n[*] Assigning roles to default compute service account: $SaEmail..." -ForegroundColor Cyan

    $RolesToAssign = @(
        "roles/artifactregistry.writer",
        "roles/cloudbuild.builds.editor",
        "roles/cloudfunctions.admin",
        "roles/cloudfunctions.developer",
        "roles/cloudfunctions.viewer",
        "roles/cloudfunctions.editor",
        "roles/run.admin",
        "roles/firebase.admin",
        "roles/firebaseauth.admin",
        "roles/firebase.developAdmin",
        "roles/iam.serviceAccountTokenCreator",
        "roles/iam.serviceAccountUser"
    )

    foreach ($Role in $RolesToAssign) {
        Write-Host "[*] Assigning role '$Role'..." -ForegroundColor Yellow
        & gcloud projects add-iam-policy-binding $GcpProjectId --member="serviceAccount:$SaEmail" --role="$Role" --quiet > $null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Failed to assign role '$Role' to service account '$SaEmail'."
        }
    }
    Write-Host "`n[+] Service account roles assigned successfully." -ForegroundColor Green
}
else {
    Write-Host "`n[*] -SkipGcpSetup flag passed. Skipping GCP Service enablement and role bindings." -ForegroundColor Yellow
}

# Write-Host "`n[*] Granting permission to backend GCP to access Firebase data" -ForegroundColor Cyan
# gcloud projects add-iam-policy-binding $BackendProjectID `
#     --member="serviceAccount:$SaEmail" `
#     --role="roles/iam.serviceAccountUser" `
#     --quiet

# gcloud projects add-iam-policy-binding $BackendProjectID `
#     --member="serviceAccount:$SaEmail" `
#     --role="roles/firebase.admin" `
#     --quiet

# Clear out the old compiler cache from the previous build if it exists
if (Test-Path ".next") {
    Remove-Item -Recurse -Force .next
}
if (Test-Path "out") {
    Remove-Item -Recurse -Force out
}

# Set new Environment variables
$env:NEXT_PUBLIC_FIREBASE_API_KEY = "AIzaSyCZPe2j-rji_vufMOIhKwxtfgXW6hOpIuI"
$env:NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "inspecta-ai.firebaseapp.com"
$env:NEXT_PUBLIC_FIREBASE_PROJECT_ID = "inspecta-ai"
$env:NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "inspecta-ai.firebasestorage.app"
$env:NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "809906015149"
$env:NEXT_PUBLIC_FIREBASE_APP_ID = "1:809906015149:web:49dbd61c0cb1b688c16f24"
$env:NEXT_PUBLIC_BACKEND_URL = "https://ui-backend-service-860462670211.us-central1.run.app"

# Copy .env.production to .env.production.local so production config takes precedence over .env.local during build
# $CreatedProdLocal = $false
# if (Test-Path ".env.production") {
#     Write-Host "[*] Copying .env.production to .env.production.local..." -ForegroundColor Yellow
#     Copy-Item -Path ".env.production" -Destination ".env.production.local" -Force
#     $CreatedProdLocal = $true
# }

npx firebase-tools use inspecta-ai
    
# Build Next.js project to generate the static export (out/ folder)
$env:NODE_ENV = "production"    
Write-Host "`n[*] Building Next.js application (generating static export)..." -ForegroundColor Cyan
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Next.js build failed."
    exit 1
}

# 5. Deploy Next.js Application from current directory to the firebase project
Write-Host "`n[*] Starting Next.js Firebase Hosting deployment from directory ($pwd)..." -ForegroundColor Cyan

# Ensure firebase.json is available in the current directory
$FirebaseJsonPath = Join-Path $pwd "firebase.json"
if (-not (Test-Path $FirebaseJsonPath)) {
    Write-Error "firebase.json was not found in the current directory ($pwd). Please run this script from your Next.js application root directory or ensure firebase.json is present."
    exit 1
}

# Update site name in firebase.json to match GCP project ID
Write-Host "[*] Updating site name in firebase.json to: $GcpProjectId" -ForegroundColor Yellow
$JsonObj = Get-Content -Raw -Path $FirebaseJsonPath | ConvertFrom-Json
if ($JsonObj.hosting -is [array]) {
    $JsonObj.hosting[0].site = $GcpProjectId
}
else {
    $JsonObj.hosting.site = $GcpProjectId
}
$JsonObj | ConvertTo-Json -Depth 10 | Set-Content -Path $FirebaseJsonPath

# Skip adding Content-Security-Policy (CSP) to firebase.json to respect user preference (disabled for trial runs)

# Enable webframeworks experiment
Write-Host "[*] Enabling Firebase Web Frameworks experiment..." -ForegroundColor Yellow
& firebase experiments:enable webframeworks --non-interactive
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to enable firebase webframeworks experiment."
}

# Create .firebaserc pointing to target project if not exists
$FirebasercPath = Join-Path $pwd ".firebaserc"
if (-not (Test-Path $FirebasercPath)) {
    Write-Host "[*] Creating .firebaserc pointing to project '$FirebaseProjectId'..." -ForegroundColor Yellow
    $FirebasercContent = @{
        projects = @{
            default = $FirebaseProjectId
        }
    } | ConvertTo-Json
    Set-Content -Path $FirebasercPath -Value $FirebasercContent
}

$AbsNewKeyPath = [System.IO.Path]::GetFullPath($JsonKeyFile)
$env:GOOGLE_APPLICATION_CREDENTIALS = $AbsNewKeyPath
[Environment]::SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", $AbsNewKeyPath, "User")
npx firebase-tools use $GcpProjectId --alias default

Write-Host "[*] Triggering Firebase deployment..." -ForegroundColor Yellow
& firebase deploy --only hosting --project $FirebaseProjectId
if ($LASTEXITCODE -ne 0) {
    Write-Error "Firebase deployment failed."
    exit 1
}

Write-Host "`n[+] Next.js application deployed successfully to Firebase!" -ForegroundColor Green
Write-Host "🎉 Setup and deployment completed successfully!" -ForegroundColor Green

# npx firebase-tools functions:artifacts:setpolicy
Write-Host "`n[*] Setting up artifact registry cleanup policy..." -ForegroundColor Yellow
& firebase functions:artifacts:setpolicy --days 1 --location "us-central1" --non-interactive
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to set up artifact registry cleanup policy."
}

# ==========  If you wan to use the same docker image created during web build =============
# gcloud auth configure-docker

# Pull the exact container image down from Google Cloud
# docker pull gcr.io/your-gcp-project-id/ui-backend-service:latest

# Run it locally, mapping port 3000 of the container to port 3000 on your laptop
# docker run -p 3000:3000 gcr.io/your-gcp-project-id/ui-backend-service:latest