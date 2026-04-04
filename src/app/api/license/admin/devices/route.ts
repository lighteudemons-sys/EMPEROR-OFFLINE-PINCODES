// Device management API endpoint
// GET /api/license/admin/devices?branchId=xxx - Get devices for a branch
// DELETE /api/license/admin/devices?deviceId=xxx&licenseId=xxx - Remove a device

import { NextRequest, NextResponse } from 'next/server';
import { getLicenseDevices, removeDevice } from '@/lib/license/manager';

// GET - Get devices for a branch
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const branchId = searchParams.get('branchId');

    if (!branchId) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameter: branchId' },
        { status: 400 }
      );
    }

    const devices = await getLicenseDevices(branchId);

    return NextResponse.json({
      success: true,
      devices
    });
  } catch (error) {
    console.error('[License Admin API] Get devices error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to get devices: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}

// DELETE - Remove a device
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');
    const licenseId = searchParams.get('licenseId');

    if (!deviceId || !licenseId) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters: deviceId, licenseId' },
        { status: 400 }
      );
    }

    const success = await removeDevice(deviceId, licenseId);

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Device removed successfully'
      });
    } else {
      return NextResponse.json(
        { success: false, message: 'Failed to remove device' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[License Admin API] Remove device error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to remove device: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}
