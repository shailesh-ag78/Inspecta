# Stop and remove the current one
docker stop inspecta-db
docker rm inspecta-db

# Run with a volume (saves data to a folder called 'postgres_data' on your PC)
$dockerArgs = @(
    "run", "--name", "inspecta-db",
    "-e", "POSTGRES_DB=inspecta_local",
    "-e", "POSTGRES_PASSWORD=passwd",
    "-v", "D:\code\Inspecta\Data\postgresdb:/var/lib/postgresql",
    "-p", "5432:5432",
    "-d", "postgres:latest"
)
docker @dockerArgs

docker start inspecta-db

#How to verify it's working in PowerShell
#Look for inspecta_local in the list that appears.
###   docker exec -it inspecta-db psql -U postgres -l   

# Create Database schema or tables
# Open PowerShell in the folder where your databaseschema file is located and run:
###    Get-Content .\databaseschema.sql | docker exec -i inspecta-db psql -U postgres -d inspecta_local

# Verify the tables exist:
###    docker exec -it inspecta-db psql -U postgres -d inspecta_local -c "\dt"

# Check postgres connection from command prompt
### docker exec -it inspecta-db psql "postgresql://postgres:passwd@localhost:5432/inspecta_local" -c "SELECT 1;"
### docker exec -it inspecta-db pg_isready -d inspecta_local -U postgres

<# ============================================
Alternatively just run following command, that automatically creates database schema
The official Postgres Docker image has a special folder called /docker-entrypoint-initdb.d/. Any .sql file you put there when the container first starts will be executed automatically.
docker run --name inspecta-db `
  -e POSTGRES_PASSWORD=passwd `
  -e POSTGRES_DB=inspecta_local `
  -v "D:\code\Inspecta\Data\postgresdb":/var/lib/postgresql/data `
  -v "D:\code\Inspecta\DataStore":/docker-entrypoint-initdb.d `
  -p 5432:5432 `
  -d postgres:latest
============================================#>