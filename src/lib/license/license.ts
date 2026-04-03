// License generation and validation utilities
// Works both online and offline

import crypto from 'crypto';

export interface LicenseData {
  branchId: string;
  expirationDate: string;  // ISO 8601 date string
  maxDevices: number;
  tier: string;  // "STANDARD" (single tier for now)
}

export interface LicenseInfo {
  isValid: boolean;
  data: LicenseData | null;
  error?: string;
  isExpired?: boolean;
  deviceCount?: number;
  remainingDevices?: number;
}

// Secret key for signing licenses (in production, this should be in environment variables)
const LICENSE_SECRET = process.env.LICENSE_SECRET || 'emperor-pos-license-secret-key-2024-change-in-production';

/**
 * Generate a cryptographically signed license key
 */
export function generateLicenseKey(data: LicenseData): string {
  // Create license payload
  const payload = JSON.stringify(data, Object.keys(data).sort());

  // Create signature using HMAC-SHA256
  const signature = crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(payload)
    .digest('hex');

  // Combine payload and signature (base64 encoded)
  const combined = `${payload}.${signature}`;
  return Buffer.from(combined).toString('base64');
}

/**
 * Validate a license key (works offline)
 */
export function validateLicenseKey(licenseKey: string): LicenseInfo {
  try {
    // Decode the license key
    const combined = Buffer.from(licenseKey, 'base64').toString('utf-8');

    // Split payload and signature
    const parts = combined.split('.');
    if (parts.length !== 2) {
      return {
        isValid: false,
        data: null,
        error: 'Invalid license key format'
      };
    }

    const [payload, signature] = parts;

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', LICENSE_SECRET)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      return {
        isValid: false,
        data: null,
        error: 'Invalid license signature'
      };
    }

    // Parse license data
    const data: LicenseData = JSON.parse(payload);

    // Check expiration
    const now = new Date();
    const expirationDate = new Date(data.expirationDate);

    if (now > expirationDate) {
      return {
        isValid: false,
        data,
        error: 'License has expired',
        isExpired: true
      };
    }

    // Validate tier (only STANDARD supported for now)
    if (data.tier !== 'STANDARD') {
      return {
        isValid: false,
        data,
        error: 'Unsupported license tier'
      };
    }

    return {
      isValid: true,
      data,
      isExpired: false,
      remainingDevices: data.maxDevices
    };
  } catch (error) {
    return {
      isValid: false,
      data: null,
      error: `Failed to validate license: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Parse license key without validation (for display purposes)
 */
export function parseLicenseKey(licenseKey: string): LicenseData | null {
  try {
    const combined = Buffer.from(licenseKey, 'base64').toString('utf-8');
    const parts = combined.split('.');

    if (parts.length !== 2) {
      return null;
    }

    const [payload] = parts;
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Format license key for display (show only first and last 4 characters)
 */
export function formatLicenseKey(licenseKey: string): string {
  if (!licenseKey || licenseKey.length < 8) {
    return licenseKey;
  }

  const start = licenseKey.substring(0, 4);
  const end = licenseKey.substring(licenseKey.length - 4);
  const middle = '•'.repeat(8);

  return `${start}${middle}${end}`;
}

/**
 * Check if a license is expiring soon (within 30 days)
 */
export function isLicenseExpiringSoon(expirationDate: string | Date): boolean {
  const now = new Date();
  const expiration = typeof expirationDate === 'string'
    ? new Date(expirationDate)
    : expirationDate;

  const daysUntilExpiration = Math.floor(
    (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return daysUntilExpiration <= 30 && daysUntilExpiration >= 0;
}

/**
 * Get days until license expiration
 */
export function getDaysUntilExpiration(expirationDate: string | Date): number {
  const now = new Date();
  const expiration = typeof expirationDate === 'string'
    ? new Date(expirationDate)
    : expirationDate;

  return Math.floor(
    (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
}
