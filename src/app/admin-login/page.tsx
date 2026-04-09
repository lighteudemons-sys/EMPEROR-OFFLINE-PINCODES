'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Coffee, Lock, AlertCircle, Shield, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, isLoading, error, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      showErrorToast('Validation Error', 'Please enter both username and password');
      return;
    }

    await login(username, password);
  };

  // Redirect to dashboard after successful login
  useEffect(() => {
    if (user && user.role === 'ADMIN') {
      // Set device activation flag for admin users
      // This prevents redirect to license activation after logout
      localStorage.setItem('emperor_device_activated', 'true');
      localStorage.setItem('emperor_admin_access', 'true');

      showSuccessToast('Welcome', 'Admin login successful');
      router.push('/');
    }
  }, [user, router]);

  const handleBack = () => {
    router.push('/license-activation');
  };

  return (
    <div className="min-h-screen">
      {/* Dark, Professional Admin Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900"></div>
        <div className="absolute inset-0 opacity-10">
          {/* Shield pattern */}
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="shield-pattern" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M40 10 L60 20 L60 40 L40 70 L20 40 L20 20 Z" 
                      fill="none" 
                      stroke="#10b981" 
                      strokeWidth="1.5" 
                      opacity="0.5" 
                      transform="scale(0.6) translate(27, 13)"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#shield-pattern)"/>
          </svg>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white rounded-2xl mb-4 shadow-2xl relative">
              <Shield className="h-10 w-10" />
            </div>
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-white to-emerald-400 bg-clip-text text-transparent mb-1 drop-shadow-lg">
              Admin Access
            </h1>
            <p className="text-lg text-white/80 mt-2">
              Secure administrator login
            </p>
          </div>

          <Card className="border-emerald-500/30 shadow-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-600" />
                Administrator Login
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400 mt-1">
                Enter your admin credentials to access any device
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
              <form onSubmit={handleAdminLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="adminUsername" className="text-slate-900 dark:text-white font-medium">
                    Username
                  </Label>
                  <div className="relative">
                    <Coffee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                    <Input
                      id="adminUsername"
                      type="text"
                      placeholder="Enter admin username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-10 pr-4 py-3 border-slate-300 dark:border-slate-700 focus:border-emerald-600 focus:ring-emerald-600/50 h-12"
                      required
                      disabled={isLoading}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminPassword" className="text-slate-900 dark:text-white font-medium">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                    <Input
                      id="adminPassword"
                      type="password"
                      placeholder="Enter admin password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-4 py-3 border-slate-300 dark:border-slate-700 focus:border-emerald-600 focus:ring-emerald-600/50 h-12"
                      required
                      disabled={isLoading}
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-semibold shadow-lg hover:shadow-xl transition-all h-12"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Authenticating...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Admin Login
                    </span>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBack}
                  className="w-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to License Activation
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
                      Administrator Access Only
                    </p>
                    <p className="text-amber-700 dark:text-amber-400 mt-1">
                      This page allows administrators to bypass license activation on any device. Only users with ADMIN role can access this page.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
