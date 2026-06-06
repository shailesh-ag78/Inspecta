import { getSiteInspectionCombinations } from '@/lib/backend-client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const authHeaders = authHeader ? { Authorization: authHeader } : undefined;

    const combinations = await getSiteInspectionCombinations(authHeaders);

    const formattedCombinations = combinations.map((combo) => ({
      site_id: String(combo.site_id),
      site_name: combo.site_name,
      address: combo.address || null,
      inspection_id: combo.inspection_id ? String(combo.inspection_id) : null,
      inspection_created_at: combo.inspection_created_at || null,
      // Display label for dropdown
      label: combo.inspection_id
        ? `Site ${combo.site_id} :: Inspection ${combo.inspection_id?.substring(0, 8)}`
        : `Site ${combo.site_id} :: No Inspection`
    }));

    return NextResponse.json({ status: 'success', data: formattedCombinations }, { status: 200 });
  } catch (error) {
    console.error('Error fetching site-inspections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch site-inspections', details: String(error) },
      { status: 500 }
    );
  }
}
