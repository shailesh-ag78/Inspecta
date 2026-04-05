import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const result = await query(
      `SELECT 
        s.id, 
        s.site_name as name, 
        s.address,
        c.name as company_name,
        i.name as industry_name,
        s.created_at,
        COUNT(insp.id) as inspection_count
      FROM sites s
      LEFT JOIN companies c ON s.company_id = c.id
      LEFT JOIN industries_lookup i ON s.industry_id = i.id
      LEFT JOIN inspections insp ON s.id = insp.site_id
      GROUP BY s.id, c.name, i.name
      ORDER BY s.created_at DESC
      LIMIT 100`
    );

    const sites = result.rows.map((site) => ({
      id: String(site.id),
      name: site.name,
      address: site.address,
      company_name: site.company_name,
      industry_name: site.industry_name,
      floor: site.address ? `${site.address}` : 'Unknown',
      lastModified: new Date(site.created_at).toISOString(),
      inspection_count: parseInt(site.inspection_count),
    }));

    return NextResponse.json(sites, { status: 200 });
  } catch (error) {
    console.error('Error fetching sites:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sites', details: String(error) },
      { status: 500 }
    );
  }
}
