// Admin license management API endpoint
// GET /api/license/admin - Get all licenses and devices
// POST /api/license/admin/generate - Generate a new license key

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateLicenseKey, LicenseData } from '@/lib/license/license';
import { getLicenseStats, getLicenseDevices } from '@/lib/license/manager';

// GET - Get all licenses with devices
export async function GET(request: NextRequest) {
  try {
    const licenses = await db.branchLicense.findMany({
      include: {
        devices: true,
        branch: {
          select: {
            id: true,
            branchName: true,
            address: true,
            phone: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get stats
    const stats = await getLicenseStats();

    return NextResponse.json({
      success: true,
      licenses,
      stats
    });
  } catch (error) {
    console.error('[License Admin API] Get error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to get licenses: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}

// POST - Generate a new license key
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

    // Get branch info
    const branch = await db.branch.findUnique({
      where: { id: branchId }
    });

    if (!branch) {
      return NextResponse.json(
        { success: false, message: 'Branch not found' },
        { status: 404 }
      );
    }

    // Create license data
    const licenseData: LicenseData = {
      branchId,
      expirationDate: new Date(expirationDate).toISOString(),
      maxDevices: 5,  // Fixed at 5 devices
      tier: 'STANDARD'
    };

    // Generate license key
    const licenseKey = generateLicenseKey(licenseData);

    // Check if a license already exists for this branch
    const existingLicense = await db.branchLicense.findFirst({
      where: { branchId }
    });

    if (existingLicense) {
      // Update existing license
      await db.branchLicense.update({
        where: { id: existingLicense.id },
        data: {
          licenseKey,
          expirationDate: new Date(expirationDate),
          isRevoked: false,
          revokedReason: null
        }
      });
    } else {
      // Create new license
      await db.branchLicense.create({
        data: {
          branchId,
          licenseKey,
          expirationDate: new Date(expirationDate),
          maxDevices: 5,
          isRevoked: false
        }
      });
    }

    // Update branch's license key
    await db.branch.update({
      where: { id: branchId },
      data: {
        licenseKey,
        licenseExpiresAt: new Date(expirationDate)
      }
    });

    return NextResponse.json({
      success: true,
      licenseKey,
      licenseData
    });
  } catch (error) {
    console.error('[License Admin API] Generate error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to generate license: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}
