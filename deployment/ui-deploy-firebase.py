import os
import sys
import json
import argparse
import subprocess
import shutil

# -------------------------------------------------------------
# 1. CONSTANTS AND PATH RESOLUTION
# -------------------------------------------------------------
DEFAULT_PROJECT_ID = "inspecta-360"
DEFAULT_KEY_FILE = "inspecta-360-firebase-adminsdk-fbsvc-bd599894b5.json"
DEFAULT_UI_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "UI", "inspecta-dashboard"))

# -------------------------------------------------------------
# 2. UTILITY FUNCTIONS
# -------------------------------------------------------------
def log_info(msg):
    print(f"[*] {msg}")

def log_success(msg):
    print(f"[+] {msg}")

def log_warning(msg):
    print(f"[!] Warning: {msg}")

def log_error(msg):
    print(f"[!] Error: {msg}", file=sys.stderr)

def check_command(cmd):
    """Checks if a command-line tool is available in the system path."""
    return shutil.which(cmd) is not None

# -------------------------------------------------------------
# 3. CORE DEPLOYMENT LOGIC
# -------------------------------------------------------------
def deploy_nextjs_app(project_id, key_file, ui_dir):
    """
    Builds the Next.js UI dashboard and deploys it to Firebase Hosting
    using the provided service account credentials.
    """
    log_info(f"Starting Firebase deployment pipeline for Next.js UI...")
    log_info(f"Target Project: {project_id}")
    log_info(f"Service Account Key: {key_file}")
    log_info(f"Next.js Root Directory: {ui_dir}")

    # Validate paths
    if key_file:
        if not os.path.exists(key_file):
            # Check if key file is relative to script folder
            script_relative_key = os.path.join(os.path.dirname(__file__), key_file)
            if os.path.exists(script_relative_key):
                key_file = script_relative_key
            else:
                log_warning(f"Service account key file not found: {key_file}. Proceeding with active CLI session instead.")
                key_file = None

    if not os.path.exists(ui_dir):
        log_error(f"Next.js UI directory not found: {ui_dir}")
        sys.exit(1)

    # Check dependencies
    if not check_command("npm"):
        log_error("npm command-line tool not found. Please install Node.js and npm.")
        sys.exit(1)
        
    if not check_command("firebase"):
        log_error("firebase-tools CLI not found. Please install it using: npm install -g firebase-tools")
        sys.exit(1)

    # Set authentication environment variable if key is provided
    if key_file:
        abs_key_path = os.path.abspath(key_file)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = abs_key_path
        log_success(f"Configured GOOGLE_APPLICATION_CREDENTIALS to: {abs_key_path}")
    else:
        log_info("No service account key configured/found. Using current Firebase CLI session.")

    # Write Firebase config files if they don't exist
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
    log_success(f"Generated/Updated .firebaserc pointing to project {project_id}")

    # Create firebase.json hosting configuration for Next.js
    firebase_json_content = {
        "hosting": {
            "source": ".",
            "ignore": [
                "firebase.json",
                "**/.*",
                "**/node_modules/**"
            ]
        }
    }
    with open(firebase_json_path, "w", encoding="utf-8") as f:
        json.dump(firebase_json_content, f, indent=2)
    log_success("Generated/Updated firebase.json with Next.js Hosting configuration.")

    try:
        # Step 1: Run production build of the Next.js application
        log_info("Compiling Next.js application (npm run build)...")
        # Run npm install first to make sure dependencies are synchronized
        log_info("Installing NPM dependencies (npm install)...")
        subprocess.run(["npm", "install"], cwd=ui_dir, check=True, shell=True)
        
        # Compile build assets
        subprocess.run(["npm", "run", "build"], cwd=ui_dir, check=True, shell=True)
        log_success("Next.js build compilation finished successfully.")

        # Step 2: Deploy to Firebase Hosting using service account credentials
        log_info("Enabling Firebase Web Frameworks experiment...")
        subprocess.run(["firebase", "experiments:enable", "webframeworks"], cwd=ui_dir, check=True, shell=True)

        log_info("Deploying web assets to Firebase Hosting...")
        deploy_cmd = ["firebase", "deploy", "--only", "hosting", "--project", project_id, "--non-interactive"]
        
        subprocess.run(deploy_cmd, cwd=ui_dir, check=True, shell=True)
        
        log_success("Deployment completed successfully!")
        print("-" * 60)
        print(f"Your application is now live at: https://{project_id}.web.app")
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
        "--key",
        default=DEFAULT_KEY_FILE,
        help=f"Path to GCP Service Account JSON Key file (default: {DEFAULT_KEY_FILE})"
    )
    parser.add_argument(
        "--dir",
        default=DEFAULT_UI_DIR,
        help="Path to Next.js UI source root directory"
    )

    args = parser.parse_args()
    key = None if args.key.lower() in ('none', '') else args.key
    deploy_nextjs_app(args.project, key, args.dir)

if __name__ == "__main__":
    main()
