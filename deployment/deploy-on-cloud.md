0. Enable Service : compute.googleapis.com

1. Enable other Services
artifactregistry.googleapis.com
cloudaicompanion.googleapis.com
cloudapis.googleapis.com
cloudbilling.googleapis.com
cloudbuild.googleapis.com
cloudfunctions.googleapis.com
cloudresourcemanager.googleapis.com
cloudtrace.googleapis.com
developerconnect.googleapis.com
eventarc.googleapis.com
firebase.googleapis.com
firebaseappdistribution.googleapis.com
firebaseapphosting.googleapis.com
firebasehosting.googleapis.com
firebaseinstallations.googleapis.com
firebaseremoteconfig.googleapis.com
firebaseremoteconfigrealtime.googleapis.com
firebaserules.googleapis.com
run.googleapis.com
servicemanagement.googleapis.com
serviceusage.googleapis.com
source.googleapis.com
storage-api.googleapis.com
storage-component.googleapis.com
storage.googleapis.com
logging.googleapis.com

2. Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process .\ui-deploy-firebase.ps1

3. Ensure inspecta-360-uideployment.json key file for Firebase has been created

4. Adding role to service accounts: GCP Project number : 724532306322
Default compute service account : 724532306322-compute@developer.gserviceaccount.com

firebase-adminsdk-fbsvc@inspecta-360.iam.gserviceaccount.com
Appengine Deployer
Artifact Registry Writer
Cloud Build Editor : Can create and cancel builds
Cloud Build Editor : Editor role for Cloud Build
Cloud Functions Admin
Cloud Functions Developer
Cloud Functions Editor
Cloud Functions Viewer
Cloud Run Admin
Firebase Admin SDK Administration
Firebase Authentication Admin
Firebase Develop Admin
Firebase Hosting Admin
Service Account Token Creator
Service Account User


- created a new project in Firebase: inspecta-ai
	-- unchecked option of running Google Analytics
- Added authentication of Google (Using Authentication -> SingIn menu option)
- Add users and make admin settings using Python script
	-- python .\firebaseuser.py --key .\inspecta-ai-firebase-adminsdk-fbsvc-895e11e210.json add  --email sa.socialprofile@gmail.com --company_id 3 --storage_id 3
- Following permissions are needed for firebase-adminsdk-fbsvc@inspecta-ai.iam.gserviceaccount.com service account. Provision has been made in the script to add else use following scripts to give permissions manually


# 1. Allow the service account to enable APIs:
gcloud projects add-iam-policy-binding inspecta-ai `
  --member="serviceAccount:firebase-adminsdk-fbsvc@inspecta-ai.iam.gserviceaccount.com" `
  --role="roles/serviceusage.serviceUsageAdmin"

# 2. Allow the service account to assign IAM roles:
gcloud projects add-iam-policy-binding inspecta-ai `
  --member="serviceAccount:firebase-adminsdk-fbsvc@inspecta-ai.iam.gserviceaccount.com" `
  --role="roles/resourcemanager.projectIamAdmin"

