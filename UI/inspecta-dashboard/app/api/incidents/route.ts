import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json(
        { error: 'siteId query parameter is required' },
        { status: 400 }
      );
    }

    const result = await query(
      `SELECT 
        i.id, 
        insp.id as inspection_id,
        i.created_at,
        COUNT(it.id) as task_count,
        MAX(CASE WHEN it.status_id = 1 THEN 1 ELSE 0 END) as has_pending,
        MAX(CASE WHEN it.status_id = 2 THEN 1 ELSE 0 END) as has_in_progress,
        MAX(CASE WHEN it.status_id = 4 THEN 1 ELSE 0 END) as has_completed
      FROM incidents i
      LEFT JOIN inspections insp ON i.inspection_id = insp.id
      LEFT JOIN incident_tasks it ON i.id = it.incident_id
      WHERE insp.site_id = $1
      GROUP BY i.id, insp.id
      ORDER BY i.created_at DESC
      LIMIT 50`,
      [siteId]
    );

    const incidents = result.rows.map((incident, index) => {
      const status = incident.has_pending 
        ? 'pending' 
        : incident.has_in_progress 
        ? 'active' 
        : incident.has_completed 
        ? 'completed' 
        : 'pending';

      return {
        id: String(incident.id),
        inspection_id: String(incident.inspection_id),
        title: `Inspection ${incident.inspection_id?.substring(0, 8) || 'Unknown'}`,
        status: status,
        created: new Date(incident.created_at).toISOString(),
        task_count: parseInt(incident.task_count),
      };
    });

    return NextResponse.json(incidents, { status: 200 });
  } catch (error) {
    console.error('Error fetching incidents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incidents', details: String(error) },
      { status: 500 }
    );
  }
}
