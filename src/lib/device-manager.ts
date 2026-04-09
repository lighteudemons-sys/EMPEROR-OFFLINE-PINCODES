// Device Management for Persistent Authentication
// Stores device ID across browser sessions, survives cache clears

import { getIndexedDBStorage } from './storage/indexeddb-storage';

const storage = getIndexedDBStorage();

const DEVICE_ID_KEY = 'emperor_device_id';
const DEVICE_REGISTERED_KEY = 'emperor_device_registered';
const DEVICE_BRANCH_ID_KEY = 'emperor_device_branch_id';

/**
 * Generate a unique device ID that persists across sessions
 * Uses a combination of timestamp, random string, and browser fingerprint
 */
function generateDeviceId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const browserInfo = navigator.userAgent.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '');

  return `${browserInfo}-${timestamp}-${random}`.replace(/-/g, '').substring(0, 32);
}

/**
 * Get or create a persistent device ID
 * Checks multiple storage layers for persistence
 */
export async function getOrCreateDeviceId(): Promise<string> {
  // Try to get from multiple sources in order of persistence
  let deviceId: string | null = null;

  // 1. Check localStorage (most common)
  if (typeof window !== 'undefined') {
    deviceId = localStorage.getItem(DEVICE_ID_KEY);
  }

  // 2. Check IndexedDB (more persistent)
  if (!deviceId) {
    try {
      await storage.init();
      deviceId = await storage.getString(DEVICE_ID_KEY);
    } catch (error) {
      console.warn('[DeviceManager] IndexedDB not accessible:', error);
    }
  }

  // 3. Check cookie (persistent across sessions)
  if (!deviceId && typeof document !== 'undefined') {
    const cookieMatch = document.cookie.match(/emperor_device_id=([^;]+)/);
    if (cookieMatch) {
      deviceId = cookieMatch[1];
    }
  }

  // If no device ID found, generate and store it everywhere
  if (!deviceId) {
    deviceId = generateDeviceId();
    await saveDeviceId(deviceId);
  }

  return deviceId;
}

/**
 * Save device ID to all storage layers for maximum persistence
 */
async function saveDeviceId(deviceId: string): Promise<void> {
  // Save to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    localStorage.setItem('emperor_device_created', new Date().toISOString());
  }

  // Save to IndexedDB
  try {
    await storage.init();
    await storage.setString(DEVICE_ID_KEY, deviceId);
    await storage.setString('emperor_device_created', new Date().toISOString());
  } catch (error) {
    console.warn('[DeviceManager] Failed to save to IndexedDB:', error);
  }

  // Save to cookie (expires in 1 year)
  if (typeof document !== 'undefined') {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `emperor_device_id=${deviceId}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
  }

  console.log('[DeviceManager] Device ID saved:', deviceId);
}

/**
 * Register the device with the backend
 * Called on first successful login
 */
export async function registerDevice(branchId: string, userId: string, userRole: string): Promise<boolean> {
  try {
    const deviceId = await getOrCreateDeviceId();

    // Get device info
    const deviceInfo = getDeviceInfo();

    const response = await fetch('/api/device/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        deviceId,
        branchId,
        userId,
        userRole,
        deviceInfo
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[DeviceManager] Device registration failed:', error);
      return false;
    }

    // Mark device as registered locally
    await markDeviceRegistered(branchId);

    console.log('[DeviceManager] Device registered successfully:', deviceId);
    return true;
  } catch (error) {
    console.error('[DeviceManager] Device registration error:', error);
    return false;
  }
}

/**
 * Mark device as registered locally
 */
async function markDeviceRegistered(branchId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(DEVICE_REGISTERED_KEY, 'true');
    localStorage.setItem(DEVICE_BRANCH_ID_KEY, branchId);
    localStorage.setItem('emperor_device_registered_at', new Date().toISOString());
  }

  try {
    await storage.init();
    await storage.setString(DEVICE_REGISTERED_KEY, 'true');
    await storage.setString(DEVICE_BRANCH_ID_KEY, branchId);
    await storage.setString('emperor_device_registered_at', new Date().toISOString());
  } catch (error) {
    console.warn('[DeviceManager] Failed to mark device registered:', error);
  }
}

/**
 * Check if device is already registered
 */
export async function isDeviceRegistered(): Promise<{ registered: boolean; branchId?: string }> {
  // Check localStorage
  let registered = localStorage.getItem(DEVICE_REGISTERED_KEY) === 'true';
  let branchId = localStorage.getItem(DEVICE_BRANCH_ID_KEY) || undefined;

  // Check IndexedDB as backup
  if (!registered) {
    try {
      await storage.init();
      registered = await storage.getString(DEVICE_REGISTERED_KEY) === 'true';
      if (!branchId) {
        branchId = await storage.getString(DEVICE_BRANCH_ID_KEY) || undefined;
      }
    } catch (error) {
      console.warn('[DeviceManager] Failed to check device registration:', error);
    }
  }

  // If locally registered, verify with backend
  if (registered && branchId) {
    try {
      const deviceId = await getOrCreateDeviceId();
      const response = await fetch(`/api/device/check?deviceId=${deviceId}&branchId=${branchId}`);

      if (response.ok) {
        const data = await response.json();
        if (!data.valid) {
          // Device not found in backend, clear local flag
          await clearDeviceRegistration();
          return { registered: false };
        }
      }
    } catch (error) {
      console.warn('[DeviceManager] Failed to verify device with backend:', error);
      // If backend check fails, trust local state
    }
  }

  return { registered, branchId };
}

/**
 * Clear device registration (for testing or reset)
 */
export async function clearDeviceRegistration(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(DEVICE_REGISTERED_KEY);
    localStorage.removeItem(DEVICE_BRANCH_ID_KEY);
    localStorage.removeItem('emperor_device_registered_at');
  }

  try {
    await storage.init();
    await storage.removeSetting(DEVICE_REGISTERED_KEY);
    await storage.removeSetting(DEVICE_BRANCH_ID_KEY);
    await storage.removeSetting('emperor_device_registered_at');
  } catch (error) {
    console.warn('[DeviceManager] Failed to clear device registration:', error);
  }

  // Note: Don't clear the device ID itself, just the registration
  // The device ID should persist forever
}

/**
 * Get device information for registration
 */
function getDeviceInfo() {
  const ua = navigator.userAgent;

  // Detect device type
  let deviceType = 'unknown';
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) {
    deviceType = 'mobile';
    if (/iPad/i.test(ua)) deviceType = 'tablet';
  } else if (/Tablet/i.test(ua)) {
    deviceType = 'tablet';
  } else {
    deviceType = 'pc';
  }

  // Detect OS
  let os = 'unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iOS|iPhone|iPad/i.test(ua)) os = 'iOS';

  return {
    type: deviceType,
    os,
    userAgent: ua,
    screen: {
      width: window.screen.width,
      height: window.screen.height
    },
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

/**
 * Get current device ID (without creating one)
 */
export async function getDeviceId(): Promise<string | null> {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    try {
      await storage.init();
      deviceId = await storage.getString(DEVICE_ID_KEY);
    } catch (error) {
      // Ignore
    }
  }

  return deviceId;
}
