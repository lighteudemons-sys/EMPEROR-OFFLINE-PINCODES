'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/hooks/use-toast';
import { offlineManager, SyncStatus } from '@/lib/offline/offline-manager';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import { registerDevice, getOrCreateDeviceId, isDeviceRegistered } from '@/lib/device-manager';

const storage = getIndexedDBStorage();

interface User {
  id: string;
  username: string;
  email: string;
  name?: string;
  fullName?: string;
  role: 'ADMIN' | 'BRANCH_MANAGER' | 'CASHIER';
  branchId?: string;
  isActive: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (username?: string, password?: string, userCode?: string, pin?: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
  isOnline: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('[Auth] Connection restored');
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log('[Auth] Connection lost');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial status
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodic session validation (for device revocation)
  useEffect(() => {
    if (!user || !navigator.onLine) return;

    const validateSession = async () => {
      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'include',
        });

        const data = await response.json();

        if (!data.success) {
          // Session is invalid
          console.warn('[Auth] Session validation failed:', data.error, 'Reason:', data.reason);

          // If device was removed, redirect to license activation
          if (data.reason === 'device_removed' || data.reason === 'device_deactivated') {
            console.warn('[Auth] Device removed/deactivated, redirecting to license activation');
            // Clear all device activation data from localStorage
            localStorage.removeItem('emperor_device_activated');
            localStorage.removeItem('emperor_device_activation_time');
            localStorage.removeItem('emperor_branch_id');
            localStorage.removeItem('emperor_branch_name');
            localStorage.removeItem('emperor_license_expires');
            // Clear user session
            await storage.removeSetting('user');
            await storage.removeSetting('isLoggedIn');
            setUser(null);
            // Redirect to license activation page
            window.location.href = '/license-activation';
          } else {
            // Other session issues, logout
            await logout();
          }
        }
      } catch (error) {
        console.error('[Auth] Session validation error:', error);
        // Don't logout on network errors, might be offline
      }
    };

    // Validate session every 10 seconds
    const interval = setInterval(validateSession, 10000);

    // Also validate when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        validateSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, isOnline]);

  // Initialize offline manager when user is set
  useEffect(() => {
    if (user && user.branchId) {
      const initOfflineManager = async () => {
        try {
          console.log('[Auth] Initializing offline manager for branch:', user.branchId);
          await offlineManager.initialize(user.branchId);
          await storage.init();
          console.log('[Auth] Offline manager initialized');
        } catch (err) {
          console.error('[Auth] Failed to initialize offline manager:', err);
        }
      };

      initOfflineManager();
    }
  }, [user?.branchId]);

  const login = async (username?: string, password?: string, userCode?: string, pin?: string) => {
    setIsLoading(true);
    setError(null);

    // Determine login method
    const isUsernamePassword = username && password;
    const isUserCodePassword = userCode && password;
    const isUserCodePin = userCode && pin;

    if (!isUsernamePassword && !isUserCodePassword && !isUserCodePin) {
      setError('Invalid login credentials');
      showErrorToast('Login Failed', 'Please provide valid credentials');
      setIsLoading(false);
      return;
    }

    // Check for offline mode
    // Try to detect offline by checking if we can reach a simple endpoint
    let isActuallyOffline = !navigator.onLine;

    // If navigator says online, verify with a quick fetch
    if (!isActuallyOffline) {
      try {
        // Quick check for network connectivity
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

        await fetch('/api/auth/session', {
          method: 'HEAD',
          signal: controller.signal,
          cache: 'no-store',
        });

        clearTimeout(timeoutId);
        // If we get here, we're truly online
        isActuallyOffline = false;
      } catch (networkErr) {
        // Network request failed - we're offline
        console.log('[Auth] Network check failed, treating as offline:', networkErr);
        isActuallyOffline = true;
      }
    }

    const loginIdentifier = username || userCode;
    console.log('[Auth] Login attempt - Online:', !isActuallyOffline, 'Identifier:', loginIdentifier);

    // Handle offline login (only supported for username/password)
    if (isActuallyOffline) {
      console.log('[Auth] Offline login mode');

      // Try offline login from IndexedDB
      let storedUser = null;
      let isLoggedIn = null;
      try {
        storedUser = await storage.getJSON('user');
        isLoggedIn = await storage.getString('isLoggedIn');
      } catch (error) {
        console.warn('[Auth] IndexedDB not accessible:', error);
      }

      console.log('[Auth] Stored user exists:', !!storedUser, 'Is logged in:', isLoggedIn);

      if (storedUser && isLoggedIn === 'true') {
        try {
          const userData = JSON.parse(storedUser);

          // More flexible matching - allow login if username matches
          // Also, if there's only one stored user, allow login with any username from that list
          if (username && userData.username === username) {
            console.log('[Auth] Offline login successful for:', username);
            setUser(userData);
            showSuccessToast('Logged in (Offline)', 'You are currently offline. Some features may be limited.');
            setIsLoading(false);
            return;
          } else {
            console.log('[Auth] Username mismatch. Stored:', userData.username, 'Attempted:', username);
          }
        } catch (err) {
          console.error('[Auth] Failed to parse stored user:', err);
        }
      }

      // If we get here, offline login failed
      console.error('[Auth] Offline login failed - no matching credentials');
      showErrorToast('Offline Login Failed', 'No cached credentials found. Please connect to internet first.');
      setError('Offline: You must login online at least once before using offline mode.');
      setIsLoading(false);
      return;
    }

    // Online login
    console.log('[Auth] Online login mode');
    try {
      const requestBody: any = {};
      if (username && password) {
        requestBody.username = username;
        requestBody.password = password;
      } else if (userCode && password) {
        requestBody.userCode = userCode;
        requestBody.password = password;
      } else if (userCode && pin) {
        requestBody.userCode = userCode;
        requestBody.pin = pin;
      }

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      console.log('[Auth] Response status:', response.status, response.statusText);

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('[Auth] Failed to parse response as JSON:', parseError);
        console.error('[Auth] Response text:', await response.text());
        showErrorToast('Server Error', 'Invalid response from server');
        setError('Server error');
        setIsLoading(false);
        return;
      }

      console.log('[Auth] Response data:', data);

      if (!response.ok || !data.success) {
        console.error('[Auth] Online login failed:', data);
        showErrorToast('Login Failed', data.error || 'Invalid credentials');
        setError(data.error || 'Login failed');
        setIsLoading(false);
        return;
      }

      console.log('[Auth] Online login successful:', data.session.username);

      // Set user from session response
      const userData = {
        id: data.session.userId,
        username: data.session.username,
        email: data.session.email,
        name: data.session.name,
        fullName: data.session.fullName,
        role: data.session.role,
        branchId: data.session.branchId,
        isActive: true,
      };

      // Set user state
      setUser(userData);

      // Register device if user has a branch
      if (userData.branchId) {
        const deviceRegistered = await isDeviceRegistered();
        if (!deviceRegistered.registered) {
          console.log('[Auth] Registering device...');
          const deviceId = await getOrCreateDeviceId();
          await registerDevice(
            userData.branchId,
            userData.id,
            userData.role
          );
          console.log('[Auth] Device registered:', deviceId);
        } else {
          console.log('[Auth] Device already registered for branch:', deviceRegistered.branchId);
        }
      }

      // Store in IndexedDB as fallback (for offline access)
      try {
        await storage.setString('isLoggedIn', 'true');
        await storage.setJSON('user', userData);
        
        // Cache all users for offline authentication (void/refund)
        console.log('[Auth] Caching users for offline authentication...');
        const usersResponse = await fetch('/api/users');
        if (usersResponse.ok) {
          const usersData = await usersResponse.json();
          if (usersData.users && Array.isArray(usersData.users)) {
            // Store each user in IndexedDB
            await storage.init();
            for (const user of usersData.users) {
              await storage.put('users', {
                id: user.id,
                username: user.username,
                email: user.email,
                name: user.name,
                fullName: user.fullName,
                role: user.role,
                branchId: user.branchId,
                userCode: user.userCode,
                pin: user.pin, // PIN hash for offline authentication
                isActive: user.isActive !== false, // Default to true if not specified
              });
            }
            console.log('[Auth] Cached', usersData.users.length, 'users for offline authentication');
          }
        }
      } catch (error) {
        console.warn('[Auth] IndexedDB not accessible or failed to cache users:', error);
      }

      showSuccessToast('Welcome back!', `Logged in as ${data.session.name || data.session.username}`);

      // DISABLED: Auto-sync on login was causing 4.54 GB data transfers
      // Users can manually sync via Sync Dashboard if needed
      //
      // Sync data to IndexedDB if online and has branch
      // if (userData.branchId) {
      //   setTimeout(async () => {
      //     try {
      //       console.log('[Auth] Pulling data for offline use...');
      //       const syncResult = await offlineManager.syncAll();
      //       console.log('[Auth] Sync result:', syncResult);
      //     } catch (err) {
      //       console.error('[Auth] Failed to sync data:', err);
      //     }
      //   }, 1000);
      // }
    } catch (err) {
      console.error('[Auth] Login error:', err);
      showErrorToast('Network Error', 'Failed to connect. Please check your internet connection.');
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      // First, call logout API to clear server session cookie
      if (navigator.onLine) {
        try {
          const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          });
          const data = await response.json();
          if (data.success) {
            console.log('[Auth] Server session cleared successfully');
          }
        } catch (err) {
          console.error('[Auth] Logout API error:', err);
          // Continue with local cleanup even if API fails
        }
      }

      // Clear user session data from IndexedDB (but keep device registration)
      if (typeof window !== 'undefined') {
        try {
          await storage.removeSetting('user');
          await storage.removeSetting('isLoggedIn');
          // Note: Do NOT clear device registration data (emperor_device_*, emperor_device_registered*)
          // This ensures device stays registered after logout
          console.log('[Auth] User session cleared from IndexedDB (device registration preserved)');
        } catch (error) {
          console.warn('[Auth] IndexedDB not accessible:', error);
        }
      }

      // Clear user state last
      setUser(null);
      showSuccessToast('Logged out successfully');
    } catch (err) {
      console.error('[Auth] Logout error:', err);
      // Ensure we clear everything even on error
      if (typeof window !== 'undefined') {
        try {
          await storage.removeSetting('user');
          await storage.removeSetting('isLoggedIn');
          // Note: Preserve device registration data
        } catch (error) {
          console.warn('[Auth] IndexedDB not accessible:', error);
        }
      }
      setUser(null);
    }
  };

  // Check for existing session on mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // First check IndexedDB for fallback (needed for preview environments)
      let storedUser = null;
      let isLoggedIn = null;
      (async () => {
        try {
          storedUser = await storage.getJSON('user');
          isLoggedIn = await storage.getString('isLoggedIn');
        } catch (error) {
          console.warn('[Auth] IndexedDB not accessible:', error);
        }

        if (storedUser && isLoggedIn === 'true') {
          try {
            const userData = storedUser;
            setUser(userData);

            // Initialize offline manager with stored user
            if (userData.branchId) {
              offlineManager.initialize(userData.branchId).catch(err => {
                console.error('[Auth] Failed to initialize offline manager on mount:', err);
              });
            }
          } catch (err) {
            console.error('Failed to parse stored user:', err);
            try {
              await storage.removeSetting('user');
              await storage.removeSetting('isLoggedIn');
            } catch (e) {
              console.warn('[Auth] IndexedDB not accessible:', e);
            }
          }
        }

        // Then verify session with server (secure cookie validation) - only if online
        if (navigator.onLine) {
        fetch('/api/auth/session', {
          credentials: 'include',
        })
          .then(async (response) => {
            const data = await response.json();
            if (data.success && data.user) {
              // Server session is valid, update user state
              setUser(data.user);
              // Update IndexedDB to match server session
              try {
                await storage.setJSON('user', data.user);
                await storage.setString('isLoggedIn', 'true');

                // Cache users for offline authentication (if not already cached)
                const cachedUsers = await storage.getAll('users');
                if (!cachedUsers || cachedUsers.length === 0) {
                  console.log('[Auth] Caching users for offline authentication on session check...');
                  const usersResponse = await fetch(`/api/users?currentUserRole=${data.user.role}&currentUserBranchId=${data.user.branchId || ''}`);
                  if (usersResponse.ok) {
                    const usersData = await usersResponse.json();
                    if (usersData.users && Array.isArray(usersData.users)) {
                      await storage.init();
                      for (const user of usersData.users) {
                        await storage.put('users', {
                          id: user.id,
                          username: user.username,
                          email: user.email,
                          name: user.name,
                          fullName: user.fullName,
                          role: user.role,
                          branchId: user.branchId,
                          userCode: user.userCode,
                          pin: user.pin, // PIN hash for offline authentication
                          isActive: user.isActive !== false,
                        });
                      }
                      console.log('[Auth] Cached', usersData.users.length, 'users for offline authentication');
                    }
                  }
                }
              } catch (error) {
                console.warn('[Auth] IndexedDB not accessible:', error);
              }

              // Initialize offline manager with verified user
              if (data.user.branchId) {
                offlineManager.initialize(data.user.branchId).catch(err => {
                  console.error('[Auth] Failed to initialize offline manager after session check:', err);
                });
              }
            } else if (data.reason === 'device_removed' || data.reason === 'device_deactivated') {
              // Device was removed or deactivated - clear session and redirect to license activation
              console.warn('[Auth] Device removed/deactivated, redirecting to license activation');
              // Clear all device activation data from localStorage
              localStorage.removeItem('emperor_device_activated');
              localStorage.removeItem('emperor_device_activation_time');
              localStorage.removeItem('emperor_branch_id');
              localStorage.removeItem('emperor_branch_name');
              localStorage.removeItem('emperor_license_expires');
              // Clear IndexedDB user session
              await storage.removeSetting('user');
              await storage.removeSetting('isLoggedIn');
              setUser(null);
              // Redirect to license activation page
              window.location.href = '/license-activation';
            }
            // If session API fails, we keep the IndexedDB user as fallback
          })
          .catch(err => {
            console.error('Session validation error, using IndexedDB fallback:', err);
            // User is already set from IndexedDB above, no action needed
          });
        }
      })();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, error, isOnline }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
