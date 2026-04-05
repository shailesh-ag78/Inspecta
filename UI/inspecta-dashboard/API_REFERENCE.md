# INSPECTA Dashboard - API Reference

## Overview

The INSPECTA Dashboard exposes 3 REST API endpoints that connect directly to the PostgreSQL database.

## Endpoints

### 1. GET /api/sites

**Purpose**: Retrieve all sites

**Method**: GET  
**Authentication**: None (configure as needed for production)

**Request**:
```bash
curl http://localhost:3000/api/sites
```

**Response** (200 OK):
```json
[
  {
    "id": "1",
    "name": "Astitwa",
    "floor": "3rd Floor",
    "lastModified": "2026-03-31T10:30:00Z",
    "address": "123 Main Street",
    "company_name": "Solar Inc",
    "industry_name": "Solar",
    "inspection_count": 5
  },
  {
    "id": "2",
    "name": "MNK Towers",
    "floor": "12th Floor",
    "lastModified": "2026-03-30T15:45:00Z",
    "address": "456 Business Ave",
    "company_name": "Trading Corp",
    "industry_name": "Oil & Gas",
    "inspection_count": 3
  }
]
```

**Error Response** (500 Internal Server Error):
```json
{
  "error": "Failed to fetch sites",
  "details": "Error message from database"
}
```

**Notes**:
- Returns max 100 sites (configurable in code)
- Sorted by creation date (newest first)
- Includes company and industry information

---

### 2. GET /api/incidents

**Purpose**: Retrieve incidents for a specific site

**Method**: GET  
**Query Parameters**: 
- `siteId` (required, string): The ID of the site

**Request**:
```bash
curl http://localhost:3000/api/incidents?siteId=1
```

**Response** (200 OK):
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "inspection_id": "550e8400-e29b-41d4-a716-446655440001",
    "title": "Inspection 550e8400",
    "status": "active",
    "created": "2026-03-31T08:00:00Z",
    "task_count": 4
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440002",
    "inspection_id": "660e8400-e29b-41d4-a716-446655440003",
    "title": "Inspection 660e8400",
    "status": "completed",
    "created": "2026-03-25T14:30:00Z",
    "task_count": 2
  }
]
```

**Error Response - Missing Parameter** (400 Bad Request):
```json
{
  "error": "siteId query parameter is required"
}
```

**Error Response - Database Error** (500 Internal Server Error):
```json
{
  "error": "Failed to fetch incidents",
  "details": "Error message from database"
}
```

**Status Values**:
- `pending` - Has pending tasks
- `active` - Has in-progress tasks
- `completed` - All tasks completed

**Notes**:
- Returns max 50 incidents (configurable in code)
- Status is derived from task counts
- Sorted by creation date (newest first)

---

### 3. GET /api/tasks

**Purpose**: Retrieve tasks for a specific incident

**Method**: GET  
**Query Parameters**:
- `incidentId` (required, string): The UUID of the incident

**Request**:
```bash
curl http://localhost:3000/api/tasks?incidentId=550e8400-e29b-41d4-a716-446655440000
```

**Response** (200 OK):
```json
[
  {
    "id": "task-uuid-001",
    "task_title": "Repair water leakage in bathroom",
    "task_description": "Fix the water leakage near the tap in the bathroom to prevent water damage",
    "severity_id": 1,
    "severity_label": "Severe",
    "status_id": 1,
    "status_label": "Pending",
    "task_type": "repair",
    "task_type_id": 2,
    "start_time": 22,
    "end_time": 45,
    "video_url": "https://gcs.example.com/video-123.mp4",
    "area": "Bedroom 1 Bathroom",
    "created_at": "2026-03-31T08:00:00Z"
  },
  {
    "id": "task-uuid-002",
    "task_title": "Install new ventilation filter",
    "task_description": "Replace the old filter in the ventilation system",
    "severity_id": 2,
    "severity_label": "Regular",
    "status_id": 4,
    "status_label": "Completed",
    "task_type": "install",
    "task_type_id": 1,
    "start_time": 78,
    "end_time": 120,
    "video_url": "https://gcs.example.com/video-456.mp4",
    "area": "Ventilation Area",
    "created_at": "2026-03-31T09:00:00Z"
  }
]
```

**Error Response - Missing Parameter** (400 Bad Request):
```json
{
  "error": "incidentId query parameter is required"
}
```

**Error Response - Database Error** (500 Internal Server Error):
```json
{
  "error": "Failed to fetch tasks",
  "details": "Error message from database"
}
```

**Field Descriptions**:

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique task identifier |
| task_title | string | Brief title of the task |
| task_description | string | Detailed description |
| severity_id | number | 1=Severe, 2=Regular, 3=Low |
| severity_label | string | Human-readable severity |
| status_id | number | 1=Pending, 2=In Progress, 3=Review, 4=Completed, 5=Failed |
| status_label | string | Human-readable status |
| task_type | string | Type identifier (install, repair, verify, clear) |
| task_type_id | number | 1=Install, 2=Repair, 3=Verify, 4=Clear |
| start_time | number | Start timestamp in seconds (from video_start_ms) |
| end_time | number | End timestamp in seconds (from video_end_ms) |
| video_url | string | URL to video evidence (GCS URL) |
| area | string | Location/area where task occurs |
| created_at | string | ISO 8601 timestamp |

**Notes**:
- Time values are in seconds (converted from milliseconds in database)
- Sorted by creation date (ascending)
- Returns empty array if no tasks found
- Severity mapping: 1=Red, 2=Yellow, 3=Green (in UI)

---

## Data Flow Example

### User selects a site
```
UI calls → GET /api/sites
Response → Array of all sites
UI shows → Populated dropdown
```

### User selects a site from dropdown
```
UI calls → GET /api/incidents?siteId=1
Response → Array of incidents for site 1
UI shows → Populated incident dropdown
```

### User selects an incident
```
UI calls → GET /api/tasks?incidentId=550e8400-...
Response → Array of tasks
UI shows → Task list with details
```

---

## Testing the APIs

### Using cURL

```bash
# Get all sites
curl -X GET http://localhost:3000/api/sites

# Get incidents for site 1
curl -X GET "http://localhost:3000/api/incidents?siteId=1"

# Get tasks for an incident
curl -X GET "http://localhost:3000/api/tasks?incidentId=550e8400-e29b-41d4-a716-446655440000"
```

### Using Postman

1. Open Postman
2. Create three GET requests:
   - `http://localhost:3000/api/sites`
   - `http://localhost:3000/api/incidents?siteId=1`
   - `http://localhost:3000/api/tasks?incidentId=YOUR_INCIDENT_ID`
3. Click Send on each

### Using Browser Console

```javascript
// Fetch sites
fetch('/api/sites')
  .then(r => r.json())
  .then(data => console.log(data))

// Fetch incidents
fetch('/api/incidents?siteId=1')
  .then(r => r.json())
  .then(data => console.log(data))

// Fetch tasks
fetch('/api/tasks?incidentId=550e8400-e29b-41d4-a716-446655440000')
  .then(r => r.json())
  .then(data => console.log(data))
```

---

## Implementation Details

### Database Queries

**Sites Query**:
```sql
SELECT 
  s.id, s.site_name as name, s.address,
  c.name as company_name, i.name as industry_name,
  COUNT(insp.id) as inspection_count
FROM sites s
LEFT JOIN companies c ON s.company_id = c.id
LEFT JOIN industries_lookup i ON s.industry_id = i.id
LEFT JOIN inspections insp ON s.id = insp.site_id
GROUP BY s.id, c.name, i.name
ORDER BY s.created_at DESC
LIMIT 100
```

**Incidents Query**:
```sql
SELECT 
  i.id, insp.id as inspection_id,
  COUNT(it.id) as task_count,
  MAX(CASE WHEN it.status_id = 1 THEN 1 ELSE 0 END) as has_pending,
  MAX(CASE WHEN it.status_id = 2 THEN 1 ELSE 0 END) as has_in_progress
FROM incidents i
LEFT JOIN inspections insp ON i.inspection_id = insp.id
LEFT JOIN incident_tasks it ON i.id = it.incident_id
WHERE insp.site_id = $1
GROUP BY i.id, insp.id
ORDER BY i.created_at DESC
LIMIT 50
```

**Tasks Query**:
```sql
SELECT 
  it.id, it.task_title, it.task_description,
  it.severity_id, it.status_id, it.task_type_id,
  it.video_start_ms, it.video_end_ms, it.video_url,
  tsl.label as status_label, tty.label as task_type_label,
  ts.label as severity_label
FROM incident_tasks it
LEFT JOIN task_statuses_lookup tsl ON it.status_id = tsl.id
LEFT JOIN task_type_lookup tty ON it.task_type_id = tty.id
LEFT JOIN task_severity_lookup ts ON it.severity_id = ts.id
WHERE it.incident_id = $1
ORDER BY it.created_at ASC
```

---

## Rate Limiting & Caching

Currently implemented:
- ❌ No rate limiting (add for production)
- ❌ No caching (consider adding Redis for performance)

Recommendations for production:
- Add rate limiting middleware
- Implement caching for /api/sites (rarely changes)
- Use pagination for large result sets
- Add request validation

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error category",
  "details": "Specific error message"
}
```

HTTP Status Codes:
- `200` - Success
- `400` - Bad request (missing required parameters)
- `500` - Server/database error

---

## Future Enhancements

Suggested additions:
- POST /api/tasks - Create new tasks
- PUT /api/tasks/{id} - Update task status
- DELETE /api/tasks/{id} - Delete tasks
- GET /api/sites/{id} - Get single site details
- Authentication - Add JWT or session-based auth
- Pagination - Support limit/offset parameters
- Filtering - Advanced query filters
- Sorting - Custom sort options
