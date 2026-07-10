import argparse
import sys
import firebase_admin
from firebase_admin import credentials, auth

# -------------------------------------------------------------
# 1. INITIALIZE THE FIREBASE ADMIN SDK
# -------------------------------------------------------------
def initialize_firebase(key_path):
    try:
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
    except Exception as e:
        print(f"[!] Error loading service account key: {e}")
        sys.exit(1)



# -------------------------------------------------------------
# 2. CLIENT CORE OPERATIONS
# -------------------------------------------------------------
def add_or_update_user(email, company_id, storage_id):
    """
    Creates a new user profile or updates an existing one, 
    then injects custom corporate claims.
    """
    try:
        # Check if user already exists
        try:
            user = auth.get_user_by_email(email)
            print(f"[*] User {email} already exists (UID: {user.uid}). Updating claims...")
        except auth.UserNotFoundError:
            # Create user if profile doesn't exist
            # Password is not set since they sign in via Google Provider on your UI
            user = auth.create_user(email=email)
            print(f"[+] Successfully created new user user: {email} (UID: {user.uid})")

        # Compile claims payload
        claims = {
            "company_id": company_id,
            "company_storage_id": storage_id
        }

        # Inject custom claims securely into the auth profile
        auth.set_custom_user_claims(user.uid, claims)
        print(f"[+] Successfully applied claims to {email}: {claims}")

    except Exception as e:
        print(f"[!] Operation failed: {e}")


def remove_user(email):
    """
    Locates a user record by email and permanently deletes the account 
    along with all embedded token structures.
    """
    try:
        # Resolve target email address to its unique internal identifier
        user = auth.get_user_by_email(email)
        uid = user.uid
        
        # Delete user account profile from core system
        auth.delete_user(uid)
        print(f"[-] Successfully removed user {email} (UID: {uid}) and cleared all token claims.")

    except auth.UserNotFoundError:
        print(f"[!] Action cancelled: No account found with email '{email}'.")
    except Exception as e:
        print(f"[!] Operation failed: {e}")


# -------------------------------------------------------------
# 3. CLI ROUTING AND COMMAND LINE ARGUMENTS
# -------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Firebase Multi-Tenant Account & Custom Claims CLI Utility Tool"
    )
    
    # Global/Main arguments
    parser.add_argument("--key", help="Path to Firebase Admin JSON key file")
    
    # Subcommands
    subparsers = parser.add_subparsers(dest="command", required=True, help="Available Actions")

    # Add User Command Builder
    add_parser = subparsers.add_parser("add", help="Add or update user account configurations")
    add_parser.add_argument("--email", required=True, help="Target user Gmail address")
    add_parser.add_argument("--company_id", required=True, help="Unique identifier mapping user to their company tenant")
    add_parser.add_argument("--storage_id", required=True, help="Unique identifier specifying their storage cluster partition")

    # Remove User Command Builder
    remove_parser = subparsers.add_parser("remove", help="Delete user identity and clean up metadata profiles")
    remove_parser.add_argument("--email", required=True, help="Target email address to destroy")

    args = parser.parse_args()

    # Manually check for key presence so --help on subcommands still works without it
    if not args.key:
        parser.error("the following arguments are required: --key")

    # Initialize Firebase SDK
    initialize_firebase(args.key)

    # Route request to business logic handlers
    if args.command == "add":
        add_or_update_user(args.email, args.company_id, args.storage_id)
    elif args.command == "remove":
        remove_user(args.email)


if __name__ == "__main__":
    main()
