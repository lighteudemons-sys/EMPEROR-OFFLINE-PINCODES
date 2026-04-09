'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { checkActivationStatus, isPublicRoute, isLicenseExpired } from '@/lib/license-activation-check';

interface LicenseActivationGuardProps {
  children: React.ReactNode;
}

export function LicenseActivationGuard({ children }: LicenseActivationGuardProps) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Don't check on public routes
    if (isPublicRoute(pathname)) {
      return;
    }

    // Check activation status
    const status = checkActivationStatus();

    if (!status.isActivated) {
      // Device not activated, redirect to license activation
      console.log('[LicenseGuard] Device not activated, redirecting to license activation');
      router.replace('/license-activation');
      return;
    }

    // Check if license is expired
    if (status.licenseExpires && isLicenseExpired(status.licenseExpires)) {
      console.log('[LicenseGuard] License expired, redirecting to license activation');
      // Clear expired activation data
      if (typeof window !== 'undefined') {
        localStorage.clear();
      }
      router.replace('/license-activation');
      return;
    }

    console.log('[LicenseGuard] Device activated for branch:', status.branchName);
  }, [pathname, router]);

  // Render children if all checks pass
  return <>{children}</>;
}
