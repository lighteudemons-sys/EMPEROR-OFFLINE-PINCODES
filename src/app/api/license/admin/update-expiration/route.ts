// License expiration update API endpoint
// POST /api/license/admin/update-expiration - Update license expiration date

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { updateLicenseExpiration } from '@/lib/license/manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { branchId, expirationDate } = body;

    if (!branchId || !expirationDate) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: branchId, expirationDate' },
        { status: 400 }
      );
    }

    // Parse the expiration date
    const newExpirationDate = new Date(expirationDate);

    if (isNaN(newExpirationDate.getTime())) {
      return NextResponse.json(
        { success: false, message: 'Invalid expiration date format' },
        { status: 400 }
      );
    }

    // Check if the new date is in the future
    if (newExpirationDate <= new Date()) {
      return NextResponse.json(
        { success: false, message: 'Expiration date must be in the future' },
        { status: 400 }
      );
    }

    // Update license expiration
    const success = await updateLicenseExpiration(branchId, newExpirationDate);

    if (!success) {
      return NextResponse.json(
        { success: false, message: 'Failed to update license expiration. License not found.' },
        { status: 404 }
      );
    }

    // Also update the branch's licenseExpiresAt field
    await db.branch.update({
      where: { id: branchId },
      data: {
        licenseExpiresAt: newExpirationDate
      }
    });

    return NextResponse.json({
      success: true,
      message: 'License expiration date updated successfully'
    });
  } catch (error) {
    console.error('[License Admin API] Update expiration error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to update expiration: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}
