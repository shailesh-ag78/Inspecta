# Inspecta UI Architecture Guide

## Overview

The Inspecta UI now uses a two-tier architecture:

### **Frontend (React/Next.js)**
- User-facing React components
- Server-side rendering with Next.js
- HTTP API calls to Python backend
- No direct database access

### **Backend (Python/FastAPI)**
- REST API exposing database operations
- Direct import and use of `DataStore/postgresdb.py`
- Row-Level Security (RLS) enforcement
- Single source of truth for database logic

## Directory Structure

```
UI/
├── inspecta-dashboard/           # Frontend (React/Next.js)
│   ├── app/
│   │   └── api/
│   │       ├── incidents/route.ts    # Calls backend /api/incidents
│   │       ├── tasks/route.ts        # Calls backend /api/tasks
│   │       └── sites/route.ts        # Calls backend /api/sites
│   ├── lib/
│   │   ├── backend-client.ts         # Client for calling Python backend
│   │   ├── db.ts                     # DEPRECATED (no longer used)
│   │   ├── enums.ts                  # DEPRECATED (no longer used)
│   │   └── incident-repository.ts    # DEPRECATED (no longer used)
│   ├── .env.local.example            # Frontend config template
│   └── package.json
│
└── backend/                      # Backend (Python/FastAPI)
    ├── main.py                       # FastAPI app that imports postgresdb.py
    ├── requirements.txt              # Python dependencies
    ├── .env.example                  # Backend config template
    ├── README.md                     # Backend documentation
    └── __init__.py

DataStore/
└── postgresdb.py                 # Single source of truth for database logic
```

## Data Flow

### GET Request Example: Fetch Tasks for Incident

```
1. User clicks "View Tasks" in React Component
   ↓
2. Frontend calls: GET /api/tasks?incidentId=123&companyId=5
   (via lib/backend-client.ts)
   ↓
3. Next.js Route Handler (/app/api/tasks/route.ts)
   - Validates request parameters
   - Calls backend-client: getTasksForIncident(123, 5)
   ↓
4. Backend Client (lib/backend-client.ts)
   - Makes HTTP request to Python backend
   - GET http://localhost:8000/api/incidents/123/tasks?companyId=5
   ↓
5. Python Backend (backend/main.py)
   - FastAPI endpoint handler
   - Calls: repository.get_tasks_for_incident(5, 123)
   ↓
6. DataStore Repository (DataStore/postgresdb.py)
   - IncidentRepository class
   - Sets RLS context: app.current_company_id = 5
   - Executes SQL query
   ↓
7. PostgreSQL Database
   - Returns task rows respecting RLS policy
   ↓
8. Response flows back: DB → postgresdb.py → FastAPI → backend-client → Next.js route → Frontend
```

## Security Model

### Row-Level Security (RLS)
1. All database operations require `company_id`
2. Backend sets session context: `SET app.current_company_id = {company_id}`
3. PostgreSQL RLS policies enforce company isolation
4. Ownership verification before sensitive operations

### Input Validation
- Next.js routes validate query parameters
- Python backend validates request bodies (Pydantic models)
- SQL injection prevention via parameterized queries

## Setup Instructions

### Quick Start

**Step 1: Backend Setup**
```bash
cd UI/backend
cp .env.example .env
# Edit .env with your database credentials
pip install -r requirements.txt
python main.py
# Backend now at: http://localhost:8000
```

**Step 2: Frontend Setup**
```bash
cd UI/inspecta-dashboard
cp .env.local.example .env.local
npm install  # if needed
npm run dev
# Frontend now at: http://localhost:3000
```

**Step 3: Verify**
- Frontend: http://localhost:3000
- Backend API Docs: http://localhost:8000/docs
- Test: Go to frontend, load a site → should see incidents

### Environment Variables

**Backend (.env)**
```
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=inspecta_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=passwd
BACKEND_PORT=8000
```

**Frontend (.env.local)**
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

## API Reference

### Backend Endpoints

#### Incidents
- **GET** `/api/incidents?siteId=X&companyId=Y` → Get incidents for site
- **GET** `/api/incidents/{id}?companyId=Y` → Get specific incident
- **POST** `/api/incidents?companyId=Y` → Create incident
- **PATCH** `/api/incidents/{id}/audio?companyId=Y` → Update audio URL

#### Tasks
- **GET** `/api/incidents/{id}/tasks?companyId=Y` → Get tasks for incident
- **PATCH** `/api/tasks/{id}?companyId=Y` → Update task details
- **PATCH** `/api/tasks/{id}/review?companyId=Y` → Review task

#### Sites
- **GET** `/api/sites` → Get all sites

#### Companies
- **GET** `/api/companies/{id}` → Get company info

#### Inspections
- **POST** `/api/inspections?companyId=Y&siteId=Z` → Create inspection
- **GET** `/api/inspections/{id}/verify?companyId=Y` → Verify ownership

#### Enums
- **GET** `/api/enums/task-statuses` → TaskStatus enum values
- **GET** `/api/enums/task-types` → TaskType enum values
- **GET** `/api/enums/task-severities` → TaskSeverity enum values
- **GET** `/api/enums/industries` → Industry enum values

### Frontend Client Methods

```typescript
// lib/backend-client.ts exports these functions:

// Incidents
getIncidentsForSite(siteId, companyId)
getIncident(incidentId, companyId)
createIncident(companyId, incidentData)
updateIncidentAudio(incidentId, audioUrl, companyId)
getIncidentProgress(incidentId, companyId)

// Tasks
getTasksForIncident(incidentId, companyId)
bulkAddTasks(incidentId, companyId, inspectionId, tasks)
updateTask(taskId, companyId, taskUpdate)
updateTaskReview(taskId, companyId, review)

// Sites
getAllSites()

// Companies
getCompanyInfo(companyId)

// Inspections
createInspection(companyId, siteId)
verifyInspectionOwnership(inspectionId, companyId)

// Enums
getTaskStatuses()
getTaskTypes()
getTaskSeverities()
getIndustries()
```

## Code Organization

### Frontend (Next.js)
- **Routes** (`app/api/*/`): Accept HTTP requests from browser, call backend-client
- **Components**: React UI components
- **Backend Client** (`lib/backend-client.ts`): Abstraction for HTTP calls to Python backend
- **Utilities**: Formatters, validators, helpers

### Backend (FastAPI)
- **Enums**: TaskStatus, TaskType, TaskSeverity, Industry (imported from postgresdb.py)
- **Endpoints**: REST API routes with business logic
- **Pydantic Models**: Request/response validation
- **Repository**: Direct imports from postgresdb.py

### DataStore (Python)
- **IncidentRepository**: Single class with all database operations
- **Enums**: TaskStatus, TaskType, TaskSeverity, Industry
- **Session Management**: RLS context handling

## Important Notes

### ✅ What Changed
- Frontend no longer has TypeScript copies of enums and repository
- No direct database connections from Node.js
- All database access goes through Python backend
- Single source of truth: `DataStore/postgresdb.py`

### ⚠️ Deprecated Files (can be deleted)
- `lib/incident-repository.ts` - No longer used (replaced by backend)
- `lib/enums.ts` - No longer used (enums are in backend)
- `lib/db.ts` - Can be removed if not used elsewhere

### 🔄 Request/Response Format

All endpoints return:
```json
{
  "status": "success" | "error",
  "data": { ... },        // On success
  "message": "string",    // Optional
  "detail": "string"      // On error
}
```

## Troubleshooting

### Backend won't start
```bash
# Check Python path
which python3

# Check imports work
python3 -c "from postgresdb import IncidentRepository; print('OK')"

# Check PostgreSQL connection
psql -h localhost -U postgres -d inspecta_db
```

### Frontend can't reach backend
```bash
# Check backend is running
curl http://localhost:8000/health

# Check .env.local has correct URL
cat UI/inspecta-dashboard/.env.local

# Check browser console for CORS errors
```

### Database errors
```bash
# Verify postgresdb.py exists and is importable
python3 -c "import sys; sys.path.insert(0, 'path/to/DataStore'); from postgresdb import IncidentRepository"

# Check RLS policies are set up
psql -d inspecta_db -c "SELECT * FROM pg_policies;"
```

## Next Steps / Future Improvements

1. **Authentication**: Add JWT tokens for security
2. **Caching**: Add Redis for frequently accessed data
3. **WebSockets**: Real-time updates for collaborative features
4. **Monitoring**: Add logging and error tracking
5. **Testing**: Add integration tests for backend endpoints
6. **Deployment**: Docker containers for backend and frontend
