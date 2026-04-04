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
    const existingLicense = await db.branchLicense.findFirst({
      where: { branchId },
      include: { devices: true }
    });

    if (existingLicense) {
      // Update existing license using the unique id
      const updatedLicense = await db.branchLicense.update({
        where: { id: existingLicense.id },
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
    const license = await db.branchLicense.findFirst({
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
    const license = await db.branchLicense.findFirst({
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
    // First find the license by branchId
    const license = await db.branchLicense.findFirst({
      where: { branchId }
    });

    if (!license) {
      console.error('[License] No license found for branch:', branchId);
      return false;
    }

    // Update using the unique id
    await db.branchLicense.update({
      where: { id: license.id },
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
    // First find the license by branchId
    const license = await db.branchLicense.findFirst({
      where: { branchId }
    });

    if (!license) {
      console.error('[License] No license found for branch:', branchId);
      return false;
    }

    // Update using the unique id
    await db.branchLicense.update({
      where: { id: license.id },
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

/**
 * Register or update a device during login (server-side)
 * This function extracts device info from request headers/user-agent
 * and does NOT enforce device limits (allows offline access)
 */
export async function registerDeviceOnLogin(
  branchId: string,
  licenseId: string,
  userAgent: string,
  deviceId?: string,
  deviceName?: string,
  deviceType?: string,
  osInfo?: string
): Promise<{ success: boolean; isNewDevice?: boolean }> {
  try {
    // If no device info provided, extract from user-agent
    const parsedUA = userAgent ? parseUserAgent(userAgent) : null;

    // Use provided values or fall back to parsed values
    const finalDeviceId = deviceId || generateDeviceIdFromUA(userAgent);
    const finalDeviceName = deviceName || parsedUA?.deviceName || 'Unknown Device';
    const finalDeviceType = deviceType || parsedUA?.deviceType || 'pc';
    const finalOSInfo = osInfo || parsedUA?.osInfo || 'Unknown OS';
    const finalBrowserInfo = parsedUA?.browserInfo || 'Unknown Browser';

    // Check if device is already registered
    const existingDevice = await db.licenseDevice.findUnique({
      where: {
        licenseId_deviceId: {
          licenseId,
          deviceId: finalDeviceId
        }
      }
    });

    if (existingDevice) {
      // Update last active time and mark as active
      await db.licenseDevice.update({
        where: { id: existingDevice.id },
        data: {
          lastActive: new Date(),
          isActive: true,
          deviceName: finalDeviceName,
          osInfo: finalOSInfo,
          browserInfo: finalBrowserInfo
        }
      });

      console.log('[License] Device already registered, updated last active:', finalDeviceId);
      return { success: true, isNewDevice: false };
    }

    // Register new device (no device limit check for login - allows offline access)
    await db.licenseDevice.create({
      data: {
        branchId,
        licenseId,
        deviceId: finalDeviceId,
        deviceName: finalDeviceName,
        deviceType: finalDeviceType,
        osInfo: finalOSInfo,
        browserInfo: finalBrowserInfo,
        lastActive: new Date(),
        isActive: true,
        registeredAt: new Date()
      }
    });

    console.log('[License] New device registered on login:', finalDeviceId);
    return { success: true, isNewDevice: true };
  } catch (error) {
    console.error('[License] Device registration on login error:', error);
    // Don't fail login if device registration fails
    return { success: false, isNewDevice: false };
  }
}

/**
 * Parse user agent string to extract device information
 */
function parseUserAgent(userAgent: string) {
  let osInfo = 'Unknown OS';
  let browserInfo = 'Unknown Browser';
  let deviceType: 'pc' | 'mobile' | 'tablet' = 'pc';
  let deviceName = 'Unknown Device';

  // Parse OS
  if (userAgent.indexOf('Win') !== -1) {
    osInfo = 'Windows';
    if (userAgent.indexOf('Windows NT 10.0') !== -1) osInfo = 'Windows 10/11';
    else if (userAgent.indexOf('Windows NT 6.3') !== -1) osInfo = 'Windows 8.1';
    else if (userAgent.indexOf('Windows NT 6.2') !== -1) osInfo = 'Windows 8';
    else if (userAgent.indexOf('Windows NT 6.1') !== -1) osInfo = 'Windows 7';
  } else if (userAgent.indexOf('Mac') !== -1 && userAgent.indexOf('iPhone') === -1 && userAgent.indexOf('iPad') === -1) {
    osInfo = 'macOS';
  } else if (userAgent.indexOf('Linux') !== -1) {
    osInfo = 'Linux';
  } else if (userAgent.indexOf('Android') !== -1) {
    osInfo = 'Android';
  } else if (userAgent.indexOf('iOS') !== -1 || userAgent.indexOf('iPhone') !== -1 || userAgent.indexOf('iPad') !== -1) {
    osInfo = 'iOS';
  }

  // Parse browser
  if (userAgent.indexOf('Chrome') !== -1 && userAgent.indexOf('Edg') === -1) {
    browserInfo = 'Chrome';
  } else if (userAgent.indexOf('Safari') !== -1 && userAgent.indexOf('Chrome') === -1) {
    browserInfo = 'Safari';
  } else if (userAgent.indexOf('Firefox') !== -1) {
    browserInfo = 'Firefox';
  } else if (userAgent.indexOf('Edg') !== -1) {
    browserInfo = 'Edge';
  } else if (userAgent.indexOf('MSIE') !== -1 || userAgent.indexOf('Trident') !== -1) {
    browserInfo = 'Internet Explorer';
  }

  // Detect device type
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isTablet = /iPad|Android(?!.*Mobile)|Tablet/i.test(userAgent) ||
                   (isMobile && userAgent.includes('Android') && userAgent.includes('Mobile') === false);

  if (isTablet) {
    deviceType = 'tablet';
  } else if (isMobile) {
    deviceType = 'mobile';
  }

  // Generate device name
  if (deviceType === 'pc') {
    deviceName = `${osInfo} ${browserInfo}`;
  } else {
    deviceName = `${osInfo} ${deviceType === 'mobile' ? 'Mobile' : 'Tablet'}`;
  }

  return { osInfo, browserInfo, deviceType, deviceName };
}

/**
 * Generate a simple device ID from user agent
 */
function generateDeviceIdFromUA(userAgent: string): string {
  // Create a simple hash from user agent
  let hash = 0;
  for (let i = 0; i < userAgent.length; i++) {
    const char = userAgent.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}
