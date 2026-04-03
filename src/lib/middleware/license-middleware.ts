// License validation middleware for API routes
// Can be used to protect routes that require a valid license

import { NextResponse } from 'next/server';
import { validateBranchLicense } from '@/lib/license/manager';

export interface LicenseCheckResult {
  isValid: boolean;
  error?: string;
  licenseInfo?: any;
}

/**
 * Check if a branch has a valid license
 * This can be called from API routes to validate licenses
 */
export async function checkBranchLicense(branchId: string): Promise<LicenseCheckResult> {
  if (!branchId) {
    return {
      isValid: false,
      error: 'Branch ID is required'
    };
  }

  // Admin users (no branch) don't need license validation
  if (branchId === 'admin' || branchId === '') {
    return {
      isValid: true
    };
  }

  try {
    const result = await validateBranchLicense(branchId);

    if (!result.isValid) {
      return {
        isValid: false,
        error: result.error || 'Invalid license',
        licenseInfo: result
      };
    }

    // Check if expired
    if (result.isExpired) {
      return {
        isValid: false,
        error: 'License has expired',
        licenseInfo: result
      };
    }

    return {
      isValid: true,
      licenseInfo: result
    };
  } catch (error) {
    console.error('[License Middleware] Validation error:', error);
    return {
      isValid: false,
      error: 'Failed to validate license'
    };
  }
}

/**
 * Middleware function to wrap API route handlers with license validation
 * Usage: withLicenseValidation(handler)
 */
export function withLicenseValidation(
  handler: (request: Request, context?: any) => Promise<NextResponse>,
  options: {
    requireLicense?: boolean;
    allowAdminBypass?: boolean;
  } = {}
) {
  return async (request: Request, context?: any) => {
    const { requireLicense = true, allowAdminBypass = true } = options;

    // Get branch ID from request
    let branchId: string | null = null;

    try {
      // Try to get branch ID from request body or headers
      const clonedRequest = request.clone();
      const contentType = clonedRequest.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        const body = await clonedRequest.json();
        branchId = body.branchId || body.branch?.id;
      }

      // Also check headers
      if (!branchId) {
        branchId = clonedRequest.headers.get('x-branch-id');
      }

      // Allow admin bypass
      if (allowAdminBypass && (!branchId || branchId === 'admin')) {
        return handler(request, context);
      }

      // If license not required, proceed
      if (!requireLicense) {
        return handler(request, context);
      }

      // Validate license
      if (branchId) {
        const check = await checkBranchLicense(branchId);

        if (!check.isValid) {
          return NextResponse.json(
            {
              success: false,
              error: 'License validation failed',
              message: check.error || 'Invalid or expired license'
            },
            { status: 403 }
          );
        }
      }

      // License is valid, proceed with the handler
      return handler(request, context);
    } catch (error) {
      console.error('[License Middleware] Error:', error);
      // If middleware fails, allow the request to proceed (fail-open approach)
      // This ensures the application doesn't break if there's a license issue
      return handler(request, context);
    }
  };
}

/**
 * Simple license check that returns license info without blocking
 * Use this for logging or UI warnings
 */
export async function getLicenseInfo(branchId: string | null) {
  if (!branchId || branchId === 'admin') {
    return {
      isValid: true,
      requiresLicense: false,
      message: 'Admin user, no license required'
    };
  }

  try {
    const result = await validateBranchLicense(branchId);

    return {
      isValid: result.isValid,
      requiresLicense: true,
      isExpired: result.isExpired,
      deviceCount: result.deviceCount,
      remainingDevices: result.remainingDevices,
      expirationDate: result.data?.expirationDate,
      maxDevices: result.data?.maxDevices,
      error: result.error
    };
  } catch (error) {
    console.error('[License] Get info error:', error);
    return {
      isValid: false,
      requiresLicense: true,
      error: 'Failed to get license information'
    };
  }
}
