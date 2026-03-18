'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Coffee, Lock, AlertCircle, Bean, Wifi, WifiOff, User, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { NumericKeypad } from '@/components/numeric-keypad';

export default function LoginPage() {
  const router = useRouter();
  const [isOffline, setIsOffline] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const { login, isLoading, error, user } = useAuth();

  // Standard login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Quick login state
  const [userCode, setUserCode] = useState('');
  const [pin, setPin] = useState('');
  const [foundUser, setFoundUser] = useState<any>(null);
  const [activeField, setActiveField] = useState<'userCode' | 'pin'>('userCode');

  // Refs for inputs
  const userCodeRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  // Redirect if user is logged in
  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  // Check actual network connectivity
  const checkConnection = async () => {
    setIsCheckingConnection(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      await fetch('/api/auth/session', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);
      setIsOffline(false);
    } catch (err) {
      console.log('[LoginPage] Connection check failed - offline mode');
      setIsOffline(true);
    } finally {
      setIsCheckingConnection(false);
    }
  };

  // Check connection on mount and when online/offline events fire
  useEffect(() => {
    const handleOnline = () => {
      console.log('[LoginPage] Browser says online, verifying...');
      checkConnection();
    };
    const handleOffline = () => {
      console.log('[LoginPage] Browser says offline');
      setIsOffline(true);
    };

    // Initial check
    checkConnection();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check every 10 seconds
    const interval = setInterval(checkConnection, 10000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-focus on user code when switching to quick login
  useEffect(() => {
    if (userCodeRef.current) {
      userCodeRef.current.focus();
    }
  }, []);

  // Look up user when 4-digit code is entered
  useEffect(() => {
    if (userCode.length === 4) {
      lookupUser(userCode);
      // Automatically switch to PIN field when user code is complete
      setActiveField('pin');
    } else {
      setFoundUser(null);
    }
  }, [userCode]);

  const lookupUser = async (code: string) => {
    try {
      const response = await fetch(`/api/users/by-code/${code}`);
      if (response.ok) {
        const data = await response.json();
        setFoundUser(data.user);
      } else {
        setFoundUser(null);
      }
    } catch (err) {
      console.error('Failed to lookup user:', err);
      setFoundUser(null);
    }
  };

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  const handleQuickLogin = async () => {
    if (userCode.length !== 4 || pin.length < 4 || pin.length > 6) {
      return;
    }
    await login(undefined, undefined, userCode, pin);
  };

  const handleUserCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow manual typing but still filter to digits only
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setUserCode(value);
    setActiveField('userCode');
  };

  const handleDigitPress = (digit: string) => {
    if (activeField === 'userCode') {
      if (userCode.length < 4) {
        setUserCode(userCode + digit);
      }
    } else {
      if (pin.length < 6) {
        setPin(pin + digit);
      }
    }
  };

  const handleBackspace = () => {
    if (activeField === 'userCode') {
      setUserCode(userCode.slice(0, -1));
    } else {
      setPin(pin.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (activeField === 'userCode') {
      setUserCode('');
    } else {
      setPin('');
    }
  };

  const handleKeyPress = (key: string) => {
    if (key === 'Enter') {
      if (username && password) {
        handleStandardLogin(new Event('submit') as any);
      } else if (userCode.length === 4 && pin.length >= 4) {
        handleQuickLogin();
      }
    }
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
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#C7A35A] to-[#b88e3b] text-white rounded-2xl mb-4 shadow-2xl relative">
              <div className="absolute -top-2 -right-2">
                <Bean className="h-6 w-6 text-white opacity-30" />
              </div>
              <Coffee className="h-8 w-8" />
            </div>
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-[#0F3A2E] to-[#C7A35A] bg-clip-text text-transparent mb-1 drop-shadow-lg">
              Emperor Coffee
            </h1>
            <p className="text-2xl font-extrabold bg-gradient-to-r from-[#C7A35A] to-[#0F3A2E] bg-clip-text text-transparent drop-shadow-lg">
            Point of Sale
            </p>
          </div>

          <Card className="border-[#C7A35A]/30 shadow-2xl bg-[#FFFDF8]/95 dark:bg-[#0F3A2E]/95 backdrop-blur-sm">
            <CardHeader className="space-y-1 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold text-[#0F3A2E] dark:text-[#FFFDF8]">Welcome Back</CardTitle>
                  <CardDescription className="text-[#0F3A2E]/70 dark:text-[#FFFDF8]/70 mt-1">
                    Sign in to access the POS system
                  </CardDescription>
                </div>
                {/* Connection Status Indicator */}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                  isCheckingConnection
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    : isOffline
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                }`}>
                  {isCheckingConnection ? (
                    <>
                      <div className="h-4 w-4 border-2 border-current border-t-transparent animate-spin rounded-full" />
                      <span className="hidden sm:inline">Checking...</span>
                    </>
                  ) : isOffline ? (
                    <>
                      <WifiOff className="h-4 w-4" />
                      <span className="hidden sm:inline">Offline</span>
                    </>
                  ) : (
                    <>
                      <Wifi className="h-4 w-4" />
                      <span className="hidden sm:inline">Online</span>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              {/* Offline Info Banner */}
              {isOffline && (
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-800 dark:text-amber-300">
                        You are currently offline
                      </p>
                      <p className="text-amber-700 dark:text-amber-400 mt-1">
                        You can login if you have previously logged in on this device.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Tabs defaultValue="quick" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="quick" className="text-base">
                    Quick Login
                  </TabsTrigger>
                  <TabsTrigger value="standard" className="text-base">
                    Standard Login
                  </TabsTrigger>
                </TabsList>

                {/* Quick Login Tab */}
                <TabsContent value="quick" className="space-y-6">
                  {/* User Code Input */}
                  <div className="space-y-2">
                    <Label htmlFor="userCode" className="text-[#0F3A2E] dark:text-[#FFFDF8] font-medium text-lg">
                      User Code
                    </Label>
                    <div className="relative">
                      <Coffee className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors ${activeField === 'userCode' ? 'text-[#C7A35A]' : 'text-slate-400'}`} />
                      <Input
                        ref={userCodeRef}
                        id="userCode"
                        type="text"
                        inputMode="numeric"
                        placeholder="####"
                        value={userCode}
                        onChange={handleUserCodeChange}
                        onFocus={() => setActiveField('userCode')}
                        onClick={() => setActiveField('userCode')}
                        className={`pl-12 pr-4 py-4 text-2xl text-center tracking-widest h-16 text-[#0F3A2E] font-mono transition-all ${
                          activeField === 'userCode'
                            ? 'border-[#C7A35A] focus:border-[#C7A35A] focus:ring-[#C7A35A]/50 ring-2 ring-[#C7A35A]/20'
                            : 'border-[#C7A35A]/30 focus:border-[#C7A35A]/30 focus:ring-0'
                        }`}
                        maxLength={4}
                        disabled={isLoading}
                      />
                    </div>
                    {/* User Info Display */}
                    {foundUser && (
                      <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg animate-in slide-in-from-top-2">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#C7A35A] to-[#b88e3b] flex items-center justify-center text-white">
                          <User className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-green-800 dark:text-green-300">
                            {foundUser.name || foundUser.username}
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-400">
                            {foundUser.role}
                          </p>
                        </div>
                        <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                    )}
                  </div>

                  {/* PIN Display */}
                  <div className="space-y-2">
                    <Label htmlFor="pin" className="text-[#0F3A2E] dark:text-[#FFFDF8] font-medium text-lg">
                      PIN
                    </Label>
                    <div className="relative">
                      <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors ${activeField === 'pin' ? 'text-[#C7A35A]' : 'text-slate-400'}`} />
                      <Input
                        id="pin"
                        type="password"
                        value={"•".repeat(pin.length)}
                        readOnly
                        placeholder="••••"
                        onClick={() => setActiveField('pin')}
                        className={`pl-12 pr-4 py-4 text-2xl text-center tracking-widest h-16 bg-white cursor-pointer transition-all ${
                          activeField === 'pin'
                            ? 'border-[#C7A35A] focus:border-[#C7A35A] focus:ring-[#C7A35A]/50 ring-2 ring-[#C7A35A]/20'
                            : 'border-[#C7A35A]/30'
                        }`}
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  {/* Numeric Keypad */}
                  <NumericKeypad
                    onDigitPress={handleDigitPress}
                    onBackspace={handleBackspace}
                    onClear={handleClear}
                    disabled={isLoading || (activeField === 'pin' && userCode.length !== 4)}
                  />

                  {/* Quick Login Button */}
                  <Button
                    type="button"
                    onClick={handleQuickLogin}
                    className="w-full bg-gradient-to-r from-[#C7A35A] to-[#b88e3b] hover:from-[#b88e3b] hover:to-[#C7A35A] text-white font-semibold shadow-lg hover:shadow-xl transition-all h-14 text-lg"
                    disabled={isLoading || userCode.length !== 4 || pin.length < 4}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <div className="h-5 w-5 border-2 border-white/30 border-t-transparent animate-spin rounded-full"></div>
                        Signing in...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Sign In
                        <Coffee className="h-5 w-5" />
                      </span>
                    )}
                  </Button>
                </TabsContent>

                {/* Standard Login Tab */}
                <TabsContent value="standard" className="space-y-6">
                  <form onSubmit={handleStandardLogin} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-[#0F3A2E] dark:text-[#FFFDF8] font-medium">Username</Label>
                      <div className="relative">
                        <Coffee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#C7A35A]" />
                        <Input
                          ref={usernameRef}
                          id="username"
                          type="text"
                          placeholder="e.g., admin, manager1, cashier1"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="pl-10 border-[#C7A35A]/30 focus:border-[#C7A35A] focus:ring-[#C7A35A]/50 h-12"
                          required
                          disabled={isLoading}
                          onKeyPress={(e) => handleKeyPress(e.key)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-[#0F3A2E] dark:text-[#FFFDF8] font-medium">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#C7A35A]" />
                        <Input
                          id="password"
                          type="password"
                          placeholder="•••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10 border-[#C7A35A]/30 focus:border-[#C7A35A] focus:ring-[#C7A35A]/50 h-12"
                          required
                          disabled={isLoading}
                          onKeyPress={(e) => handleKeyPress(e.key)}
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-[#C7A35A] to-[#b88e3b] hover:from-[#b88e3b] hover:to-[#C7A35A] text-white font-semibold shadow-lg hover:shadow-xl transition-all h-14 text-lg"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <div className="h-5 w-5 border-2 border-white/30 border-t-transparent animate-spin rounded-full"></div>
                          Signing in...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          Sign In
                          <Coffee className="h-5 w-5" />
                        </span>
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mt-4">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                  <span className="text-sm text-red-600 dark:text-red-400">
                    {error}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
