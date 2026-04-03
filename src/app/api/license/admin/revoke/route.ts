// License revocation API endpoint
// POST /api/license/admin/revoke - Revoke a license

import { NextRequest, NextResponse } from 'next/server';
import { revokeLicense } from '@/lib/license/manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { branchId, reason } = body;

    if (!branchId) {
      return NextResponse.json(
        { success: false, message: 'Missing required field: branchId' },
        { status: 400 }
      );
    }

    const success = await revokeLicense(branchId, reason || 'License revoked by admin');

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'License revoked successfully'
      });
    } else {
      return NextResponse.json(
        { success: false, message: 'Failed to revoke license' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[License Admin API] Revoke error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to revoke license: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}
