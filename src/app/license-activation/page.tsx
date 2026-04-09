'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Coffee, Lock, AlertCircle, Mail, Shield, CheckCircle, Loader2, Key } from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

export default function LicenseActivationPage() {
  const router = useRouter();
  const [licenseKey, setLicenseKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [secretClickCount, setSecretClickCount] = useState(0);

  // Check if device is already activated
  useEffect(() => {
    const isActivated = localStorage.getItem('emperor_device_activated');
    const activationTime = localStorage.getItem('emperor_device_activation_time');
    
    if (isActivated === 'true' && activationTime) {
      // Device is already activated, redirect to login
      console.log('[LicenseActivation] Device already activated, redirecting to login');
      router.push('/login');
    }
  }, [router]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/license/activate-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to activate license');
      }

      // Store activation status in localStorage
      localStorage.setItem('emperor_device_activated', 'true');
      localStorage.setItem('emperor_device_activation_time', new Date().toISOString());
      localStorage.setItem('emperor_branch_id', data.branchId);
      localStorage.setItem('emperor_branch_name', data.branchName);
      localStorage.setItem('emperor_license_expires', data.expirationDate);

      showSuccessToast('License Activated', `Welcome to ${data.branchName}!`);
      
      // Redirect to login
      router.push('/login');
    } catch (err: any) {
      console.error('[LicenseActivation] Activation error:', err);
      setError(err.message || 'Failed to activate license');
      showErrorToast('Activation Failed', err.message || 'Invalid license key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSecretClick = () => {
    setSecretClickCount(prev => {
      const newCount = prev + 1;
      
      // After 5 clicks, redirect to admin login
      if (newCount >= 5) {
        setShowContactDialog(false);
        router.push('/admin-login');
        return 0;
      }
      
      return newCount;
    });
  };

  return (
    <div className="min-h-screen">
      {/* Beautiful Coffee-Themed Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F3A2E] via-[#0B2B22] to-[#C7A35A]"></div>
        <div className="absolute inset-0 opacity-20">
          {/* Coffee bean patterns */}
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="coffee-bean-pattern" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
                <ellipse cx="40" cy="40" rx="20" ry="15" fill="none" stroke="#C7A35A" strokeWidth="1.5" opacity="0.58" transform="rotate(30 40 40)"/>
                <ellipse cx="40" cy="40" rx="18" ry="13" fill="none" stroke="#C7A35A" strokeWidth="1.5" opacity="0.56" transform="rotate(-20 40 40)"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#coffee-bean-pattern)"/>
          </svg>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#C7A35A] to-[#b88e3b] text-white rounded-2xl mb-4 shadow-2xl relative">
              <div className="absolute -top-2 -right-2">
                <Key className="h-6 w-6 text-white opacity-30" />
              </div>
              <Coffee className="h-10 w-10" />
            </div>
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-[#0F3A2E] to-[#C7A35A] bg-clip-text text-transparent mb-1 drop-shadow-lg">
              Emperor Coffee
            </h1>
            <p className="text-2xl font-extrabold bg-gradient-to-r from-[#C7A35A] to-[#0F3A2E] bg-clip-text text-transparent drop-shadow-lg">
              License Activation
            </p>
            <p className="text-sm text-white/80 mt-2">
              First-time setup for this device
            </p>
          </div>

          <Card className="border-[#C7A35A]/30 shadow-2xl bg-[#FFFDF8]/95 dark:bg-[#0F3A2E]/95 backdrop-blur-sm">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl font-bold text-[#0F3A2E] dark:text-[#FFFDF8] flex items-center gap-2">
                <Key className="h-5 w-5 text-[#C7A35A]" />
                Activate Your License
              </CardTitle>
              <CardDescription className="text-[#0F3A2E]/70 dark:text-[#FFFDF8]/70 mt-1">
                Enter your license key to activate this device
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
              <form onSubmit={handleActivate} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="licenseKey" className="text-[#0F3A2E] dark:text-[#FFFDF8] font-medium text-lg">
                    License Key
                  </Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[#C7A35A]" />
                    <Input
                      id="licenseKey"
                      type="text"
                      placeholder="Enter your license key"
                      value={licenseKey}
                      onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                      className="pl-12 pr-4 py-4 border-[#C7A35A]/30 focus:border-[#C7A35A] focus:ring-[#C7A35A]/50 h-14 text-lg font-mono uppercase tracking-wide"
                      required
                      disabled={isLoading}
                      autoComplete="off"
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    License keys are case-insensitive and unique to your branch
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-[#C7A35A] to-[#b88e3b] hover:from-[#b88e3b] hover:to-[#C7A35A] text-white font-semibold shadow-lg hover:shadow-xl transition-all h-14 text-lg"
                  disabled={isLoading || !licenseKey.trim()}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Activating...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Activate License
                    </span>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-300 dark:border-slate-700"></span>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-[#FFFDF8] dark:bg-[#0F3A2E] text-slate-500 dark:text-slate-400">
                      Need help?
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowContactDialog(true)}
                  className="w-full border-[#C7A35A]/50 text-[#0F3A2E] dark:text-[#FFFDF8] hover:bg-[#C7A35A]/10 h-12"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Contact Admin for License
                </Button>
              </form>

              {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mt-4">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                  <span className="text-sm text-red-600 dark:text-red-400">
                    {error}
                  </span>
                </div>
              )}

              <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      Important Information
                    </p>
                    <ul className="text-amber-700 dark:text-amber-400 mt-2 space-y-1 list-disc list-inside">
                      <li>Each license key is linked to a specific branch</li>
                      <li>After activation, you can login directly without re-entering the key</li>
                      <li>Contact your administrator if you don't have a license key</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Contact Admin Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Mail className="h-5 w-5 text-[#C7A35A]" />
              Contact Administrator
            </DialogTitle>
            <DialogDescription>
              Get your license key from the administrator
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-gradient-to-br from-[#C7A35A] to-[#b88e3b] rounded-full flex items-center justify-center text-white">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Email Address</p>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    marcomamdouh88@gmail.com
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                    What to include in your email:
                  </p>
                  <ul className="text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                    <li>Your branch name</li>
                    <li>Your name and role</li>
                    <li>Device information (mobile/PC)</li>
                    <li>Reason for license request</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowContactDialog(false)}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
            <Button
              onClick={() => window.location.href = 'mailto:marcomamdouh88@gmail.com?subject=License Key Request - Emperor Coffee POS&body=Hello,%0D%0A%0D%0AI would like to request a license key for Emperor Coffee POS.%0D%0A%0D%0ABranch Name: [Your Branch Name]%0D%0AYour Name: [Your Name]%0D%0ARole: [Your Role]%0D%0ADevice: [Mobile/PC]%0D%0AReason: [Why you need access]%0D%0A%0D%0AThank you!'}
              className="w-full sm:w-auto bg-gradient-to-r from-[#C7A35A] to-[#b88e3b] hover:from-[#b88e3b] hover:to-[#C7A35A] text-white"
            >
              <Mail className="h-4 w-4 mr-2" />
              Send Email
            </Button>
          </DialogFooter>

          {/* Secret admin access - hidden word */}
          <div 
            className="mt-4 text-center cursor-default select-none"
            onClick={handleSecretClick}
          >
            <p className="text-xs text-slate-400 dark:text-slate-600">
              Emperor Coffee POS © 2024
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
