// License activation API endpoint
// POST /api/license/activate

import { NextRequest, NextResponse } from 'next/server';
import { activateLicense } from '@/lib/license/manager';
import { generateLicenseKey } from '@/lib/license/license';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { branchId, licenseKey, expirationDate } = body;

    // Validate required fields
    if (!branchId || !licenseKey || !expirationDate) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: branchId, licenseKey, expirationDate' },
        { status: 400 }
      );
    }

    // Parse expiration date
    const expDate = new Date(expirationDate);
    if (isNaN(expDate.getTime())) {
      return NextResponse.json(
        { success: false, message: 'Invalid expiration date format' },
        { status: 400 }
      );
    }

    // Activate license
    const result = await activateLicense(branchId, licenseKey, expDate);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    console.error('[License API] Activation error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to activate license: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}
