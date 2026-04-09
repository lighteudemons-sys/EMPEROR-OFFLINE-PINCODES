// Device Registration API
// POST /api/device/register
// Registers a device with the backend after successful login

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, branchId, userId, userRole, deviceInfo } = body;

    if (!deviceId || !branchId || !userId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if device already exists
    const existingDevice = await db.licenseDevice.findFirst({
      where: {
        deviceId: deviceId,
        branchId: branchId
      }
    });

    if (existingDevice) {
      // Update last active time
      await db.licenseDevice.update({
        where: { id: existingDevice.id },
        data: {
          lastActive: new Date(),
          isActive: true
        }
      });

      return NextResponse.json({
        success: true,
        message: 'Device already registered',
        isNewDevice: false
      });
    }

    // Check if branch has a license
    const branch = await db.branch.findUnique({
      where: { id: branchId },
      include: {
        licenses: true
      }
    });

    if (!branch) {
      return NextResponse.json(
        { success: false, error: 'Branch not found' },
        { status: 404 }
      );
    }

    // Get or create license
    let license = branch.licenses[0];
    if (!license && branch.licenseKey) {
      // Create license record from branch license key
      license = await db.branchLicense.create({
        data: {
          branchId,
          licenseKey: branch.licenseKey,
          expirationDate: branch.licenseExpiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          maxDevices: 5,
          isRevoked: false
        }
      });
    }

    // Check device limit
    if (license) {
      const activeDevices = await db.licenseDevice.count({
        where: {
          licenseId: license.id,
          isActive: true
        }
      });

      if (activeDevices >= license.maxDevices) {
        return NextResponse.json(
          {
            success: false,
            error: `Device limit reached. Maximum ${license.maxDevices} devices allowed.`
          },
          { status: 403 }
        );
      }

      // Register new device
      await db.licenseDevice.create({
        data: {
          deviceId,
          branchId,
          licenseId: license.id,
          deviceName: `${deviceInfo?.os || 'Unknown'} ${deviceInfo?.type || 'Device'}`,
          deviceType: deviceInfo?.type || 'unknown',
          osInfo: deviceInfo?.os || 'Unknown',
          isActive: true,
          lastActive: new Date()
        }
      });
    } else {
      // Register device without license (for admin users or branches without license)
      await db.licenseDevice.create({
        data: {
          deviceId,
          branchId,
          deviceName: `${deviceInfo?.os || 'Unknown'} ${deviceInfo?.type || 'Device'}`,
          deviceType: deviceInfo?.type || 'unknown',
          osInfo: deviceInfo?.os || 'Unknown',
          isActive: true,
          lastActive: new Date()
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Device registered successfully',
      isNewDevice: true
    });
  } catch (error: any) {
    console.error('[Device Registration] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to register device',
        details: error.message
      },
      { status: 500 }
    );
  }
}
