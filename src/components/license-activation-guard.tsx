'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { checkActivationStatus, isPublicRoute, isLicenseExpired } from '@/lib/license-activation-check';
import { useAuth } from '@/lib/auth-context';
import { isDeviceRegistered } from '@/lib/device-manager';

interface LicenseActivationGuardProps {
  children: React.ReactNode;
}

export function LicenseActivationGuard({ children }: LicenseActivationGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [isCheckingDevice, setIsCheckingDevice] = useState(true);
  const [deviceRegistered, setDeviceRegistered] = useState<{ registered: boolean; branchId?: string } | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      // Don't check on public routes
      if (isPublicRoute(pathname)) {
        setIsCheckingDevice(false);
        return;
      }

      // If user is authenticated, allow access (bypass license activation)
      // This allows:
      // 1. Admin users to login from any device without license key
      // 2. Users who have already logged in to continue using the app
      if (user) {
        console.log('[LicenseGuard] User authenticated, bypassing license activation check:', user.role);
        setIsCheckingDevice(false);
        return;
      }

      // No user session - check if device is already registered (persistent authentication)
      const registration = await isDeviceRegistered();
      setDeviceRegistered(registration);

      if (registration.registered && registration.branchId) {
        console.log('[LicenseGuard] Device already registered for branch:', registration.branchId);
        // Device is registered, allow access to login page
        setIsCheckingDevice(false);
        return;
      }

      // Check if device was activated with license key (legacy method)
      const status = checkActivationStatus();

      if (!status.isActivated) {
        // Device not activated, redirect to license activation
        console.log('[LicenseGuard] No user session, device not registered, and device not activated, redirecting to license activation');
        router.replace('/license-activation');
        setIsCheckingDevice(false);
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
        setIsCheckingDevice(false);
        return;
      }

      console.log('[LicenseGuard] Device activated for branch:', status.branchName);
      setIsCheckingDevice(false);
    };

    checkAccess();
  }, [pathname, router, user]);

  // Show loading while checking device registration
  if (isCheckingDevice) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-600">Verifying device...</p>
        </div>
      </div>
    );
  }

  // Render children if all checks pass
  return <>{children}</>;
}
