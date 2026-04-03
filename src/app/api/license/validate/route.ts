// License validation API endpoint
// POST /api/license/validate

import { NextRequest, NextResponse } from 'next/server';
import { validateBranchLicense } from '@/lib/license/manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { branchId } = body;

    // Validate required fields
    if (!branchId) {
      return NextResponse.json(
        { success: false, message: 'Missing required field: branchId' },
        { status: 400 }
      );
    }

    // Validate license
    const result = await validateBranchLicense(branchId);

    return NextResponse.json({
      success: result.isValid,
      isValid: result.isValid,
      data: result.data,
      error: result.error,
      isExpired: result.isExpired,
      deviceCount: result.deviceCount,
      remainingDevices: result.remainingDevices
    });
  } catch (error) {
    console.error('[License API] Validation error:', error);
    return NextResponse.json(
      {
        success: false,
        isValid: false,
        message: `Failed to validate license: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}
