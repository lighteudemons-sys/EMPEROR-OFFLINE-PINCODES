// License manager - handles license activation and device registration
// Works both online and offline

import { db } from '@/lib/db';
import { generateLicenseKey, validateLicenseKey, LicenseInfo, LicenseData } from './license';
import { getDeviceInfo, DeviceInfo } from './device';

export interface ActivationResult {
  success: boolean;
  message: string;
  licenseInfo?: LicenseInfo;
  isNewDevice?: boolean;
  deviceCount?: number;
}

export interface DeviceRegistration {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  osInfo: string;
  lastActive: Date;
  isActive: boolean;
  registeredAt: Date;
}

/**
 * Activate a license for a branch
 * Creates a license record and registers the current device
 */
export async function activateLicense(
  branchId: string,
  licenseKey: string,
  expirationDate: Date
): Promise<ActivationResult> {
  try {
    // Validate the license key
    const validation = validateLicenseKey(licenseKey);

    if (!validation.isValid) {
      return {
        success: false,
        message: validation.error || 'Invalid license key'
      };
    }

    // Check if license already exists for this branch
    const existingLicense = await db.branchLicense.findUnique({
      where: { branchId },
      include: { devices: true }
    });

    if (existingLicense) {
      // Update existing license
      const updatedLicense = await db.branchLicense.update({
        where: { branchId },
        data: {
          licenseKey,
          expirationDate,
          maxDevices: validation.data?.maxDevices || 5,
          isRevoked: false,
          revokedReason: null,
          updatedAt: new Date()
        }
      });

      // Register current device
      const deviceResult = await registerDevice(
        branchId,
        updatedLicense.id,
        validation.data?.maxDevices || 5
      );

      return {
        success: deviceResult.success,
        message: deviceResult.success
          ? 'License updated successfully'
          : deviceResult.message,
        licenseInfo: validation,
        isNewDevice: deviceResult.isNewDevice,
        deviceCount: deviceResult.deviceCount
      };
    }

    // Create new license
    const newLicense = await db.branchLicense.create({
      data: {
        branchId,
        licenseKey,
        activationDate: new Date(),
        expirationDate,
        maxDevices: validation.data?.maxDevices || 5,
        isRevoked: false
      }
    });

    // Register current device
    const deviceResult = await registerDevice(
      branchId,
      newLicense.id,
      validation.data?.maxDevices || 5
    );

    return {
      success: deviceResult.success,
      message: deviceResult.success
        ? 'License activated successfully'
        : deviceResult.message,
      licenseInfo: validation,
      isNewDevice: deviceResult.isNewDevice,
      deviceCount: deviceResult.deviceCount
    };
  } catch (error) {
    console.error('[License] Activation error:', error);
    return {
      success: false,
      message: `Failed to activate license: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Register or update a device for a license
 */
async function registerDevice(
  branchId: string,
  licenseId: string,
  maxDevices: number
): Promise<{ success: boolean; message: string; isNewDevice?: boolean; deviceCount?: number }> {
  try {
    const deviceInfo = getDeviceInfo();

    // Check if device is already registered
    const existingDevice = await db.licenseDevice.findUnique({
      where: {
        licenseId_deviceId: {
          licenseId,
          deviceId: deviceInfo.deviceId
        }
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

      // Get total device count
      const deviceCount = await db.licenseDevice.count({
        where: { licenseId, isActive: true }
      });

      return {
        success: true,
        message: 'Device already registered',
        isNewDevice: false,
        deviceCount
      };
    }

    // Check if we've reached the device limit
    const activeDevices = await db.licenseDevice.count({
      where: { licenseId, isActive: true }
    });

    if (activeDevices >= maxDevices) {
      // Get list of devices for error message
      const allDevices = await db.licenseDevice.findMany({
        where: { licenseId },
        orderBy: { lastActive: 'desc' }
      });

      return {
        success: false,
        message: `Device limit reached. Maximum ${maxDevices} devices allowed. Active devices: ${allDevices.map(d => d.deviceName).join(', ')}`
      };
    }

    // Register new device
    await db.licenseDevice.create({
      data: {
        branchId,
        licenseId,
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        osInfo: deviceInfo.osInfo,
        browserInfo: deviceInfo.browserInfo,
        lastActive: new Date(),
        isActive: true,
        registeredAt: new Date()
      }
    });

    const newDeviceCount = activeDevices + 1;

    return {
      success: true,
      message: 'New device registered successfully',
      isNewDevice: true,
      deviceCount: newDeviceCount
    };
  } catch (error) {
    console.error('[License] Device registration error:', error);
    return {
      success: false,
      message: `Failed to register device: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Validate license for a branch (includes device check)
 */
export async function validateBranchLicense(branchId: string): Promise<LicenseInfo> {
  try {
    // Get license for branch
    const license = await db.branchLicense.findUnique({
      where: { branchId },
      include: { devices: true }
    });

    if (!license) {
      return {
        isValid: false,
        data: null,
        error: 'No license found for this branch'
      };
    }

    // Check if license is revoked
    if (license.isRevoked) {
      return {
        isValid: false,
        data: null,
        error: license.revokedReason || 'License has been revoked'
      };
    }

    // Validate license key
    const validation = validateLicenseKey(license.licenseKey);

    if (!validation.isValid) {
      return validation;
    }

    // Count active devices
    const activeDeviceCount = license.devices.filter(d => d.isActive).length;

    return {
      isValid: true,
      data: validation.data,
      isExpired: validation.isExpired,
      deviceCount: activeDeviceCount,
      remainingDevices: (validation.data?.maxDevices || 5) - activeDeviceCount
    };
  } catch (error) {
    console.error('[License] Validation error:', error);
    return {
      isValid: false,
      data: null,
      error: `Failed to validate license: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Get all devices for a branch's license
 */
export async function getLicenseDevices(branchId: string): Promise<DeviceRegistration[]> {
  try {
    const license = await db.branchLicense.findUnique({
      where: { branchId },
      include: { devices: true }
    });

    if (!license) {
      return [];
    }

    return license.devices.map(device => ({
      id: device.id,
      deviceId: device.deviceId,
      deviceName: device.deviceName || 'Unknown Device',
      deviceType: device.deviceType || 'unknown',
      osInfo: device.osInfo || 'Unknown OS',
      lastActive: device.lastActive,
      isActive: device.isActive,
      registeredAt: device.registeredAt
    }));
  } catch (error) {
    console.error('[License] Failed to get devices:', error);
    return [];
  }
}

/**
 * Remove a device from a license
 */
export async function removeDevice(deviceId: string, licenseId: string): Promise<boolean> {
  try {
    await db.licenseDevice.delete({
      where: { id: deviceId }
    });

    return true;
  } catch (error) {
    console.error('[License] Failed to remove device:', error);
    return false;
  }
}

/**
 * Revoke a license
 */
export async function revokeLicense(branchId: string, reason: string): Promise<boolean> {
  try {
    await db.branchLicense.update({
      where: { branchId },
      data: {
        isRevoked: true,
        revokedReason: reason
      }
    });

    return true;
  } catch (error) {
    console.error('[License] Failed to revoke license:', error);
    return false;
  }
}

/**
 * Update license expiration date
 */
export async function updateLicenseExpiration(
  branchId: string,
  newExpirationDate: Date
): Promise<boolean> {
  try {
    await db.branchLicense.update({
      where: { branchId },
      data: {
        expirationDate: newExpirationDate
      }
    });

    return true;
  } catch (error) {
    console.error('[License] Failed to update expiration:', error);
    return false;
  }
}

/**
 * Get license statistics for admin dashboard
 */
export async function getLicenseStats() {
  try {
    const [totalLicenses, activeLicenses, expiredLicenses, revokedLicenses, totalDevices] =
      await Promise.all([
        db.branchLicense.count(),
        db.branchLicense.count({ where: { isRevoked: false } }),
        db.branchLicense.count({
          where: {
            isRevoked: false,
            expirationDate: { lt: new Date() }
          }
        }),
        db.branchLicense.count({ where: { isRevoked: true } }),
        db.licenseDevice.count({ where: { isActive: true } })
      ]);

    return {
      totalLicenses,
      activeLicenses,
      expiredLicenses,
      revokedLicenses,
      totalDevices
    };
  } catch (error) {
    console.error('[License] Failed to get stats:', error);
    return {
      totalLicenses: 0,
      activeLicenses: 0,
      expiredLicenses: 0,
      revokedLicenses: 0,
      totalDevices: 0
    };
  }
}
