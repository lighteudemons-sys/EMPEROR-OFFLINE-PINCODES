'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  RefreshCw,
  Package,
  Target,
  AlertCircle,
  Utensils,
  Truck,
  Store,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Coffee,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface Branch {
  id: string;
  branchName: string;
  isActive: boolean;
}

interface KPIData {
  revenue: {
    total: number;
    net: number;
    productCost: number;
    deliveryFees: number;
    growth: number;
  };
  orders: {
    total: number;
    items: number;
    avgValue: number;
    growth: number;
    avgValueGrowth: number;
  };
  orderTypes: {
    dineIn: { count: number; revenue: number };
    takeAway: { count: number; revenue: number };
    delivery: { count: number; revenue: number };
  };
  hourlySales: { hour: number; revenue: number; orders: number }[];
  peakHour: {
    hour: number;
    revenue: number;
    orders: number;
  };
  refunds: {
    count: number;
    rate: number;
  };
  topCategories: { category: string; revenue: number }[];
  paymentMethods: any;
}

interface TopItem {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  category?: string;
}

const timeRanges = [
  { value: 'today', label: 'Today', days: 1 },
  { value: 'week', label: 'This Week', days: 7 },
  { value: 'month', label: 'This Month', days: 30 },
  { value: 'custom', label: 'Custom', days: 0 },
];

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];

export function MobileReports() {
  const { user } = useAuth();
  const { currency, t } = useI18n();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (user?.role === 'ADMIN') {
      return 'all';
    } else if (user?.branchId) {
      return user.branchId;
    }
    return 'all';
  });
  const [timeRange, setTimeRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [kpiData, setKPIData] = useState<KPIData | null>(null);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  // Fetch branches
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const response = await fetch('/api/branches');
        if (response.ok) {
          const data = await response.json();
          setBranches(data.branches || []);
        }
      } catch (error) {
        console.error('Failed to fetch branches:', error);
      }
    };
    fetchBranches();
  }, []);

  // Set default branch based on user role
  useEffect(() => {
    if (user) {
      if (user.role === 'ADMIN') {
        setSelectedBranch('all');
      } else if (user.branchId) {
        setSelectedBranch(user.branchId);
      }
    }
  }, [user]);

  // Fetch data when filters change
  useEffect(() => {
    fetchKPIs();
    fetchTopItems();
  }, [selectedBranch, timeRange, customStartDate, customEndDate]);

  const getDateRange = () => {
    const now = new Date();
    const endDate = new Date(now);
    let startDate = new Date(now);

    if (timeRange === 'today') {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeRange === 'week') {
      const dayOfWeek = startDate.getDay();
      startDate.setDate(startDate.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeRange === 'month') {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeRange === 'custom' && customStartDate && customEndDate) {
      startDate = new Date(customStartDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
    }

    return { startDate, endDate };
  };

  const fetchKPIs = async () => {
    if (timeRange === 'custom' && (!customStartDate || !customEndDate)) {
      return;
    }

    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();

      const params = new URLSearchParams();
      if (selectedBranch && selectedBranch !== 'all') {
        params.append('branchId', selectedBranch);
      }
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());

      const response = await fetch(`/api/reports/kpi?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setKPIData(data.data);
      } else {
        console.error('[Mobile Reports] API Error:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch KPIs:', error);
      showErrorToast('Error', 'Failed to load reports data');
    } finally {
      setLoading(false);
    }
  };

  const fetchTopItems = async () => {
    if (timeRange === 'custom' && (!customStartDate || !customEndDate)) {
      return;
    }

    try {
      const { startDate, endDate } = getDateRange();

      const params = new URLSearchParams();
      if (selectedBranch && selectedBranch !== 'all') {
        params.append('branchId', selectedBranch);
      }
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());
      params.append('limit', '10');

      const response = await fetch(`/api/reports/items?${params.toString()}`);
      const data = await response.json();

      if (data.success && data.items) {
        setTopItems(data.items);
      }
    } catch (error) {
      console.error('Failed to fetch top items:', error);
    }
  };

  const handleExport = () => {
    if (!exportStartDate || !exportEndDate) {
      showErrorToast('Error', 'Please select start and end dates');
      return;
    }

    const params = new URLSearchParams();
    params.append('format', 'excel');
    params.append('startDate', exportStartDate);
    params.append('endDate', exportEndDate);
    if (selectedBranch && selectedBranch !== 'all') {
      params.append('branchId', selectedBranch);
    }

    window.location.href = `/api/reports/export?${params.toString()}`;
    setExportDialogOpen(false);
    showSuccessToast('Success', 'Export started');
  };

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  const GrowthBadge = ({ value, label }: { value: number; label?: string }) => {
    const isPositive = value >= 0;
    return (
      <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
        <span>{Math.abs(value).toFixed(1)}%</span>
        {label && <span className="text-slate-500 ml-1">vs prev</span>}
      </div>
    );
  };

  if (loading && !kpiData) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Reports</h1>
            <p className="text-emerald-100 text-sm">Performance Analytics</p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          {user?.role === 'ADMIN' && (
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-full bg-white/10 border-white/20 text-white">
                <Store className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.branchName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="flex-1 bg-white/10 border-white/20 text-white">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeRanges.map((range) => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              className="bg-white/10 hover:bg-white/20 text-white border-0 h-12 w-12"
              onClick={() => {
                fetchKPIs();
                fetchTopItems();
              }}
              disabled={loading}
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {timeRange === 'custom' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-white/10 border-white/20 text-white"
                />
              </div>
              <div className="flex-1">
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-white/10 border-white/20 text-white"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="p-4 space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-1">Total Sales</p>
                <p className="text-xl font-bold text-slate-900">
                  {formatCurrency(kpiData?.revenue.total || 0)}
                </p>
                {kpiData?.revenue.growth !== undefined && (
                  <div className="mt-2">
                    <GrowthBadge value={kpiData.revenue.growth} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <ShoppingCart className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-1">Total Orders</p>
                <p className="text-xl font-bold text-slate-900">
                  {kpiData?.orders.total || 0}
                </p>
                {kpiData?.orders.growth !== undefined && (
                  <div className="mt-2">
                    <GrowthBadge value={kpiData.orders.growth} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Target className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-1">Avg Order</p>
                <p className="text-xl font-bold text-slate-900">
                  {formatCurrency(kpiData?.orders.avgValue || 0)}
                </p>
                <p className="text-xs text-slate-500 mt-2">Per transaction</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-1">Refund Rate</p>
                <p className="text-xl font-bold text-slate-900">
                  {(kpiData?.refunds.rate || 0).toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  {kpiData?.refunds.count || 0} refunds
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Hourly Sales Chart */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Hourly Sales
              </CardTitle>
              <CardDescription className="text-xs">
                Peak: {formatHour(kpiData?.peakHour.hour || 0)} ({formatCurrency(kpiData?.peakHour.revenue || 0)})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                {kpiData?.hourlySales && kpiData.hourlySales.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={kpiData.hourlySales}>
                      <XAxis
                        dataKey="hour"
                        tickFormatter={formatHour}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis
                        tickFormatter={(value) => formatCurrency(value, currency)}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip
                        formatter={(value: any) => [formatCurrency(value, currency), 'Revenue']}
                        labelFormatter={formatHour}
                        contentStyle={{ fontSize: '12px' }}
                      />
                      <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                    No hourly data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Order Types */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Coffee className="h-4 w-4 text-emerald-600" />
                Order Types
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Utensils className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium">Dine-In</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-700">{kpiData?.orderTypes.dineIn.count || 0}</p>
                    <p className="text-xs text-emerald-600">{formatCurrency(kpiData?.orderTypes.dineIn.revenue || 0)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium">Take-Away</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-700">{kpiData?.orderTypes.takeAway.count || 0}</p>
                    <p className="text-xs text-amber-600">{formatCurrency(kpiData?.orderTypes.takeAway.revenue || 0)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Delivery</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-700">{kpiData?.orderTypes.delivery.count || 0}</p>
                    <p className="text-xs text-blue-600">{formatCurrency(kpiData?.orderTypes.delivery.revenue || 0)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Categories */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-600" />
                Top Categories
              </CardTitle>
              <CardDescription className="text-xs">Revenue by category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {!kpiData?.topCategories || kpiData.topCategories.length === 0 ? (
                  <p className="text-center text-sm text-slate-500 py-4">No category data</p>
                ) : (
                  kpiData.topCategories.slice(0, 5).map((category, index) => (
                    <div key={category.category} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-600 text-xs">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-900">{category.category}</span>
                          <span className="text-sm font-bold text-emerald-600">
                            {formatCurrency(category.revenue)}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-emerald-600 h-2 rounded-full transition-all"
                            style={{
                              width: `${((category.revenue / (kpiData.topCategories[0]?.revenue || 1)) * 100)}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Items */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Top Selling Items
              </CardTitle>
              <CardDescription className="text-xs">Best performers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topItems.length === 0 ? (
                  <p className="text-center text-sm text-slate-500 py-4">No items data</p>
                ) : (
                  topItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-600 text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">{item.quantity} sold</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-emerald-600">
                        {formatCurrency(item.revenue)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Export Button */}
          <Button
            className="w-full h-14 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => {
              const { startDate, endDate } = getDateRange();
              setExportStartDate(startDate.toISOString().split('T')[0]);
              setExportEndDate(endDate.toISOString().split('T')[0]);
              setExportDialogOpen(true);
            }}
          >
            <Download className="w-5 h-5 mr-2" />
            Export Report
          </Button>

          {/* Footer */}
          <div className="text-center text-xs text-slate-500 pb-4">
            <p>Reports Dashboard v2.0</p>
          </div>
        </div>
      </ScrollArea>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="export-start">Start Date</Label>
              <Input
                id="export-start"
                type="date"
                value={exportStartDate}
                onChange={(e) => setExportStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="export-end">End Date</Label>
              <Input
                id="export-end"
                type="date"
                value={exportEndDate}
                onChange={(e) => setExportEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
