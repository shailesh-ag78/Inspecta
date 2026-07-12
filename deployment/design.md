
![
    
](image.png)
Act as an expert Google Cloud Solutions Architect and DevOps Engineer. Generate a production-ready infrastructure-as-code script [Specify your choice here: "Bash script using gcloud CLI" OR "Terraform configuration"] to deploy a highly secure, serverless multi-agent architecture on GCP.

### ARCHITECTURE SUMMARY:
- Two React frontends are hosted externally on Firebase Hosting.
- 1 Public UI Service (FastAPI) handles incoming web traffic and UI database writes.
- 1 Private Executor Service (Cloud Run / LangChain application) orchestrates workflows asynchronously.
- 3 Private Agent Services (Cloud Run x3) act as isolated compute microservices.
- Database: Neon Serverless Postgres (External, connected via TLS connection pooler).

### SPECIFIC GCP DEPLOYMENT REQUIREMENTS:

1. GLOBAL PROJECT SETTINGS:
   - Project ID: [Your-GCP-Project-Id]
   - Region: [Your-Preferred-Region, e.g., us-central1]
   - Artifact Registry: Create a single Docker repository named "inspecta-registry".

2. NETWORKING & SECURITY:
   - Create a custom VPC Network named "inspecta-vpc".
   - Create a Subnet named "inspecta-subnet". Enable Direct VPC Egress on this subnet so services can route traffic privately.
   - Create two separate IAM Service Accounts with least privilege:
     * `ui-service-sa` (For the UI Backend)
     * `executor-service-sa` (For the LangChain Executor)

3. SERVICE 1: UI BACKEND SERVICE (Cloud Run)
   - Ingress: Allow all traffic (`--ingress=all`) so the React applications on Firebase Hosting can communicate with it over the internet.
   - Performance: Set `--min-instances=1` to completely avoid user-facing cold starts.
   - Identity: Runs as `ui-service-sa`.
   - Networking: Route through the VPC using Direct VPC Egress (`--network=inspecta-vpc --subnet=inspecta-subnet --vpc-egress=private-ranges-only`).
   - Permissions: Explicitly grant `ui-service-sa` the IAM role `roles/run.invoker` over the Executor Service.
   - Environment Variables:
     * `DATABASE_URL`: Neon Connection Pooler string (e.g., postgresql://user:pass@subdomain-pooler.region.neon.tech/dbname?sslmode=require)
     * `EXECUTOR_SERVICE_URL`: The target private URL of the Executor Service.

4. SERVICE 2: EXECUTOR SERVICE (Cloud Run)
   - Ingress: Allow all traffic (`--ingress=all`) but require IAM authentication (`--no-allow-unauthenticated`). This makes the service publicly addressable but ensures only authorized service accounts (like `ui-service-sa`) can invoke it.
   - Performance: Set `--min-instances=1` to prevent cold starts when handling asynchronous webhook triggers.
   - Request Timeout: Set the execution timeout limit high (`--timeout=900` or higher) to accommodate long-running LangChain sequences.
   - Identity: Runs as `executor-service-sa`.
   - Networking: Route via Direct VPC Egress.
   - Permissions: Explicitly grant `executor-service-sa` the IAM role `roles/run.invoker` over all three Agent Services.
   - Environment Variables:
     * `DATABASE_URL`: Neon Connection Pooler string.
     * `AGENT_1_URL`, `AGENT_2_URL`, `AGENT_3_URL`: URLs pointing to the respective private agent services.

5. SERVICES 3, 4, & 5: THE 3 AGENT SERVICES (Cloud Run x3)
   - Deploy 3 separate Cloud Run microservices named: `agent-1`, `agent-2`, and `agent-3`.
   - Ingress: Allow all traffic (`--ingress=all`) but require IAM authentication (`--no-allow-unauthenticated`). This ensures only the `executor-service-sa` can invoke them.
   - Scale: Keep `--min-instances=0` (scale to zero when idle) to minimize costs, as they are called ad-hoc by the executor.
   - Database Access: These services do NOT connect to the database. They require no database environment variables.

### OUTPUT REQUIREMENTS:
1. Include initialization lines to enable the necessary Google Cloud APIs (`run.googleapis.com`, `artifactregistry.googleapis.com`, `vpcaccess.googleapis.com`).
2. Generate the exact script blocks required to build, tag, and push placeholder Docker container images to the Artifact Registry before running the Cloud Run deployment commands.
3. Ensure the service-to-service IAM bindings are flawless so the UI Service can securely fetch an OpenID Connect (OIDC) identity token to invoke the Executor, and the Executor can do the same for the Agents.
4. Use secure authentication state management (e.g., Firebase SDK's built-in memory storage, or storing the token in a httpOnly, Secure, SameSite=Strict cookie). httpOnly cookies cannot be accessed or read by JavaScript code running in the browser, making it impossible for a malicious script to steal them
