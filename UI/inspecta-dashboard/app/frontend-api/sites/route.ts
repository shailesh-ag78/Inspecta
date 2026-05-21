import { getAllSites } from '@/lib/backend-client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId');
    console.log('Received GET /frontend-api/sites request with companyId:', companyId);

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId query parameter is required' },
        { status: 400 }
      );
    }

    const sites = await getAllSites(Number(companyId));

    const formattedSites = sites.map((site) => ({
      id: String(site.id),
      name: site.name,
      address: site.address || null,
      company_name: site.company_id,
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
