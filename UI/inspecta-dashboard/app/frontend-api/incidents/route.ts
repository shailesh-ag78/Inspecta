import { getIncidentsForSite, getIncidentsForInspection } from '@/lib/backend-client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const siteId = searchParams.get('siteId');
    const inspectionId = searchParams.get('inspectionId');
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId query parameter is required' },
        { status: 400 }
      );
    }

    // Support both siteId (legacy) and inspectionId (new)
    if (!siteId && !inspectionId) {
      return NextResponse.json(
        { error: 'Either siteId or inspectionId query parameter is required' },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get('authorization');
    const authHeaders = authHeader ? { Authorization: authHeader } : undefined;

    let incidents;
    if (inspectionId) {
      incidents = await getIncidentsForInspection(
        inspectionId,
        authHeaders
      );
    } else {
      incidents = await getIncidentsForSite(
        parseInt(siteId!),
        authHeaders
      );
    }

    const formattedIncidents = incidents.map((incident) => {
      const status = incident.has_pending
        ? 'pending'
        : incident.has_in_progress
          ? 'active'
          : incident.has_completed
            ? 'completed'
            : 'pending';

      const formattedDate = new Date(incident.created_at).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).replace(',', ''); // Removes the default comma between date and time

      return {
        id: String(incident.id),
        inspection_id: String(incident.inspection_id),
        title: `(${incident.id?.substring(0, 4) + 'XXX' || 'Unknown'}) -- ${formattedDate}`,
        status: status,
        created: new Date(incident.created_at).toISOString(),
        task_count: parseInt(incident.task_count),
      };
    });

    return NextResponse.json({ status: 'success', data: formattedIncidents }, { status: 200 });
  } catch (error) {
    console.error('Error fetching incidents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incidents', details: String(error) },
      { status: 500 }
    );
  }
}
