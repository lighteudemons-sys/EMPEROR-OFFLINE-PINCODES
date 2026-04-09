// License activation check utilities
// Determines if a device needs license activation

export interface ActivationStatus {
  isActivated: boolean;
  activationTime?: string;
  branchId?: string;
  branchName?: string;
  licenseExpires?: string;
}

const STORAGE_KEYS = {
  activated: 'emperor_device_activated',
  activationTime: 'emperor_device_activation_time',
  branchId: 'emperor_branch_id',
  branchName: 'emperor_branch_name',
  licenseExpires: 'emperor_license_expires',
};

/**
 * Check if the current device has been activated
 * @returns Activation status object
 */
export function checkActivationStatus(): ActivationStatus {
  if (typeof window === 'undefined') {
    return { isActivated: false };
  }

  const isActivated = localStorage.getItem(STORAGE_KEYS.activated) === 'true';

  if (!isActivated) {
    return { isActivated: false };
  }

  return {
    isActivated: true,
    activationTime: localStorage.getItem(STORAGE_KEYS.activationTime) || undefined,
    branchId: localStorage.getItem(STORAGE_KEYS.branchId) || undefined,
    branchName: localStorage.getItem(STORAGE_KEYS.branchName) || undefined,
    licenseExpires: localStorage.getItem(STORAGE_KEYS.licenseExpires) || undefined,
  };
}

/**
 * Check if license is expired
 * @param expirationDate ISO string of expiration date
 * @returns true if expired, false otherwise
 */
export function isLicenseExpired(expirationDate: string): boolean {
  if (!expirationDate) return false;
  return new Date(expirationDate) < new Date();
}

/**
 * Get days until license expiration
 * @param expirationDate ISO string of expiration date
 * @returns number of days remaining, or 0 if expired
 */
export function getDaysUntilExpiration(expirationDate: string): number {
  const now = new Date();
  const expiration = new Date(expirationDate);
  const diffTime = expiration.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Clear activation data (for testing or reset)
 */
export function clearActivationData(): void {
  if (typeof window === 'undefined') return;

  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}

/**
 * Routes that don't require license activation
 */
export const PUBLIC_ROUTES = [
  '/license-activation',
  '/admin-login',
  '/login',
];

/**
 * Check if the current path is a public route
 * @param path Current path
 * @returns true if public, false otherwise
 */
export function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.some(route => path.startsWith(route));
}
