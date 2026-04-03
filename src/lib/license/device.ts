// Device fingerprinting utilities
// Works for both PC and mobile devices, both online and offline

export interface DeviceInfo {
  deviceId: string;       // Unique device fingerprint
  deviceName: string;     // User-friendly name
  deviceType: 'pc' | 'mobile' | 'tablet';
  osInfo: string;
  browserInfo?: string;
}

/**
 * Generate a unique device fingerprint
 * Uses multiple device characteristics to create a stable identifier
 */
export function generateDeviceFingerprint(): string {
  // Collect device characteristics
  const characteristics: string[] = [];

  // Screen info
  characteristics.push(`${screen.width}x${screen.height}`);
  characteristics.push(`${window.devicePixelRatio}`);

  // User agent
  characteristics.push(navigator.userAgent);

  // Language
  characteristics.push(navigator.language);

  // Platform
  characteristics.push(navigator.platform);

  // Hardware concurrency (CPU cores)
  if (navigator.hardwareConcurrency) {
    characteristics.push(navigator.hardwareConcurrency.toString());
  }

  // Device memory (if available)
  if ('deviceMemory' in navigator && typeof (navigator as any).deviceMemory === 'number') {
    characteristics.push((navigator as any).deviceMemory.toString());
  }

  // Touch support
  characteristics.push(navigator.maxTouchPoints.toString());

  // Color depth
  characteristics.push(screen.colorDepth.toString());

  // Create a hash from the characteristics
  const combined = characteristics.join('|');
  return simpleHash(combined);
}

/**
 * Simple hash function for generating device IDs
 * Uses FNV-1a hash algorithm
 */
function simpleHash(str: string): string {
  let hash = 0x811c9dc5;
  const prime = 0x01000193;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, prime);
  }

  // Convert to hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Detect device type
 */
export function detectDeviceType(): 'pc' | 'mobile' | 'tablet' {
  const userAgent = navigator.userAgent;
  const maxTouchPoints = navigator.maxTouchPoints;

  // Check if it's a mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  // Check if it's a tablet
  const isTablet = /iPad|Android(?!.*Mobile)|Tablet/i.test(userAgent) ||
                   (isMobile && maxTouchPoints > 0 && screen.width >= 768);

  if (isTablet) {
    return 'tablet';
  }

  if (isMobile) {
    return 'mobile';
  }

  return 'pc';
}

/**
 * Get OS information
 */
export function getOSInfo(): string {
  const userAgent = navigator.userAgent;
  let os = 'Unknown';

  if (userAgent.indexOf('Win') !== -1) {
    os = 'Windows';
    if (userAgent.indexOf('Windows NT 10.0') !== -1) os = 'Windows 10/11';
    else if (userAgent.indexOf('Windows NT 6.3') !== -1) os = 'Windows 8.1';
    else if (userAgent.indexOf('Windows NT 6.2') !== -1) os = 'Windows 8';
    else if (userAgent.indexOf('Windows NT 6.1') !== -1) os = 'Windows 7';
  } else if (userAgent.indexOf('Mac') !== -1) {
    os = 'macOS';
  } else if (userAgent.indexOf('Linux') !== -1) {
    os = 'Linux';
  } else if (userAgent.indexOf('Android') !== -1) {
    os = 'Android';
  } else if (userAgent.indexOf('iOS') !== -1 || userAgent.indexOf('iPhone') !== -1 || userAgent.indexOf('iPad') !== -1) {
    os = 'iOS';
  }

  return os;
}

/**
 * Get browser information
 */
export function getBrowserInfo(): string {
  const userAgent = navigator.userAgent;
  let browser = 'Unknown';

  if (userAgent.indexOf('Chrome') !== -1) {
    browser = 'Chrome';
  } else if (userAgent.indexOf('Safari') !== -1) {
    browser = 'Safari';
  } else if (userAgent.indexOf('Firefox') !== -1) {
    browser = 'Firefox';
  } else if (userAgent.indexOf('Edge') !== -1) {
    browser = 'Edge';
  } else if (userAgent.indexOf('MSIE') !== -1 || userAgent.indexOf('Trident') !== -1) {
    browser = 'Internet Explorer';
  }

  return browser;
}

/**
 * Generate a user-friendly device name
 */
export function generateDeviceName(): string {
  const deviceType = detectDeviceType();
  const osInfo = getOSInfo();
  const browserInfo = getBrowserInfo();

  const typeLabels = {
    pc: 'PC',
    mobile: 'Mobile',
    tablet: 'Tablet'
  };

  if (deviceType === 'pc') {
    return `${osInfo} ${browserInfo}`;
  } else {
    return `${osInfo} ${typeLabels[deviceType]}`;
  }
}

/**
 * Get complete device information
 */
export function getDeviceInfo(): DeviceInfo {
  const deviceId = generateDeviceFingerprint();
  const deviceType = detectDeviceType();
  const osInfo = getOSInfo();
  const browserInfo = getBrowserInfo();
  const deviceName = generateDeviceName();

  return {
    deviceId,
    deviceName,
    deviceType,
    osInfo,
    browserInfo
  };
}

/**
 * Get or create device ID from localStorage
 * This ensures the same device uses the same ID across sessions
 */
export function getStoredDeviceId(): string {
  const storageKey = 'emperor_device_id';

  if (typeof window === 'undefined') {
    return '';
  }

  // Check if we already have a stored device ID
  let deviceId = localStorage.getItem(storageKey);

  if (!deviceId) {
    // Generate a new device ID
    deviceId = generateDeviceFingerprint();
    localStorage.setItem(storageKey, deviceId);
  }

  return deviceId;
}
