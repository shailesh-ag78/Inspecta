# INSPECTA Dashboard - Setup Guide

This is a Next.js 16+ application that provides a real-time task review dashboard connected to a PostgreSQL database.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm/yarn
- PostgreSQL 12+ running locally or remotely
- Git (for cloning the repository)

### Step 1: Environment Configuration

1. Copy the environment template to create your local configuration:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` with your PostgreSQL connection details:
   ```
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DB=inspecta_db
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=your_secure_password
   ```

**Important**: Never commit `.env.local` to version control. It contains sensitive credentials.

### Step 2: Install Dependencies

```bash
npm install
# or
yarn install
```

This installs:
- **next** - React framework
- **pg** - PostgreSQL client for Node.js
- **react** & **react-dom** - UI library
- **lucide-react** - Icon library
- **tailwindcss** - Utility-first CSS framework

### Step 3: Database Setup

**Option A: PostgreSQL is already running with the schema**

If your PostgreSQL server already has the `inspecta_db` database with the complete schema from `databaseschema.sql`, you can skip to Step 4.

**Option B: Set up a fresh PostgreSQL database**

1. Connect to your PostgreSQL server:
   ```bash
   psql -U postgres -h localhost
   ```

2. Create the database:
   ```sql
   CREATE DATABASE inspecta_db;
   \c inspecta_db
   ```

3. Run the schema setup:
   ```bash
   # From the DataStore folder
   psql -U postgres -h localhost -d inspecta_db -f databaseschema.sql
   ```

4. Optionally seed sample data:
   ```bash
   psql -U postgres -h localhost -d inspecta_db -f seeddata.sql
   ```

**Note**: If you don't have sample data, the application will still work but will show "No sites/incidents/tasks available" in the UI.

### Step 4: Start the Development Server

```bash
npm run dev
# or
yarn dev
```

The application will be available at `http://localhost:3000`

You should see:
- ✅ Sites dropdown populated from the database
- ✅ Incidents loading when you select a site
- ✅ Tasks displaying when you select an incident

## 📊 Architecture

### Data Flow
```
UI (page.tsx)
    ↓ (fetch /api/sites)
Browser → Next.js API Routes (/api/sites, /api/incidents, /api/tasks)
    ↓ (query)
PostgreSQL Database
```

### API Endpoints

#### GET `/api/sites`
Returns all sites from the database.

**Response Example:**
```json
[
  {
    "id": "1",
    "name": "Astitwa",
    "floor": "3rd Floor",
    "lastModified": "2026-03-31T10:30:00Z",
    "address": "123 Main St",
    "company_name": "Company A",
    "industry_name": "Solar",
    "inspection_count": 5
  }
]
```

#### GET `/api/incidents?siteId={siteId}`
Returns incidents for a specific site.

**Query Parameters:**
- `siteId` (required): The site ID

**Response Example:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "inspection_id": "550e8400-e29b-41d4-a716-446655440001",
    "title": "Inspection 550e8400",
    "status": "active",
    "created": "2026-03-31T08:00:00Z",
    "task_count": 4
  }
]
```

#### GET `/api/tasks?incidentId={incidentId}`
Returns tasks for a specific incident.

**Query Parameters:**
- `incidentId` (required): The incident ID

**Response Example:**
```json
[
  {
    "id": "task-uuid-here",
    "task_title": "Repair water leakage in bathroom",
    "task_description": "Fix the water leakage near the tap...",
    "severity_id": 1,
    "severity_label": "Severe",
    "status_id": 1,
    "status_label": "Pending",
    "task_type": "repair",
    "task_type_id": 2,
    "start_time": 22,
    "end_time": 45,
    "video_url": "https://example.com/video.mp4",
    "area": "Task Area",
    "created_at": "2026-03-31T08:00:00Z"
  }
]
```

## 🔧 Troubleshooting

### "Failed to connect to database"
- ✓ Verify PostgreSQL is running: `pg_isready -h localhost -p 5432`
- ✓ Check credentials in `.env.local`
- ✓ Ensure database exists: `psql -l`

### "No sites available"
- ✓ Check if data was seeded: `psql -d inspecta_db -c "SELECT * FROM sites;"`
- ✓ Create test data manually or run seeddata.sql

### "Module not found: 'pg'"
- ✓ Run `npm install` (npm install pg automatically from package.json)
- ✓ Delete node_modules and package-lock.json, then reinstall

### API returns empty arrays
- ✓ Verify database connection with: `npm run dev`
- ✓ Check browser console for network errors (F12)
- ✓ Inspect API response at `http://localhost:3000/api/sites`

## 📝 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| POSTGRES_HOST | localhost | PostgreSQL server hostname |
| POSTGRES_PORT | 5432 | PostgreSQL server port |
| POSTGRES_DB | inspecta_db | Database name |
| POSTGRES_USER | postgres | Database user |
| POSTGRES_PASSWORD | postgres | Database password |
| NEXT_PUBLIC_API_BASE_URL | http://localhost:3000 | API base URL (client-side) |

## 🏗️ Project Structure

```
inspecta-dashboard/
├── app/
│   ├── api/
│   │   ├── sites/route.ts          # Sites API endpoint
│   │   ├── incidents/route.ts      # Incidents API endpoint
│   │   └── tasks/route.ts          # Tasks API endpoint
│   ├── page.tsx                    # Main dashboard component
│   ├── layout.tsx                  # Root layout
│   └── globals.css                 # Global styles
├── lib/
│   └── db.ts                       # Database utilities
├── package.json                    # Dependencies
├── .env.example                    # Environment template
└── README.md                       # This file
```

## 🚢 Deployment

### Build for Production

```bash
npm run build
npm run start
```

### Important for Production:
1. Set all environment variables on the production server
2. Use a production PostgreSQL database
3. Enable HTTPS/SSL
4. Set appropriate CORS headers if calling from different domain
5. Consider adding authentication/authorization
6. Implement proper error logging

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL Node.js Driver (pg)](https://node-postgres.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide Icons](https://lucide.dev/)

## 📞 Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review browser console errors (F12)
3. Check server logs in terminal
4. Review API responses at `/api/*` endpoints
5. Verify database connection and data

## 📄 License

This project is part of the INSPECTA system.
