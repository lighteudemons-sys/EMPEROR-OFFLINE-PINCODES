'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShoppingCart,
  DollarSign,
  Clock,
  AlertTriangle,
  TrendingUp,
  Coffee,
  Calendar,
  CheckCircle,
  X,
  RefreshCw,
  Bell,
  User,
  Store,
  ChevronRight,
  Plus,
  LogOut,
  Menu as MenuIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { OfflineStatusIndicator } from '@/components/offline-status-indicator';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';

interface DashboardStats {
  todayRevenue: number;
  orderCount: number;
  shiftCount: number;
  hoursOpen: number;
  revenueChange: number;
}

interface CurrentShift {
  id: string;
  status: 'open' | 'closed';
  startedAt: string;
  currentRevenue: number;
  orderCount: number;
  cashierName: string;
  branchName: string;
}

interface LowStockItem {
  id: string;
  name: string;
  currentStock: number;
  minimumStock: number;
  unit: string;
}

interface RecentActivity {
  id: string;
  type: 'order' | 'expense' | 'table' | 'shift';
  description: string;
  timestamp: string;
  amount?: number;
}

export function MobileDashboard() {
  const { user, logout } = useAuth();
  const { currency, t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    todayRevenue: 0,
    orderCount: 0,
    shiftCount: 0,
    hoursOpen: 0,
    revenueChange: 0,
  });
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const fetchDashboardData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);

      // Get today's date range
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));

      // Fetch today's orders from API first
      let todayOrders: any[] = [];
      try {
        const response = await fetch('/api/orders');
        if (response.ok) {
          const data = await response.json();
          const allOrders = data.orders || [];
          todayOrders = allOrders.filter((order: any) => {
            const orderDate = new Date(order.createdAt || order.orderTimestamp);
            return orderDate >= startOfDay && orderDate <= endOfDay;
          });
        }
      } catch (error) {
        console.log('Failed to fetch orders from API, using IndexedDB');
      }

      // Fallback to IndexedDB if API failed or returned no data
      if (todayOrders.length === 0) {
        const storage = getIndexedDBStorage();
        await storage.init();
        const allOrders = await storage.getAllOrders();
        todayOrders = allOrders.filter((order: any) => {
          const orderDate = new Date(order.createdAt || order.orderTimestamp);
          return orderDate >= startOfDay && orderDate <= endOfDay;
        });
      }

      const todayRevenue = todayOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0);
      const orderCount = todayOrders.length;

      // Get current shift
      let openShift: any = null;
      try {
        const params = new URLSearchParams({
          branchId: user?.branchId || '',
          cashierId: user?.id || '',
          status: 'open',
        });
        const response = await fetch(`/api/shifts?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          if (data.shifts && data.shifts.length > 0) {
            openShift = data.shifts[0];
          }
        }
      } catch (error) {
        console.log('Failed to fetch shift from API, checking IndexedDB');
      }

      // Fallback to IndexedDB for shift
      if (!openShift) {
        const storage = getIndexedDBStorage();
        await storage.init();
        const allShifts = await storage.getAllShifts();
        openShift = allShifts.find((s: any) =>
          s.cashierId === user?.id &&
          s.branchId === user?.branchId &&
          !s.isClosed
        );
      }

      if (openShift) {
        setCurrentShift({
          id: openShift.id,
          status: 'open',
          startedAt: openShift.startedAt,
          currentRevenue: openShift.currentRevenue || 0,
          orderCount: openShift.orderCount || 0,
          cashierName: user?.name || user?.username || 'Unknown',
          branchName: 'Current Branch',
        });
      } else {
        setCurrentShift(null);
      }

      // Get low stock items
      let lowStock: LowStockItem[] = [];
      try {
        const response = await fetch(`/api/inventory-alerts?branchId=${user?.branchId}`);
        if (response.ok) {
          const data = await response.json();
          lowStock = (data.alerts || []).slice(0, 5).map((item: any) => ({
            id: item.id,
            name: item.ingredient?.name || item.ingredientId,
            currentStock: item.currentStock,
            minimumStock: item.minimumStock || 10,
            unit: item.ingredient?.unit || 'units',
          }));
        }
      } catch (error) {
        console.log('Failed to fetch inventory alerts, checking IndexedDB');
      }

      // Fallback to IndexedDB for low stock
      if (lowStock.length === 0) {
        const storage = getIndexedDBStorage();
        await storage.init();
        const allInventory = await storage.getAllInventory();
        lowStock = allInventory
          .filter((item: any) => item.currentStock <= (item.minimumStock || 10))
          .slice(0, 5)
          .map((item: any) => ({
            id: item.id,
            name: item.ingredient?.name || item.ingredientId,
            currentStock: item.currentStock,
            minimumStock: item.minimumStock || 10,
            unit: item.ingredient?.unit || 'units',
          }));
      }

      setLowStockItems(lowStock);

      // Get recent activity
      const activities: RecentActivity[] = [];
      todayOrders.slice(0, 3).forEach((order: any) => {
        activities.push({
          id: `order-${order.id}`,
          type: 'order',
          description: `Order #${order.orderNumber || 'N/A'}`,
          timestamp: order.createdAt || order.orderTimestamp,
          amount: order.totalAmount,
        });
      });

      // Add recent expenses
      let todayExpenses: any[] = [];
      try {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));
        const response = await fetch(`/api/daily-expenses?branchId=${user?.branchId}&startDate=${startOfDay.toISOString()}&endDate=${endOfDay.toISOString()}`);
        if (response.ok) {
          const data = await response.json();
          todayExpenses = data.expenses || [];
        }
      } catch (error) {
        console.log('Failed to fetch expenses from API, using IndexedDB');
      }

      // Fallback to IndexedDB for expenses
      if (todayExpenses.length === 0) {
        const storage = getIndexedDBStorage();
        await storage.init();
        const allExpenses = await storage.getAll('daily_expenses');
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));
        todayExpenses = allExpenses.filter((exp: any) => {
          const expDate = new Date(exp.createdAt);
          return expDate >= startOfDay && expDate <= endOfDay;
        });
      }

      todayExpenses.slice(0, 2).forEach((exp: any) => {
        activities.push({
          id: `expense-${exp.id}`,
          type: 'expense',
          description: `Expense: ${exp.reason}`,
          timestamp: exp.createdAt,
          amount: exp.amount,
        });
      });

      // Sort by timestamp
      activities.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setRecentActivity(activities.slice(0, 5));

      // Calculate stats
      setStats({
        todayRevenue,
        orderCount,
        shiftCount: 1,
        hoursOpen: new Date().getHours() - 8, // Assuming 8 AM start
        revenueChange: 15, // Mock data
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      showErrorToast('Error', 'Failed to load dashboard data');
      setLoading(false);
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  const handleRefresh = () => {
    fetchDashboardData(true);
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'order': return <ShoppingCart className="w-4 h-4 text-emerald-600" />;
      case 'expense': return <DollarSign className="w-4 h-4 text-red-600" />;
      case 'table': return <Coffee className="w-4 h-4 text-blue-600" />;
      case 'shift': return <Clock className="w-4 h-4 text-purple-600" />;
      default: return <CheckCircle className="w-4 h-4 text-slate-600" />;
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Coffee className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-bold">Emperor POS</h1>
              <p className="text-emerald-100 text-sm">Mobile Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 hover:bg-emerald-500 rounded-full transition-colors"
            >
              <Bell className="w-5 h-5" />
              {lowStockItems.length > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500">
                  {lowStockItems.length}
                </Badge>
              )}
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 hover:bg-emerald-500 rounded-full transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* User Info & Online Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold">{getGreeting()}, {user?.name?.split(' ')[0] || user?.username}!</p>
              <div className="flex items-center gap-2 text-emerald-100 text-sm">
                <Store className="w-3 h-3" />
                <span>{user?.branchName || 'Branch Manager'}</span>
              </div>
            </div>
          </div>
          {user?.branchId && <OfflineStatusIndicator branchId={user.branchId} />}
        </div>
      </div>

      {/* Notification Panel */}
      {showNotifications && (
        <Card className="mx-4 -mt-2 mb-4 border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-orange-900">Low Stock Alert</h4>
                <p className="text-sm text-orange-700 mt-1">
                  {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} running low
                </p>
                <div className="mt-3 space-y-2">
                  {lowStockItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-sm bg-white rounded-lg p-2"
                    >
                      <span className="font-medium text-orange-900">{item.name}</span>
                      <Badge variant="outline" className="text-orange-700 border-orange-300">
                        {item.currentStock} {item.unit}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setShowNotifications(false)}
                className="text-orange-600 hover:text-orange-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="p-4 space-y-4">
          {/* Today's Revenue Card */}
          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium">Today's Revenue</p>
                  <h2 className="text-3xl font-bold mt-1">{formatCurrency(stats.todayRevenue)}</h2>
                  <div className="flex items-center gap-1 mt-2 text-emerald-100 text-sm">
                    {stats.revenueChange >= 0 ? (
                      <>
                        <TrendingUp className="w-4 h-4" />
                        <span>+{stats.revenueChange}% from yesterday</span>
                      </>
                    ) : (
                      <>
                        <TrendingUp className="w-4 h-4 rotate-180" />
                        <span>{stats.revenueChange}% from yesterday</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-emerald-100 text-xs">Today</div>
                  <div className="text-lg font-semibold">
                    {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-white shadow-sm">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-emerald-600">{stats.orderCount}</div>
                <div className="text-xs text-slate-600 mt-1">Orders</div>
              </CardContent>
            </Card>
            <Card className="bg-white shadow-sm">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.shiftCount}</div>
                <div className="text-xs text-slate-600 mt-1">Shifts</div>
              </CardContent>
            </Card>
            <Card className="bg-white shadow-sm">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.hoursOpen}h</div>
                <div className="text-xs text-slate-600 mt-1">Hours</div>
              </CardContent>
            </Card>
          </div>

          {/* Current Shift Card */}
          {currentShift ? (
            <Card className="shadow-md border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                    <h3 className="font-semibold text-slate-900">Current Shift</h3>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-800">
                    {currentShift.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-xs text-slate-500">Started</p>
                    <p className="font-semibold text-slate-900">{formatTime(currentShift.startedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Duration</p>
                    <p className="font-semibold text-slate-900">
                      {Math.floor((Date.now() - new Date(currentShift.startedAt).getTime()) / (1000 * 60 * 60))}h
                      {Math.floor(((Date.now() - new Date(currentShift.startedAt).getTime()) / (1000 * 60)) % 60)}m
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Revenue</p>
                    <p className="font-semibold text-emerald-600">{formatCurrency(currentShift.currentRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Orders</p>
                    <p className="font-semibold text-slate-900">{currentShift.orderCount}</p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    // Navigate to Money tab to view shift details
                    window.dispatchEvent(new CustomEvent('mobile-tab-change', { detail: 'mobile-money' }));
                  }}
                >
                  View Details
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-md border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <div>
                      <h3 className="font-semibold text-slate-900">No Active Shift</h3>
                      <p className="text-sm text-slate-500">Open a shift to start taking orders</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('mobile-tab-change', { detail: 'mobile-money' }));
                    }}
                  >
                    Open
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3 px-1">⚡ Quick Actions</h3>
            <div className="grid grid-cols-3 gap-3">
              <Button
                variant="outline"
                className="h-24 flex-col gap-2 bg-white hover:bg-emerald-50 hover:border-emerald-300"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('mobile-tab-change', { detail: 'mobile-pos' }));
                }}
              >
                <ShoppingCart className="w-6 h-6 text-emerald-600" />
                <span className="text-xs font-medium">New Order</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex-col gap-2 bg-white hover:bg-red-50 hover:border-red-300"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('mobile-tab-change', { detail: 'mobile-money' }));
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('add-expense'));
                  }, 100);
                }}
              >
                <DollarSign className="w-6 h-6 text-red-600" />
                <span className="text-xs font-medium">Add Exp.</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex-col gap-2 bg-white hover:bg-blue-50 hover:border-blue-300"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('mobile-tab-change', { detail: 'mobile-money' }));
                }}
              >
                <Clock className="w-6 h-6 text-blue-600" />
                <span className="text-xs font-medium">Open Shift</span>
              </Button>
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3 px-1">📊 Recent Activity</h3>
            <Card className="shadow-sm">
              <CardContent className="p-3">
                <div className="space-y-3">
                  {recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      {getActivityIcon(activity.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{activity.description}</p>
                        <p className="text-xs text-slate-500">{formatTime(activity.timestamp)}</p>
                      </div>
                      {activity.amount && (
                        <span className="text-sm font-semibold text-slate-900">
                          {activity.type === 'expense' ? '-' : '+'}{formatCurrency(activity.amount)}
                        </span>
                      )}
                    </div>
                  ))}
                  {recentActivity.length === 0 && (
                    <p className="text-center text-sm text-slate-500 py-4">No recent activity</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
