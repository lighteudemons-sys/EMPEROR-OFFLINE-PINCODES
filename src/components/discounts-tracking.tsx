'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Tag, Percent, Calendar, DollarSign, User, Store, Download } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

interface Branch {
  id: string;
  branchName: string;
}

interface DiscountRecord {
  id: string;
  orderId: string;
  orderNumber: number;
  orderTimestamp: string;
  discountType: 'manual' | 'promo';
  discountPercent?: number | null;
  discountAmount: number;
  promoCode?: string | null;
  manualDiscountComment?: string | null;
  subtotal: number;
  totalAmount: number;
  cashierName: string;
  branchName: string;
  branchId: string;
}

interface DiscountSummary {
  totalDiscounts: number;
  manualDiscountsCount: number;
  manualDiscountsTotal: number;
  promoDiscountsCount: number;
  promoDiscountsTotal: number;
  averageDiscountPercent: number;
}

const timeRanges = [
  { value: 'today', label: 'Today', days: 1 },
  { value: 'yesterday', label: 'Yesterday', days: 1 },
  { value: 'week', label: 'This Week', days: 7 },
  { value: 'lastWeek', label: 'Last Week', days: 7 },
  { value: 'month', label: 'This Month', days: 30 },
  { value: 'lastMonth', label: 'Last Month', days: 30 },
  { value: 'quarter', label: 'This Quarter', days: 90 },
  { value: 'year', label: 'This Year', days: 365 },
];

export default function DiscountsTracking() {
  const { user } = useAuth();
  const { currency } = useI18n();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (user?.role === 'ADMIN') {
      return 'all';
    } else if (user?.branchId) {
      return user.branchId;
    }
    return 'all';
  });
  const [timeRange, setTimeRange] = useState('month');
  const [discountType, setDiscountType] = useState<'all' | 'manual' | 'promo'>('all');
  const [discounts, setDiscounts] = useState<DiscountRecord[]>([]);
  const [summary, setSummary] = useState<DiscountSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Fetch discounts when filters change
  useEffect(() => {
    fetchDiscounts();
  }, [selectedBranch, timeRange, discountType]);

  const fetchDiscounts = async () => {
    setLoading(true);
    try {
      const range = timeRanges.find(r => r.value === timeRange);
      if (!range) return;

      const now = new Date();
      const endDate = new Date(now);
      let startDate = new Date(now);

      // Set start time to 00:00:00 and end time to 23:59:59
      if (timeRange === 'today') {
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'yesterday') {
        startDate.setDate(now.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(now.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'lastWeek') {
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(now.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'lastMonth') {
        startDate.setMonth(now.getMonth() - 1);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(now.getMonth());
        endDate.setDate(0);
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
      } else if (timeRange === 'quarter') {
        startDate.setMonth(startDate.getMonth() - 3);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'year') {
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      }

      const params = new URLSearchParams();
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());
      if (selectedBranch && selectedBranch !== 'all') {
        params.append('branchId', selectedBranch);
      }
      if (discountType !== 'all') {
        params.append('type', discountType);
      }

      const response = await fetch(`/api/discounts?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setDiscounts(data.discounts || []);
        setSummary(data.summary || null);
      } else {
        console.error('Failed to fetch discounts:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch discounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const range = timeRanges.find(r => r.value === timeRange);
    if (!range) return;

    const now = new Date();
    const endDate = new Date(now);
    let startDate = new Date(now);

    if (timeRange === 'today') {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeRange === 'yesterday') {
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeRange === 'lastWeek') {
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeRange === 'lastMonth') {
      startDate.setMonth(now.getMonth() - 1);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setMonth(now.getMonth());
      endDate.setDate(0);
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
    } else if (timeRange === 'quarter') {
      startDate.setMonth(startDate.getMonth() - 3);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeRange === 'year') {
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    }

    const params = new URLSearchParams();
    params.append('startDate', startDate.toISOString());
    params.append('endDate', endDate.toISOString());
    if (selectedBranch && selectedBranch !== 'all') {
      params.append('branchId', selectedBranch);
    }
    if (discountType !== 'all') {
      params.append('type', discountType);
    }

    window.location.href = `/api/discounts/export?${params.toString()}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredDiscounts = discounts.filter(discount =>
    discount.orderNumber.toString().includes(searchQuery) ||
    (discount.promoCode && discount.promoCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
    discount.cashierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (discount.manualDiscountComment && discount.manualDiscountComment.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow-md">
                <Tag className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Discounts Tracking</h2>
                <p className="text-sm text-slate-600">Monitor manual and promo code discounts</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {user?.role === 'ADMIN' && (
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <Store className="h-4 w-4 mr-2 text-orange-500" />
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

              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Calendar className="h-4 w-4 mr-2 text-orange-500" />
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

              <Select value={discountType} onValueChange={(value: 'all' | 'manual' | 'promo') => setDiscountType(value)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Percent className="h-4 w-4 mr-2 text-orange-500" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="promo">Promo Code</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={fetchDiscounts}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-orange-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-600 mb-2">Total Discounts</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {formatCurrency(summary.totalDiscounts, currency)}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    {summary.manualDiscountsCount + summary.promoDiscountsCount} discount transactions
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-orange-100">
                  <DollarSign className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-600 mb-2">Manual Discounts</p>
                  <p className="text-3xl font-bold text-purple-700">
                    {formatCurrency(summary.manualDiscountsTotal, currency)}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    {summary.manualDiscountsCount} transactions
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-purple-100">
                  <Percent className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-600 mb-2">Promo Code Discounts</p>
                  <p className="text-3xl font-bold text-emerald-700">
                    {formatCurrency(summary.promoDiscountsTotal, currency)}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    {summary.promoDiscountsCount} transactions
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-100">
                  <Tag className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-600 mb-2">Avg Discount %</p>
                  <p className="text-3xl font-bold text-blue-700">
                    {summary.averageDiscountPercent.toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Of discounted orders
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-100">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Discounts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-orange-500" />
                Discount Records
              </CardTitle>
              <CardDescription>
                View all applied discounts with order details
              </CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Label htmlFor="search" className="sr-only">Search</Label>
                <Input
                  id="search"
                  placeholder="Search orders, cashiers, codes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-[250px]"
                />
              </div>
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full"></div>
            </div>
          ) : filteredDiscounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 text-slate-500">
              <Tag className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">No discounts found</p>
              <p className="text-sm mt-2">
                {searchQuery ? 'Try a different search term' : 'No discounts were applied in the selected period'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Code / %</TableHead>
                    <TableHead>Comment</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Subtotal</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Cashier</TableHead>
                    <TableHead>Branch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDiscounts.map((discount) => (
                    <TableRow key={discount.id}>
                      <TableCell className="font-medium">
                        #{discount.orderNumber}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {formatDate(discount.orderTimestamp)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatTime(discount.orderTimestamp)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {discount.discountType === 'manual' ? (
                          <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200">
                            Manual
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                            Promo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {discount.discountType === 'manual' ? (
                          <span className="font-medium text-purple-700">
                            {discount.discountPercent}%
                          </span>
                        ) : (
                          <span className="font-medium text-emerald-700">
                            {discount.promoCode || '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {discount.manualDiscountComment || '-'}
                      </TableCell>
                      <TableCell className="text-red-600 font-medium">
                        -{formatCurrency(discount.discountAmount, currency)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(discount.subtotal, currency)}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(discount.totalAmount, currency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-400" />
                          <span className="text-sm">{discount.cashierName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-slate-400" />
                          <span className="text-sm">{discount.branchName}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
