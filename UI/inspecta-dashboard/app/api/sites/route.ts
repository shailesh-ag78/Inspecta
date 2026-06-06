import { getAllSites } from '@/lib/backend-client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const authHeaders = authHeader ? { Authorization: authHeader } : undefined;

    const sites = await getAllSites(authHeaders);

    const formattedSites = sites.map((site) => ({
      id: String(site.id),
      name: site.name,
      address: site.address || null,
      company_id: site.company_id,
      company_name: site.company_name || null,
      industry_id: site.industry_id
    }));

    return NextResponse.json(formattedSites, { status: 200 });
  } catch (error) {
    console.error('Error fetching sites:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sites', details: String(error) },
      { status: 500 }
    );
  }
}
