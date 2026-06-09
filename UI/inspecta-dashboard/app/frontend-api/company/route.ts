import { getCompanyInfo } from '@/lib/backend-client';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /frontend-api/company
 * Fetches company metadata for a logged in user
 */
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const authHeaders = authHeader ? { Authorization: authHeader } : undefined;

        const company_details = await getCompanyInfo(
            authHeaders
        );

        //console.log("=========== Company details: " + JSON.stringify(company_details, null, 2));
        // const companyName = `${company_details.company_name}`
        return NextResponse.json({
            status: 'success',
            data: company_details
        }, { status: 200 });
    } catch (error) {
        console.error('Error fetching company details:', error);
        return NextResponse.json(
            { error: 'Failed to fetch company details', details: String(error) },
            { status: 500 }
        );
    }
}