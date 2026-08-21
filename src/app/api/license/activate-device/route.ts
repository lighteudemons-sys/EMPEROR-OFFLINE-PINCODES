// License activation API endpoint
// POST /api/license/activate-device

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateLicenseKey } from '@/lib/license/license';
import { registerDeviceOnLogin } from '@/lib/license/manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { licenseKey } = body;

    // Validate required fields
    if (!licenseKey) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: licenseKey' },
        { status: 400 }
      );
    }

    // Validate the license key format and signature
    const validation = validateLicenseKey(licenseKey);

    if (!validation.isValid) {
      return NextResponse.json(
        { 
          success: false, 
          error: validation.error || 'Invalid license key' 
        },
        { status: 400 }
      );
    }

    // Check if license is expired
    if (validation.isExpired) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'License has expired. Please contact administrator.' 
        },
        { status: 403 }
      );
    }

    // Find branch by license key
    const branch = await db.branch.findFirst({
      where: {
        OR: [
          { licenseKey: licenseKey },
          {
            licenses: {
              some: {
                licenseKey: licenseKey,
                isRevoked: false
              }
            }
          }
        ]
      },
      include: {
        licenses: true
      }
    });

    if (!branch) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'License key not found. Please contact administrator.' 
        },
        { status: 404 }
      );
    }

    // Check if branch is active
    if (!branch.isActive) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Branch "${branch.branchName}" is deactivated. Please contact administrator.` 
        },
        { status: 403 }
      );
    }

    // Get or create license record
    let license = branch.licenses[0];

    if (!license) {
      // Create new license record
      const expirationDate = validation.data?.expirationDate 
        ? new Date(validation.data.expirationDate)
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year

      license = await db.branchLicense.create({
        data: {
          branchId: branch.id,
          licenseKey,
          activationDate: new Date(),
          expirationDate,
          maxDevices: validation.data?.maxDevices || 5,
          isRevoked: false
        }
      });
    } else {
      // Check if license is revoked
      if (license.isRevoked) {
        return NextResponse.json(
          { 
            success: false, 
            error: license.revokedReason || 'License has been revoked. Please contact administrator.' 
          },
          { status: 403 }
        );
      }

      // Check if license is expired
      if (new Date(license.expirationDate) < new Date()) {
        return NextResponse.json(
          { 
            success: false, 
            error: `License expired on ${new Date(license.expirationDate).toLocaleDateString()}. Please contact administrator.` 
          },
          { status: 403 }
        );
      }
    }

    // Register the device for this license
    const userAgent = request.headers.get('user-agent') || 'Unknown';
    const deviceResult = await registerDeviceOnLogin(
      branch.id,
      license.id,
      userAgent
    );

    if (!deviceResult.success) {
      console.error('[License Activation] Failed to register device:', deviceResult);
      // Don't fail activation if device registration fails
    }

    return NextResponse.json({
      success: true,
      message: 'License activated successfully',
      branchId: branch.id,
      branchName: branch.branchName,
      expirationDate: license.expirationDate.toISOString(),
      isNewDevice: deviceResult.isNewDevice,
      maxDevices: license.maxDevices
    }, {
      headers: {
        'Set-Cookie': `activated_branch_id=${branch.id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`
      }
    });
  } catch (error: any) {
    console.error('[License Activation] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to activate license',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
