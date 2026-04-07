'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Calendar,
  RefreshCw,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  Store,
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
  PieChart as RechartsPieChart,
  Pie,
  Legend,
} from 'recharts';

interface Branch {
  id: string;
  branchName: string;
  isActive: boolean;
}

interface AnalyticsData {
  date: string;
  revenue: number;
  orders: number;
  items: number;
}

interface TopItem {
  menuItemId: string;
  itemName: string;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
}

interface CategoryData {
  category: string;
  revenue: number;
  count: number;
}

interface PerformanceMetrics {
  avgOrderValue: number;
  peakHours: { hour: number; count: number }[];
  paymentDistribution: { cash: number; card: number };
  totalOrders: number;
}

interface AnalyticsResponse {
  historicalData: AnalyticsData[];
  trends: {
    revenueGrowth: number;
    orderGrowth: number;
    trendDirection: 'up' | 'down' | 'stable';
    recentAverage: number;
    previousAverage: number;
  };
  topItems: TopItem[];
  performance: PerformanceMetrics;
}

const periods = [
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
];

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export function MobileAnalytics() {
  const { user } = useAuth();
  const { currency, t } = useI18n();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (user?.role === 'ADMIN') {
      return 'all';
    } else if (user?.branchId) {
      return user.branchId;
    }
    return '';
  });
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(false);

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

  // Fetch analytics when filters change
  useEffect(() => {
    if (selectedBranch) {
      fetchAnalytics();
    }
  }, [selectedBranch, selectedPeriod]);

  const fetchAnalytics = async () => {
    if (!selectedBranch) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranch && selectedBranch !== 'all') {
        params.append('branchId', selectedBranch);
      } else if (branches.length > 0) {
        params.append('branchId', branches[0].id);
      }
      params.append('period', 'daily');

      const response = await fetch(`/api/analytics?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        // Filter data based on selected period
        const days = parseInt(selectedPeriod);
        const filteredData = {
          ...data,
          historicalData: data.historicalData.slice(-days),
        };
        setAnalyticsData(filteredData);

        // Fetch category data from orders API
        await fetchCategoryData();
      } else {
        console.error('[Mobile Analytics] API Error:', data.error);
        showErrorToast('Error', 'Failed to load analytics data');
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      showErrorToast('Error', 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoryData = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedBranch && selectedBranch !== 'all') {
        params.append('branchId', selectedBranch);
      } else if (branches.length > 0) {
        params.append('branchId', branches[0].id);
      }

      const days = parseInt(selectedPeriod);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const endDate = new Date();

      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());

      const response = await fetch(`/api/reports/kpi?${params.toString()}`);
      const data = await response.json();

      if (data.success && data.data?.topCategories) {
        setCategoryData(data.data.topCategories);
      }
    } catch (error) {
      console.error('Failed to fetch category data:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
        {label && <span className="text-slate-500 ml-1">{label}</span>}
      </div>
    );
  };

  const filteredTopItems = analyticsData?.topItems?.filter((item) => {
    if (selectedCategory === 'all') return true;
    // Simple filter based on item name containing category
    return item.itemName.toLowerCase().includes(selectedCategory.toLowerCase());
  }) || [];

  if (loading && !analyticsData) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Analytics</h1>
            <p className="text-purple-100 text-sm">Sales & Performance Insights</p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          {user?.role === 'ADMIN' && (
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-full bg-white/10 border-white/20 text-white">
                <Store className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Select branch..." />
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
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="flex-1 bg-white/10 border-white/20 text-white">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((period) => (
                  <SelectItem key={period.value} value={period.value}>
                    {period.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              className="bg-white/10 hover:bg-white/20 text-white border-0 h-12 w-12"
              onClick={fetchAnalytics}
              disabled={loading}
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="p-4 space-y-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-1">Total Revenue</p>
                <p className="text-xl font-bold text-slate-900">
                  {formatCurrency(
                    analyticsData?.historicalData?.reduce((sum, d) => sum + d.revenue, 0) || 0
                  )}
                </p>
                {analyticsData?.trends?.revenueGrowth !== undefined && (
                  <div className="mt-2">
                    <GrowthBadge value={analyticsData.trends.revenueGrowth} label="vs prev" />
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
                  {analyticsData?.historicalData?.reduce((sum, d) => sum + d.orders, 0) || 0}
                </p>
                {analyticsData?.trends?.orderGrowth !== undefined && (
                  <div className="mt-2">
                    <GrowthBadge value={analyticsData.trends.orderGrowth} label="vs prev" />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Coffee className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-1">Avg Order Value</p>
                <p className="text-xl font-bold text-slate-900">
                  {formatCurrency(analyticsData?.performance?.avgOrderValue || 0)}
                </p>
                <p className="text-xs text-slate-500 mt-2">Per transaction</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                    <Package className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-1">Items Sold</p>
                <p className="text-xl font-bold text-slate-900">
                  {analyticsData?.historicalData?.reduce((sum, d) => sum + d.items, 0) || 0}
                </p>
                <p className="text-xs text-slate-500 mt-2">Total items</p>
              </CardContent>
            </Card>
          </div>

          {/* Sales Trend Chart */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-600" />
                Sales Trend
              </CardTitle>
              <CardDescription className="text-xs">Revenue over selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                {analyticsData?.historicalData && analyticsData.historicalData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData.historicalData}>
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickFormatter={(value) => formatCurrency(value, currency)}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip
                        formatter={(value: any) => [formatCurrency(value, currency), 'Revenue']}
                        labelFormatter={formatDate}
                        contentStyle={{ fontSize: '12px' }}
                      />
                      <Bar dataKey="revenue" fill="#9333ea" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                    No data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Revenue by Category */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <PieChart className="h-4 w-4 text-purple-600" />
                Revenue by Category
              </CardTitle>
              <CardDescription className="text-xs">Top performing categories</CardDescription>
            </CardHeader>
            <CardContent>
              {categoryData.length > 0 ? (
                <>
                  <div className="h-48 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={categoryData.slice(0, 5)}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={60}
                          paddingAngle={5}
                          dataKey="revenue"
                        >
                          {categoryData.slice(0, 5).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => formatCurrency(value, currency)} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {categoryData.slice(0, 5).map((category, index) => (
                      <div key={category.category} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-sm text-slate-700">{category.category}</span>
                        </div>
                        <span className="text-sm font-medium text-slate-900">
                          {formatCurrency(category.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
                  No category data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category Filter */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Filter by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full h-12">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categoryData.slice(0, 10).map((cat) => (
                    <SelectItem key={cat.category} value={cat.category}>
                      {cat.category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Top Selling Items */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-600" />
                Top Selling Items
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedCategory === 'all' ? 'Best performers' : `Filtered by ${selectedCategory}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredTopItems.length === 0 ? (
                  <p className="text-center text-sm text-slate-500 py-4">No items data</p>
                ) : (
                  filteredTopItems.slice(0, 10).map((item, index) => (
                    <div
                      key={item.menuItemId}
                      className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-600 text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{item.itemName}</p>
                          <p className="text-xs text-slate-500">{item.totalQuantity} sold</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-emerald-600">
                        {formatCurrency(item.totalRevenue)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Peak Hours */}
          {analyticsData?.performance?.peakHours && analyticsData.performance.peakHours.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                  Peak Hours
                </CardTitle>
                <CardDescription className="text-xs">Busiest times of day</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analyticsData.performance.peakHours.slice(0, 5).map((peak, index) => (
                    <div key={peak.hour} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-600 text-xs">
                          {index + 1}
                        </div>
                        <span className="text-sm font-medium text-slate-900">
                          {formatHour(peak.hour)}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {peak.count} orders
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <div className="text-center text-xs text-slate-500 pb-4">
            <p>Mobile Analytics v1.0</p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
