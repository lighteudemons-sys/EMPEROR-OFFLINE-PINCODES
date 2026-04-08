'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { MobileMenu } from '@/components/mobile-menu';
import { MobileInventory } from '@/components/mobile-inventory';
import { MobileCustomers } from '@/components/mobile-customers';
import { MobileTables } from '@/components/mobile-tables';
import { MobileReports } from '@/components/mobile-reports';
import { MobileLoyalty } from '@/components/mobile-loyalty';
import { MobilePromoCodes } from '@/components/mobile-promo-codes';
import { MobileReceiptSettings } from '@/components/mobile-receipt-settings';
import { MobileDeliveryAreas } from '@/components/mobile-delivery-areas';
import { MobileCouriers } from '@/components/mobile-couriers';
import { MobileETASettings } from '@/components/mobile-eta-settings';
import { MobileSuppliers } from '@/components/mobile-suppliers';
import { MobilePurchaseOrders } from '@/components/mobile-purchase-orders';
import { MobileAuditLogs } from '@/components/mobile-audit-logs';
import { MobileUsers } from '@/components/mobile-users';
import { MobileBranches } from '@/components/mobile-branches';
import { MobileCosts } from '@/components/mobile-costs';
import {
  User,
  LogOut,
  Settings,
  Globe,
  Moon,
  Sun,
  ChevronRight,
  Utensils,
  LayoutGrid,
  Package,
  Truck,
  ShoppingBag,
  Users,
  Star,
  Tag,
  BarChart3,
  TrendingUp,
  TrendingDown,
  FileText,
  Shield,
  Building2,
  Receipt,
  MapPin,
  RefreshCw,
  Database,
  Download,
  Languages,
  LogOut as LogOutIcon,
  Coffee,
  UserCog,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { OfflineStatusIndicator } from '@/components/offline-status-indicator';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface Feature {
  id: string;
  name: string;
  icon: any;
  category: string;
  description?: string;
  badge?: string;
  canAccess?: boolean;
  action?: () => void;
}

export function MobileMore() {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const [storageInfo, setStorageInfo] = useState({ used: 0, total: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Mobile view sheets
  const [mobileViewOpen, setMobileViewOpen] = useState(false);
  const [currentMobileView, setCurrentMobileView] = useState<'menu' | 'inventory' | 'customers' | 'tables' | 'reports' | 'loyalty' | 'promo-codes' | 'receipt' | 'delivery-areas' | 'couriers' | 'eta-settings' | 'suppliers' | 'purchase-orders' | 'audit-logs' | 'users' | 'branches' | 'costs' | null>(null);

  // Role-based access control - same as desktop
  const canAccessHQFeatures = user?.role === 'ADMIN';
  const canAccessBranchFeatures = user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER';
  const canAccessInventory = user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER';
  const canAccessUsers = user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER';
  const canAccessAnalytics = user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER';
  const canAccessDelivery = user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER';
  const canAccessCustomers = user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER';
  const canAccessSuppliers = user?.role === 'ADMIN';
  const canAccessPurchaseOrders = user?.role === 'ADMIN';
  const canAccessTables = user?.role === 'ADMIN';
  const canAccessAuditLogs = user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER';
  const canAccessETA = user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER';
  const canAccessCosts = user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER';

  useEffect(() => {
    const fetchStorageInfo = async () => {
      try {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate();
          setStorageInfo({
            used: estimate.usage || 0,
            total: estimate.quota || 0,
          });
        }
      } catch (error) {
        console.error('Error getting storage info:', error);
      }
    };

    fetchStorageInfo();
  }, []);

  const formatStorage = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      showErrorToast('Error', 'Failed to logout');
    }
  };

  const handleSync = async () => {
    try {
      const { offlineManager } = await import('@/lib/offline/offline-manager');
      await offlineManager.checkActualConnectivity();
      const isOnline = offlineManager.isCurrentlyOnline();

      if (isOnline) {
        showSuccessToast('Sync', 'Syncing data...');
        const result = await offlineManager.forceSync();
        if (result.success) {
          showSuccessToast('Sync Complete', `Synced ${result.operationsProcessed} operations`);
        } else {
          showErrorToast('Sync Failed', result.errors.join(', '));
        }
      } else {
        showSuccessToast('Offline', 'You are currently offline');
      }
    } catch (error) {
      console.error('Sync error:', error);
      showErrorToast('Error', 'Failed to sync');
    }
  };

  // All features with role-based filtering
  const allCategories = [
    {
      name: 'Operations',
      features: [
        { id: 'menu', name: 'Menu Management', icon: Utensils, category: 'Operations', canAccess: canAccessHQFeatures },
        { id: 'tables', name: 'Tables', icon: LayoutGrid, category: 'Operations', canAccess: canAccessTables },
        { id: 'inventory', name: 'Inventory', icon: Package, category: 'Operations', badge: 'Low', canAccess: canAccessInventory },
        { id: 'suppliers', name: 'Suppliers', icon: ShoppingBag, category: 'Operations', canAccess: canAccessSuppliers },
        { id: 'purchase-orders', name: 'Purchase Orders', icon: ShoppingBag, category: 'Operations', canAccess: canAccessPurchaseOrders },
      ],
    },
    {
      name: 'Customers',
      features: [
        { id: 'customers', name: 'Customers', icon: Users, category: 'Customers', canAccess: canAccessCustomers },
        { id: 'loyalty', name: 'Loyalty Program', icon: Star, category: 'Customers', canAccess: canAccessCustomers },
        { id: 'promo-codes', name: 'Promo Codes', icon: Tag, category: 'Customers', canAccess: canAccessCustomers },
      ],
    },
    {
      name: 'Reports',
      features: [
        { id: 'reports', name: 'Reports', icon: BarChart3, category: 'Reports', canAccess: canAccessBranchFeatures },
        { id: 'costs', name: 'Costs', icon: TrendingDown, category: 'Reports', canAccess: canAccessCosts },
        { id: 'audit-logs', name: 'Audit Logs', icon: FileText, category: 'Reports', canAccess: canAccessAuditLogs },
      ],
    },
    {
      name: 'Settings',
      features: [
        { id: 'users', name: 'Users', icon: User, category: 'Settings', canAccess: canAccessUsers },
        { id: 'branches', name: 'Branches', icon: Building2, category: 'Settings', canAccess: canAccessHQFeatures },
        { id: 'receipt', name: 'Receipt Settings', icon: Receipt, category: 'Settings', canAccess: canAccessHQFeatures },
        { id: 'delivery-areas', name: 'Delivery Areas', icon: MapPin, category: 'Settings', canAccess: canAccessDelivery },
        { id: 'couriers', name: 'Couriers', icon: UserCog, category: 'Settings', canAccess: canAccessDelivery },
        { id: 'eta-settings', name: 'ETA Settings', icon: Shield, category: 'Settings', canAccess: canAccessETA },
      ],
    },
  ];

  // Filter categories and features based on user role
  const categories = allCategories.map(category => ({
    ...category,
    features: category.features.filter(feature => feature.canAccess)
  })).filter(category => category.features.length > 0);

  const systemFeatures = [
    { id: 'sync', name: 'Sync Data', icon: RefreshCw, action: handleSync, category: 'System' },
    { id: 'settings', name: 'App Settings', icon: Settings, action: () => setSettingsOpen(true), category: 'System' },
  ];

  const handleFeatureClick = (feature: Feature) => {
    // Open mobile view for supported features
    if (feature.id === 'menu') {
      setCurrentMobileView('menu');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'inventory') {
      setCurrentMobileView('inventory');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'customers') {
      setCurrentMobileView('customers');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'tables') {
      setCurrentMobileView('tables');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'reports') {
      setCurrentMobileView('reports');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'costs') {
      setCurrentMobileView('costs');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'loyalty') {
      setCurrentMobileView('loyalty');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'promo-codes') {
      setCurrentMobileView('promo-codes');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'receipt') {
      setCurrentMobileView('receipt');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'delivery-areas') {
      setCurrentMobileView('delivery-areas');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'couriers') {
      setCurrentMobileView('couriers');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'eta-settings') {
      setCurrentMobileView('eta-settings');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'suppliers') {
      setCurrentMobileView('suppliers');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'purchase-orders') {
      setCurrentMobileView('purchase-orders');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'audit-logs') {
      setCurrentMobileView('audit-logs');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'users') {
      setCurrentMobileView('users');
      setMobileViewOpen(true);
      return;
    }

    if (feature.id === 'branches') {
      setCurrentMobileView('branches');
      setMobileViewOpen(true);
      return;
    }

    // For other features, show message that they are available on desktop
    showSuccessToast('Desktop Feature', `${feature.name} is available on desktop view. Rotate your device or use a larger screen.`);

    // Optionally, still try to switch to desktop view
    // Note: This may not work well on actual mobile devices due to screen size
    const featureToTabMap: Record<string, string> = {};

    const targetTab = featureToTabMap[feature.id];

    if (targetTab) {
      // Dispatch event to switch to desktop view and navigate to the tab
      window.dispatchEvent(new Event('switch-to-desktop'));

      // Small delay to ensure desktop view is loaded before switching tab
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('mobile-feature-click', { detail: targetTab }));
      }, 300);
    }
  };

  const FeatureButton = ({ feature }: { feature: Feature }) => {
    const Icon = feature.icon;
    return (
      <button
        onClick={() => {
          if ('action' in feature && (feature as any).action) {
            (feature as any).action();
          } else {
            handleFeatureClick(feature);
          }
        }}
        className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95"
      >
        <div className="relative">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            feature.category === 'Operations' ? 'bg-emerald-100 text-emerald-600' :
            feature.category === 'Customers' ? 'bg-blue-100 text-blue-600' :
            feature.category === 'Reports' ? 'bg-purple-100 text-purple-600' :
            feature.category === 'Settings' ? 'bg-slate-100 text-slate-600' :
            'bg-orange-100 text-orange-600'
          }`}>
            <Icon className="w-6 h-6" />
          </div>
          {feature.badge && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-xs">
              {feature.badge}
            </Badge>
          )}
        </div>
        <span className="text-xs font-medium text-slate-700 text-center line-clamp-2">
          {feature.name}
        </span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <User className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{user?.name || user?.username}</h1>
            <p className="text-emerald-100 text-sm">
              {user?.role === 'ADMIN' ? 'HQ Admin' : 
               user?.role === 'BRANCH_MANAGER' ? 'Branch Manager' :
               user?.role === 'CASHIER' ? 'Cashier' :
               user?.role?.replace('_', ' ')}
            </p>
          </div>
          {user?.branchId && <OfflineStatusIndicator branchId={user.branchId} />}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-emerald-100 text-xs">Storage Used</p>
              <p className="text-lg font-bold">{formatStorage(storageInfo.used)}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-emerald-100 text-xs">Branch</p>
              <p className="text-lg font-bold truncate">{user?.branchName || 'HQ'}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="p-4 space-y-6">
          {/* Categories */}
          {categories.map((category) => (
            <div key={category.name}>
              <h3 className="font-semibold text-slate-900 mb-3 px-1">{category.name}</h3>
              <div className="grid grid-cols-3 gap-3">
                {category.features.map((feature) => (
                  <FeatureButton key={feature.id} feature={feature} />
                ))}
              </div>
            </div>
          ))}

          {/* System */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3 px-1">System</h3>
            <div className="grid grid-cols-3 gap-3">
              {systemFeatures.map((feature) => (
                <FeatureButton key={feature.id} feature={feature} />
              ))}
            </div>
          </div>

          {/* Logout Button */}
          <Button
            variant="outline"
            className="w-full h-14 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
            onClick={handleLogout}
          >
            <LogOutIcon className="w-5 h-5 mr-2" />
            Log Out
          </Button>

          {/* App Version */}
          <div className="text-center text-sm text-slate-500 pb-4">
            <p>Emperor POS Mobile v2.0</p>
            <p className="text-xs mt-1">© {new Date().getFullYear()} Emperor Coffee</p>
          </div>
        </div>
      </ScrollArea>

      {/* Settings Sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader className="px-6 pt-6">
            <SheetTitle>{t('settings.title')}</SheetTitle>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-120px)] px-6 py-4">
            <div className="space-y-6">
              {/* Language */}
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3">{t('settings.language')}</h4>
                <Card>
                  <CardContent className="p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={language === 'en' ? 'default' : 'outline'}
                        className="justify-start"
                        onClick={() => setLanguage('en')}
                      >
                        <Globe className="w-4 h-4 mr-2" />
                        English
                      </Button>
                      <Button
                        variant={language === 'ar' ? 'default' : 'outline'}
                        className="justify-start"
                        onClick={() => setLanguage('ar')}
                      >
                        <Languages className="w-4 h-4 mr-2" />
                        العربية
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Storage */}
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Storage</h4>
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">{t('inventory.mobile.stat.items')}</span>
                      <span className="font-medium">{formatStorage(storageInfo.used)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">{t('inventory.mobile.stat.total.value')}</span>
                      <span className="font-medium">{formatStorage(storageInfo.total - storageInfo.used)}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-emerald-600 h-2 rounded-full transition-all"
                        style={{ width: `${(storageInfo.used / storageInfo.total) * 100}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sync */}
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Data Sync</h4>
                <Card>
                  <CardContent className="p-4">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleSync}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {t('btn.sync')}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* About */}
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3">About</h4>
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">App Version</span>
                      <span className="font-medium">2.0.0</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Build</span>
                      <span className="font-medium">Production</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Platform</span>
                      <span className="font-medium">
                        {typeof window !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)
                          ? 'iOS'
                          : /Android/.test(navigator.userAgent)
                          ? 'Android'
                          : 'Web'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Mobile View Sheet */}
      <Sheet open={mobileViewOpen} onOpenChange={setMobileViewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0">
          {currentMobileView && (
            <SheetHeader className="px-6 pt-6 pb-4">
              <SheetTitle className="sr-only">
                {currentMobileView === 'menu' && 'Menu Management'}
                {currentMobileView === 'inventory' && 'Inventory'}
                {currentMobileView === 'customers' && 'Customers'}
                {currentMobileView === 'tables' && 'Tables'}
                {currentMobileView === 'reports' && 'Reports'}
                {currentMobileView === 'costs' && 'Costs'}
                {currentMobileView === 'loyalty' && 'Loyalty Program'}
                {currentMobileView === 'promo-codes' && 'Promo Codes'}
                {currentMobileView === 'receipt' && 'Receipt Settings'}
                {currentMobileView === 'delivery-areas' && 'Delivery Areas'}
                {currentMobileView === 'couriers' && 'Couriers'}
                {currentMobileView === 'eta-settings' && 'ETA Settings'}
                {currentMobileView === 'suppliers' && 'Suppliers'}
                {currentMobileView === 'purchase-orders' && 'Purchase Orders'}
                {currentMobileView === 'audit-logs' && 'Audit Logs'}
                {currentMobileView === 'users' && 'Users'}
                {currentMobileView === 'branches' && 'Branches'}
              </SheetTitle>
            </SheetHeader>
          )}
          <div className="h-full overflow-auto">
            {currentMobileView === 'menu' && <MobileMenu />}
            {currentMobileView === 'inventory' && <MobileInventory />}
            {currentMobileView === 'customers' && <MobileCustomers />}
            {currentMobileView === 'tables' && <MobileTables />}
            {currentMobileView === 'reports' && <MobileReports />}
            {currentMobileView === 'costs' && <MobileCosts />}
            {currentMobileView === 'loyalty' && <MobileLoyalty />}
            {currentMobileView === 'promo-codes' && <MobilePromoCodes />}
            {currentMobileView === 'receipt' && <MobileReceiptSettings />}
            {currentMobileView === 'delivery-areas' && <MobileDeliveryAreas />}
            {currentMobileView === 'couriers' && <MobileCouriers />}
            {currentMobileView === 'eta-settings' && <MobileETASettings />}
            {currentMobileView === 'suppliers' && <MobileSuppliers />}
            {currentMobileView === 'purchase-orders' && <MobilePurchaseOrders />}
            {currentMobileView === 'audit-logs' && <MobileAuditLogs />}
            {currentMobileView === 'users' && <MobileUsers />}
            {currentMobileView === 'branches' && <MobileBranches />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
