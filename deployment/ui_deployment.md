Here is your finalized, end-to-end production deployment guide, tailored specifically for your Next.js framework architecture.Phase 1: Code & Environment ConfigurationUnlike a standard React app, Next.js requires specific naming conventions for client-visible variables and abstracts the HTML canvas completely into its layout engine.Task 1: Verify Production Environment Variables[ ] Open your .env.production file in your project's root directory.[ ] Ensure your backend Cloud Run target uses the mandatory NEXT_PUBLIC_ prefix so it is accessible to the browser:Code snippetNEXT_PUBLIC_BACKEND_URL=https://ui-backend-service-860462670211.us-central1.run.app
Task 2: Configure the Mobile Viewport Meta-Object[ ] Open your root layout file (typically src/app/layout.js or src/app/layout.tsx).[ ] Export a viewport configuration object at the top level. Next.js will automatically compile this into the correct HTML meta tags to prevent mobile browsers from rendering a zoomed-out desktop view:JavaScriptexport const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Disables awkward double-tap zooming on mobile sites
}
Phase 2: Firebase Hosting Initialization for Next.jsBecause Next.js contains native optimization logic, the modern Firebase CLI will automatically detect the framework and configure advanced internal routing for you.Task 3: Initialize the Project Workspace[ ] Open your PowerShell terminal and navigate to your Next.js project root folder.[ ] Log in and initialize the workspace matching your authentication profile:PowerShellfirebase login
firebase init hosting
[ ] Respond to the CLI setup prompts exactly like this:Detected Next.js codebase: The CLI will prompt: "Detected an existing Next.js codebase. Do you want to use it?" Type Yes (This tells Firebase to handle Next.js builds natively).Project Setup: Select Use an existing project and pick your project ID (inspecta-495004).Region: Select the same region where your Cloud Run services live (e.g., us-central1).Phase 3: Building and Deploying to the InternetTask 4: Execute the Production Compilation[ ] Compile your Next.js application. The compiler will bake your NEXT_PUBLIC_BACKEND_URL environment variables straight into the production JavaScript bundles:PowerShellnpm run build
Task 5: Push Assets Live[ ] Deploy the compiled application package onto Google's global Edge network:PowerShellfirebase deploy --only hosting
[ ] Save Your URLs: Note down the system-generated live domains provided in your terminal success output (e.g., https://inspecta-495004.web.app).Phase 4: Realigning Cloud Security & CORS BoundariesBecause your web interface is now broadcasting from a real domain instead of localhost:3000, your external GCP cloud services will block inbound traffic until you whitelist the new domain.Task 6: Whitelist Domain in Firebase Authentication[ ] Go to the Firebase Console $\rightarrow$ Authentication $\rightarrow$ Settings tab.[ ] Select Authorized Domains in the left menu, click Add Domain, and add your new inspecta-495004.web.app domain so your Google OIDC sign-in flow functions seamlessly.Task 7: Update FastAPI CORS Setup[ ] In your UI Backend/Executor codebase, open your FastAPI configuration and update the allow_origins array to permit traffic from your new live URL, then re-deploy to Cloud Run:Pythonorigins = [
    "http://localhost:3000",
    "https://inspecta-495004.web.app",
    "https://inspecta-495004.firebaseapp.com"
]
Task 8: Synchronize Google Cloud Storage (GCS) CORS Policies[ ] Open your local cors-config.json configuration file and add your production domain tracking strings:JSON[
  {
    "origin": [
      "http://localhost:3000",
      "https://inspecta-495004.web.app",
      "https://inspecta-495004.firebaseapp.com"
    ],
    "method": ["GET", "PUT", "OPTIONS"],
    "responseHeader": ["Content-Type", "Authorization", "X-Firebase-Token"],
    "maxAgeSeconds": 3600
  }
]
[ ] Push the security configuration straight onto your storage repository bucket using PowerShell:PowerShellgcloud storage buckets update gs://inspecta-file-bucket --cors-file=cors-config.json
Phase 5: Mobile Device Operational Check[ ] Open Safari on iOS or Chrome on Android and load https://inspecta-495004.web.app.[ ] Verify that the user interface fits tightly to the margins of the screen with no horizontal scrolling.[ ] Execute a live authentication sign-in and run a sample video clip sequence to ensure that the pre-signed URL upload/playback pipeline renders flawlessly over a cellular data network.

Create a Hosting "Site ID" Alias (Recommended & Easiest)
Firebase allows you to add multiple separate hosting sites inside the same project. This lets you generate a brand new *.web.app subdomain without creating a new project or moving your database.

Go to the Firebase Console and select your project.

Navigate to Hosting in the left sidebar.

Scroll down to the bottom of the page to the Advanced section and click Add another site.

Type in your desired name (e.g., inspecta-app, inspecta-field, etc.).

If it's available, Google will instantly grant you https://inspecta-<bettername>.web.app.

Update your local firebase.json or run a targeted deploy target command to push your Next.js build straight to this new alias slot:

PowerShell
firebase deploy --only hosting:<your-new-site-id>

Commands executed (in powershell)
- npm install -g firebase-tools
- Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
- npm install firebase
- firebase login
  -- Login through browser : sa.socialprofile@gmail.com

  4/0AdkVLPznfrooXkgsxDhj4kdcKuP_TbzAYirv3LmSCBQvAPqTAf8VreBzpGtfYqt779D_Yw
- 

python deploy_ui.py --project inspecta-495004 --key gcp-key.json

python deploy_ui.py --project inspecta-360 --key inspecta-360-firebase-adminsdk-fbsvc-bd599894b5.json