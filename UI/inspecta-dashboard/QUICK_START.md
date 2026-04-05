# 🚀 INSPECTA UI - Quick Start (5 Minutes)

## What's Been Implemented

Your INSPECTA UI is now fully connected to PostgreSQL! The application will:
- ✅ Pull sites from the database
- ✅ Load incidents when you select a site
- ✅ Display tasks when you select an incident
- ✅ Show real data with live filtering and search

## Get Started Now

### 1️⃣ Configure Database Connection

Create `.env.local` in `UI/inspecta-dashboard/`:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=inspecta_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=passwd
```

### 2️⃣ Install & Run

```powershell
cd g:\code\Inspecta\UI\inspecta-dashboard
npm install
npm run dev
```

### 3️⃣ Open Browser

Visit: **http://localhost:3000**

You should see your database data in the dropdowns!

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Failed to fetch sites" | Check PostgreSQL is running: `pg_isready -h localhost` |
| No sites in dropdown | Verify database `inspecta_db` exists and has data in `sites` table |
| "Module not found: 'pg'" | Run `npm install` in the project folder |

## What Changed

### Files Created:
- `lib/db.ts` - Database connection utilities
- `app/api/sites/route.ts` - API endpoint for sites
- `app/api/incidents/route.ts` - API endpoint for incidents  
- `app/api/tasks/route.ts` - API endpoint for tasks
- `.env.example` - Configuration template
- `README_SETUP.md` - Full documentation

### Files Modified:
- `package.json` - Added `pg` dependency
- `app/page.tsx` - Complete rewrite to use real data

## Architecture

```
PostgreSQL → Next.js API Routes → React Components → UI Dashboard
```

Every dropdown and list now pulls from your production database!

## Next Steps

1. **Test with your data**: Make sure PostgreSQL has sites/incidents/tasks populated
2. **Deploy**: Follow deployment section in README_SETUP.md
3. **Customize**: Update video URLs, styling, or add new features
4. **Monitor**: Set up logging for production use

## Documentation

For detailed setup, troubleshooting, and API documentation, see:
- `README_SETUP.md` - Complete setup guide (read this first if issues)
- `README.md` - Original project README

---

**Questions?** Check README_SETUP.md troubleshooting section or verify your PostgreSQL connection!
