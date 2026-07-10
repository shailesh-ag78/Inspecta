import os
import sys
import json
import argparse
import subprocess
import shutil
from typing import Optional

# -------------------------------------------------------------
# 1. CONSTANTS AND PATH RESOLUTION
# -------------------------------------------------------------
DEFAULT_PROJECT_ID = "inspecta-360"
DEFAULT_KEY_FILE = "inspecta-360-firebase-adminsdk-fbsvc-bd599894b5.json"
DEFAULT_UI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "UI", "inspecta-dashboard"))
DEFAULT_REGION = "us-central1"

# -------------------------------------------------------------
# 2. UTILITY FUNCTIONS
# -------------------------------------------------------------
def log_info(msg):
    print(f"[*] {msg}")

def log_success(msg):
    print(f"[+] {msg}")

def log_warning(msg):
    print(f"[!] Warning: {msg}")

def log_step(msg):
    print(f"\n{'='*20}\n[STEP] {msg}\n{'='*20}")

def log_error(msg):
    print(f"[!] Error: {msg}", file=sys.stderr)

def check_command(cmd):
    """Checks if a command-line tool is available in the system path."""
    return shutil.which(cmd) is not None

def run_command(cmd_args, cwd, capture_output=False):
    """Executes a command and handles errors."""
    log_info(f"Executing: {' '.join(cmd_args)}")
    try:
        # Use shell=True on Windows to correctly resolve commands like 'npm'
        use_shell = sys.platform == "win32"
        result = subprocess.run(
            cmd_args, cwd=cwd, check=True, shell=use_shell,
            capture_output=capture_output, text=True, encoding='utf-8'
        )
        if capture_output:
            return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        log_error(f"Command failed: {' '.join(cmd_args)}")
        if e.stdout:
            log_error(f"STDOUT: {e.stdout}")
        if e.stderr:
            log_error(f"STDERR: {e.stderr}")
        raise

# -------------------------------------------------------------
# 3. CORE DEPLOYMENT LOGIC
# -------------------------------------------------------------
def configure_auth(key_file: Optional[str]) -> Optional[str]:
    """
    Configures authentication for the Firebase CLI.
    If a service account key is provided, it sets the GOOGLE_APPLICATION_CREDENTIALS
    environment variable, which the CLI uses for programmatic authentication.
    If no key is provided, it verifies an active 'firebase login' session.
    """
    # If a key_file is provided, validate its path.
    if key_file and not os.path.exists(key_file):
        # If not found, check if it exists relative to the script's directory.
        script_relative_key = os.path.join(os.path.dirname(__file__), key_file)
        if os.path.exists(script_relative_key):
            key_file = script_relative_key
        else:
            log_error(f"Service account key file not found at path: {key_file}")
            sys.exit(1)
            
    if key_file:
        abs_key_path = os.path.abspath(key_file)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = abs_key_path
        log_success(f"Configured GOOGLE_APPLICATION_CREDENTIALS to: {abs_key_path}")
        log_info("Firebase CLI will now use this service account for authentication.")
    else:
        log_warning("No service account key provided. Falling back to check for an active 'firebase login' session.")
        try:
            run_command(["firebase", "projects:list"], cwd=".", capture_output=True)
            log_success("Firebase CLI session is active.")
        except subprocess.CalledProcessError:
            log_error("Firebase login required. Please run 'firebase login' and try again.")
            sys.exit(1)
    return key_file

def configure_firebase_files(ui_dir: str, project_id: str, region: str):
    """Generates the .firebaserc and firebase.json files required for deployment."""
    if not os.path.exists(ui_dir):
        log_error(f"Next.js UI directory not found: {ui_dir}")
        sys.exit(1)
    if not check_command("npm"):
        log_error("npm command-line tool not found. Please install Node.js and npm.")
        sys.exit(1)
        
    if not check_command("firebase"):
        log_error("firebase-tools CLI not found. Please install it using: npm install -g firebase-tools")
        sys.exit(1)

    log_step("Configuring Firebase project files...")

    firebase_json_path = os.path.join(ui_dir, "firebase.json")
    firebaserc_path = os.path.join(ui_dir, ".firebaserc")

    # Create .firebaserc mapping
    firebaserc_content = {
        "projects": {
            "default": project_id
        }
    }
    with open(firebaserc_path, "w", encoding="utf-8") as f:
        json.dump(firebaserc_content, f, indent=2)
    log_success(f"Wrote .firebaserc to point to project '{project_id}'")

    # This firebase.json is specifically for a Next.js app using the
    # "web frameworks" feature. It creates a Cloud Run backend for SSR.
    # The "site" key targets a specific hosting site within the project.
    # The "source" must be the root of the Next.js project itself.
    firebase_json_content = {
        "hosting": [
            {
            "site": "inspecta-app",
            "source": ".", # This tells firebase to look in the current directory for the Next.js app
            "ignore": [
                "firebase.json",
                "**/.*",
                "**/node_modules/**"
            ],
            "cleanUrls": True,
            "frameworksBackend": {
                "region": region
            }
        }]
    }
    with open(firebase_json_path, "w", encoding="utf-8") as f:
        json.dump(firebase_json_content, f, indent=2)
    log_success("Wrote firebase.json with Next.js 'frameworksBackend' configuration.")

def deploy_nextjs_app(project_id: str, region: str, key_file: Optional[str], ui_dir: str):
    """
    Builds the Next.js UI dashboard and deploys it to Firebase Hosting.
    """
    log_info(f"Starting Firebase deployment for project '{project_id}'...")
    log_info(f"Next.js Root Directory: {ui_dir}")

    # Phase 1: Authentication and Configuration
    configure_auth(key_file)
    configure_firebase_files(ui_dir, project_id, region)

    try:
        # Phase 2: Install dependencies
        log_step("Installing NPM dependencies (npm install)...")
        run_command(["npm", "install"], cwd=ui_dir)
        
        # Phase 3: Compile the Next.js application for production
        log_step("Compiling Next.js application (npm run build)...")
        run_command(["npm", "run", "build"], cwd=ui_dir)
        log_success("Next.js build compilation finished successfully.")

        # Phase 4: Deploy to Firebase Hosting
        # The "webframeworks" experiment is now the default, but enabling it ensures compatibility.
        log_step("Enabling Firebase Web Frameworks feature...")
        run_command(["firebase", "experiments:enable", "webframeworks"], cwd=ui_dir)

        log_step("Deploying to Firebase Hosting...")
        deploy_cmd = [
            "firebase", "deploy", "--only", "hosting:inspecta-app",
            "--project", project_id, "--non-interactive"
        ]
        
        # The deployment itself can take several minutes
        run_command(deploy_cmd, cwd=ui_dir)
        
        log_success("Deployment completed successfully!")
        print("-" * 60)
        print(f"Your application is now live at: https://inspecta-app.web.app")
        print("-" * 60)

    except subprocess.CalledProcessError as e:
        log_error(f"Pipeline failed during subprocess execution: {e}")
        sys.exit(1)
    except Exception as e:
        log_error(f"An unexpected error occurred during deployment: {e}")
        sys.exit(1)

# -------------------------------------------------------------
# 4. CLI ROUTING AND COMMAND LINE ARGUMENTS
# -------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Firebase Next.js Production UI Deployment Automation Tool"
    )
    parser.add_argument(
        "--project",
        default=DEFAULT_PROJECT_ID,
        help=f"Target Firebase Project ID (default: {DEFAULT_PROJECT_ID})"
    )
    parser.add_argument(
        "--region",
        default=DEFAULT_REGION,
        help=f"The GCP region for the server-side backend (default: {DEFAULT_REGION})"
    )
    parser.add_argument(
        "--key",
        default=DEFAULT_KEY_FILE,
        help=f"Path to GCP Service Account JSON Key file. If not provided, attempts to use active 'firebase login' session. (default: {DEFAULT_KEY_FILE})"
    )
    parser.add_argument(
        "--dir",
        default=DEFAULT_UI_DIR,
        help="Path to Next.js UI source root directory"
    )

    args = parser.parse_args()
    deploy_nextjs_app(args.project, args.region, args.key, args.dir)

if __name__ == "__main__":
    main()
