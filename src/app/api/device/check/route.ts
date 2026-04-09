// Device Check API
// GET /api/device/check?deviceId=xxx&branchId=xxx
// Checks if a device is registered with the backend

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    const branchId = searchParams.get('branchId');

    if (!deviceId || !branchId) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Check if device exists and is active
    const device = await db.licenseDevice.findFirst({
      where: {
        deviceId: deviceId,
        branchId: branchId,
        isActive: true
      },
      include: {
        license: true
      }
    });

    if (!device) {
      return NextResponse.json({
        success: true,
        valid: false,
        reason: 'Device not found or inactive'
      });
    }

    // If device has a license, check if license is valid
    if (device.license) {
      if (device.license.isRevoked) {
        return NextResponse.json({
          success: true,
          valid: false,
          reason: 'License has been revoked'
        });
      }

      if (new Date(device.license.expirationDate) < new Date()) {
        return NextResponse.json({
          success: true,
          valid: false,
          reason: 'License has expired'
        });
      }
    }

    // Update last active time
    await db.licenseDevice.update({
      where: { id: device.id },
      data: { lastActive: new Date() }
    });

    return NextResponse.json({
      success: true,
      valid: true,
      device: {
        id: device.id,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        registeredAt: device.registeredAt,
        lastActive: device.lastActive
      }
    });
  } catch (error: any) {
    console.error('[Device Check] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check device',
        details: error.message
      },
      { status: 500 }
    );
  }
}
