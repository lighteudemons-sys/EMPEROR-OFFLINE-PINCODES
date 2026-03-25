'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BarChart3, TrendingUp, TrendingDown, Package, ShoppingCart, Calendar,
  DollarSign, Store, FileText, RotateCw, FileSpreadsheet, PieChart,
  Clock, Users, CreditCard, Wallet, Truck, Utensils, Coffee, ArrowUpRight,
  ArrowDownRight, Activity, Target, AlertCircle, RefreshCw, Download,
  ArrowRight, Eye, Printer, RefreshCw as RefreshIcon, XCircle, Smartphone, Tag
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import {
  LineChart, Line, BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// Import report components
import ProductPerformanceReport from './reports-products';
import CustomerAnalyticsReport from './reports-customers';
import BranchComparisonReport from './reports-branches';
import StaffPerformanceReport from './reports-staff';
import DailyReportsTab from './reports-daily';
import { ReceiptViewer } from './receipt-viewer';
import DiscountsTracking from './discounts-tracking';

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
  paymentMethods: any;
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
  comparison: any;
}

interface Order {
  id: string;
  orderNumber: number;
  subtotal: number;
  totalAmount: number;
  deliveryFee: number;
  orderTimestamp: Date;
  paymentMethod: string;
  paymentMethodDetail?: 'CARD' | 'INSTAPAY' | 'MOBILE_WALLET' | null;
  orderType: string;
  isRefunded: boolean;
  refundReason?: string;
  cashier: { name: string } | null;
  branch: { branchName: string } | null;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    menuItem?: {
      id: string;
      name: string;
      category: string;
      price: number;
    };
  }>;
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

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];

export default function ReportsDashboard() {
  const { user } = useAuth();
  const { currency, t } = useI18n();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  // Initialize selectedBranch based on user role - Branch Manager should see only their branch
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (user?.role === 'ADMIN') {
      return 'all';
    } else if (user?.branchId) {
      return user.branchId;
    }
    return 'all';
  });
  const [timeRange, setTimeRange] = useState('year'); // Changed from 'month' to 'year' to show more data
  const [comparePeriod, setComparePeriod] = useState(true);
  const [kpiData, setKPIData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(false);

  // Sales/Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [duplicateReceiptOrder, setDuplicateReceiptOrder] = useState<Order | null>(null);
  const [refundUsername, setRefundUsername] = useState('');
  const [refundPassword, setRefundPassword] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);
  // Void item state
  const [voidItemDialogOpen, setVoidItemDialogOpen] = useState(false);
  const [selectedVoidItem, setSelectedVoidItem] = useState<any>(null);
  const [voidQuantity, setVoidQuantity] = useState<number>(1);
  const [voidReason, setVoidReason] = useState('');
  const [voidUsername, setVoidUsername] = useState('');
  const [voidPassword, setVoidPassword] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage] = useState(12);
  const [totalOrders, setTotalOrders] = useState(0);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  // Detailed Revenue Report state
  const [detailedReportOpen, setDetailedReportOpen] = useState(false);
  const [detailedOrders, setDetailedOrders] = useState<any[]>([]);
  const [detailedReportLoading, setDetailedReportLoading] = useState(false);

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

  // Fetch KPIs when filters change
  useEffect(() => {
    if (activeTab === 'overview') {
      fetchKPIs();
    }
  }, [selectedBranch, timeRange, comparePeriod, activeTab]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBranch, timeRange]);

  // Fetch orders when tab changes to sales or page changes
  useEffect(() => {
    if (activeTab === 'sales') {
      fetchOrders();
    }
  }, [selectedBranch, timeRange, activeTab, currentPage]);

  const fetchKPIs = async () => {
    setLoading(true);
    try {
      const range = timeRanges.find(r => r.value === timeRange);
      if (!range) return;

      const now = new Date();
      const endDate = new Date(now);
      let startDate = new Date(now);

      // Set start time to 00:00:00 and end time to 23:59:59 for proper day filtering
      if (timeRange === 'today') {
        // Today: start at 00:00:00, end at 23:59:59
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'yesterday') {
        // Yesterday: yesterday 00:00:00 to yesterday 23:59:59
        startDate.setDate(now.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(now.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'lastWeek') {
        // Last 7 days: start 7 days ago, end yesterday
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(now.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'lastMonth') {
        // Last month: 1st of last month to last day of last month
        startDate.setMonth(now.getMonth() - 1);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(now.getMonth());
        endDate.setDate(0); // Last day of current month (previous month)
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'week') {
        // This week: start of week (Sunday) to today
        const dayOfWeek = startDate.getDay(); // 0 = Sunday, 6 = Saturday
        startDate.setDate(startDate.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'month') {
        // This month: 1st of current month to today
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'quarter') {
        // This quarter: 3 months ago to today
        startDate.setMonth(startDate.getMonth() - 3);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'year') {
        // This year: Jan 1 to today
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      }

      const params = new URLSearchParams();
      if (selectedBranch && selectedBranch !== 'all') {
        params.append('branchId', selectedBranch);
      }
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());
      if (comparePeriod) {
        params.append('comparePeriod', 'true');
      }

      const response = await fetch(`/api/reports/kpi?${params.toString()}`);
      const data = await response.json();

      console.log('[Overview Report] API Response:', data);

      if (data.success) {
        setKPIData(data.data);
      } else {
        console.error('[Overview Report] API Error:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch KPIs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const range = timeRanges.find(r => r.value === timeRange);
      if (!range) return;

      const now = new Date();
      const endDate = new Date(now);
      let startDate = new Date(now);

      // Set start time to 00:00:00 and end time to 23:59:59 for proper day filtering
      if (timeRange === 'today') {
        // Today: start at 00:00:00, end at 23:59:59
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'yesterday') {
        // Yesterday: yesterday 00:00:00 to yesterday 23:59:59
        startDate.setDate(now.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(now.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'lastWeek') {
        // Last 7 days: start 7 days ago, end yesterday
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(now.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'lastMonth') {
        // Last month: 1st of last month to last day of last month
        startDate.setMonth(now.getMonth() - 1);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(now.getMonth());
        endDate.setDate(0); // Last day of current month (previous month)
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'week') {
        // This week: start of week (Sunday) to today
        const dayOfWeek = startDate.getDay(); // 0 = Sunday, 6 = Saturday
        startDate.setDate(startDate.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'month') {
        // This month: 1st of current month to today
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'quarter') {
        // This quarter: 3 months ago to today
        startDate.setMonth(startDate.getMonth() - 3);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (timeRange === 'year') {
        // This year: Jan 1 to today
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      }

      const offset = (currentPage - 1) * ordersPerPage;

      const params = new URLSearchParams();
      if (selectedBranch && selectedBranch !== 'all') {
        params.append('branchId', selectedBranch);
      }
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());
      params.append('limit', ordersPerPage.toString());
      params.append('offset', offset.toString());

      const response = await fetch(`/api/orders?${params.toString()}`);
      const data = await response.json();

      console.log('[Sales Orders] API Response:', data);

      if (data.orders) {
        setOrders(data.orders);
        setTotalOrders(data.pagination?.total || 0);
      } else {
        console.error('[Sales Orders] API Error: No orders in response');
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefund = async () => {
    if (!selectedOrder) return;

    setIsRefunding(true);
    try {
      const response = await fetch('/api/orders/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          username: refundUsername,
          password: refundPassword,
          reason: refundReason,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setOrders(prevOrders =>
          prevOrders.map(order =>
            order.id === selectedOrder.id
              ? { ...order, isRefunded: true, refundReason }
              : order
          )
        );

        setRefundDialogOpen(false);
        setRefundUsername('');
        setRefundPassword('');
        setRefundReason('');
        setSelectedOrder(null);
        setOrderDialogOpen(false);

        alert(t('msg.saved.successfully'));
        fetchOrders();
      } else {
        alert(data.error || t('msg.operation.failed'));
      }
    } catch (error) {
      console.error('Refund error:', error);
      alert(t('msg.operation.failed'));
    } finally {
      setIsRefunding(false);
    }
  };

  const handleVoidItem = async () => {
    if (!selectedVoidItem || !voidQuantity || voidQuantity <= 0) {
      alert(t('form.required.field'));
      return;
    }

    setIsVoiding(true);
    try {
      const response = await fetch('/api/orders/void-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderItemId: selectedVoidItem.id,
          quantity: voidQuantity,
          username: voidUsername,
          password: voidPassword,
          reason: voidReason,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(`${t('btn.void')}ed ${voidQuantity} ${selectedVoidItem.menuItem?.name || selectedVoidItem.itemName} ${t('msg.saved.successfully')}`);
        setVoidItemDialogOpen(false);
        setVoidQuantity(1);
        setVoidReason('');
        setVoidUsername('');
        setVoidPassword('');
        setSelectedVoidItem(null);
        // Refresh order data
        fetchOrders();
        // Reopen order dialog to show updated data
        if (selectedOrder) {
          const updatedOrderResponse = await fetch(`/api/orders/${selectedOrder.id}`);
          if (updatedOrderResponse.ok) {
            const updatedOrderData = await updatedOrderResponse.json();
            if (updatedOrderData.success) {
              setSelectedOrder(updatedOrderData.order);
            }
          }
        }
      } else {
        alert(data.error || t('msg.operation.failed'));
      }
    } catch (error) {
      console.error('Void item error:', error);
      alert(t('msg.operation.failed'));
    } finally {
      setIsVoiding(false);
    }
  };

  const openVoidDialog = (item: any) => {
    if (selectedOrder?.isRefunded) {
      alert(t('form.invalid.input'));
      return;
    }
    setSelectedVoidItem(item);
    setVoidQuantity(1);
    setVoidReason('');
    setVoidUsername('');
    setVoidPassword('');
    setVoidItemDialogOpen(true);
  };

  const handleExport = () => {
    if (!exportStartDate || !exportEndDate) {
      alert(t('form.required.field'));
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
  };

  const handleOpenDetailedReport = async () => {
    setDetailedReportLoading(true);
    setDetailedReportOpen(true);

    try {
      const range = timeRanges.find(r => r.value === timeRange);
      if (!range) return;

      const now = new Date();
      const endDate = new Date(now);
      let startDate = new Date(now);

      // Set dates based on selected time range (same logic as fetchKPIs)
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

      const response = await fetch(`/api/reports/detailed-orders?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setDetailedOrders(data.data);
      } else {
        alert(data.error || 'Failed to fetch detailed orders');
      }
    } catch (error) {
      console.error('Failed to fetch detailed orders:', error);
      alert('Failed to fetch detailed orders');
    } finally {
      setDetailedReportLoading(false);
    }
  };

  const handleExportDetailedReport = () => {
    const range = timeRanges.find(r => r.value === timeRange);
    if (!range) return;

    const now = new Date();
    const endDate = new Date(now);
    let startDate = new Date(now);

    // Set dates based on selected time range
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
    params.append('format', 'excel');
    params.append('startDate', startDate.toISOString());
    params.append('endDate', endDate.toISOString());
    if (selectedBranch && selectedBranch !== 'all') {
      params.append('branchId', selectedBranch);
    }

    window.location.href = `/api/reports/detailed-orders?${params.toString()}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  const KPICard = ({
    title,
    value,
    icon: Icon,
    growth,
    subtitle,
    color = 'primary',
    onClick
  }: {
    title: string;
    value: string;
    icon: any;
    growth?: number;
    subtitle?: string;
    color?: string;
    onClick?: () => void;
  }) => (
    <Card
      className={`group hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/30 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">{title}</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
              {value}
            </p>
            <div className="mt-3 space-y-1">
              {growth !== undefined && <GrowthBadge value={growth} />}
              {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-${color}/10 group-hover:bg-${color}/20 transition-colors`}>
            <Icon className={`h-6 w-6 text-${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading && !kpiData && activeTab === 'overview') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
          <p className="text-slate-600">{t('msg.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card className="bg-white/95 backdrop-blur-sm shadow-xl border-slate-200">
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-md">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{t('dashboard.reports')}</h2>
                <p className="text-sm text-slate-600">Real-time performance insights</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {user?.role === 'ADMIN' && (
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <Store className="h-4 w-4 mr-2 text-primary" />
                    <SelectValue placeholder={t('branch.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('branch.all')}</SelectItem>
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
                  <Calendar className="h-4 w-4 mr-2 text-primary" />
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
                variant="outline"
                size="icon"
                onClick={() => activeTab === 'overview' ? fetchKPIs() : fetchOrders()}
                disabled={loading}
              >
                <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white dark:bg-slate-800 overflow-x-auto">
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            {t('dashboard.reports')}
          </TabsTrigger>
          <TabsTrigger value="sales">
            <ShoppingCart className="h-4 w-4 mr-2" />
            {t('reports.sales')}
          </TabsTrigger>
          <TabsTrigger value="daily">
            <Calendar className="h-4 w-4 mr-2" />
            {t('shifts.history')}
          </TabsTrigger>
          <TabsTrigger value="products">
            <Package className="h-4 w-4 mr-2" />
            {t('dashboard.menu')}
          </TabsTrigger>
          <TabsTrigger value="customers">
            <Users className="h-4 w-4 mr-2" />
            {t('customers.title')}
          </TabsTrigger>
          <TabsTrigger value="staff">
            <Users className="h-4 w-4 mr-2" />
            {t('users.title')}
          </TabsTrigger>
          <TabsTrigger value="discounts">
            <Tag className="h-4 w-4 mr-2" />
            {t('pos.discount')}
          </TabsTrigger>
          {user?.role === 'ADMIN' && (
            <TabsTrigger value="branches">
              <Store className="h-4 w-4 mr-2" />
              {t('dashboard.branches')}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* KPI Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title={t('analytics.total.revenue')}
              value={formatCurrency(kpiData?.revenue.total || 0, currency)}
              icon={DollarSign}
              growth={kpiData?.revenue.growth}
              subtitle={
                <div className="flex items-center gap-1">
                  <span>Product Cost: {formatCurrency(kpiData?.revenue.productCost || 0, currency)} | Net: {formatCurrency(kpiData?.revenue.net || 0, currency)}</span>
                  <Eye className="h-3 w-3 text-primary" />
                </div>
              }
              color="emerald"
              onClick={handleOpenDetailedReport}
            />
            <KPICard
              title={t('reports.total.orders')}
              value={(kpiData?.orders.total || 0).toString()}
              icon={ShoppingCart}
              growth={kpiData?.orders.growth}
              subtitle={`${kpiData?.orders.items || 0} ${t('reports.items.sold')}`}
              color="blue"
            />
            <KPICard
              title={t('reports.avg.order')}
              value={formatCurrency(kpiData?.orders.avgValue || 0, currency)}
              icon={Target}
              growth={kpiData?.orders.avgValueGrowth}
              subtitle={t('reports.per.transaction')}
              color="purple"
            />
            <KPICard
              title="Refund Rate"
              value={`${(kpiData?.refunds.rate || 0).toFixed(1)}%`}
              icon={AlertCircle}
              subtitle={`${kpiData?.refunds.count || 0} ${t('order.refund')} ${t('orders')}`}
              color="red"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hourly Sales Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  {t('analytics.hourly')}
                </CardTitle>
                <CardDescription>
                  Peak hour: {formatHour(kpiData?.peakHour.hour || 0)} ({formatCurrency(kpiData?.peakHour.revenue || 0, currency)})
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={kpiData?.hourlySales || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" tickFormatter={formatHour} />
                      <YAxis tickFormatter={(value) => formatCurrency(value, currency)} />
                      <Tooltip
                        formatter={(value: any) => [formatCurrency(value, currency), 'Revenue']}
                        labelFormatter={formatHour}
                      />
                      <Bar dataKey="revenue" fill="url(#colorGradient)" radius={[4, 4, 0, 0]} />
                      <defs>
                        <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.3}/>
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Order Type Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-primary" />
                  {t('analytics.hourly.distribution')}
                </CardTitle>
                <CardDescription>Revenue breakdown by order type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={[
                          { name: 'Dine-In', value: kpiData?.orderTypes.dineIn.revenue || 0, orders: kpiData?.orderTypes.dineIn.count || 0 },
                          { name: 'Take-Away', value: kpiData?.orderTypes.takeAway.revenue || 0, orders: kpiData?.orderTypes.takeAway.count || 0 },
                          { name: 'Delivery', value: kpiData?.orderTypes.delivery.revenue || 0, orders: kpiData?.orderTypes.delivery.count || 0 },
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#3b82f6" />
                      </Pie>
                      <Tooltip formatter={(value: any) => [formatCurrency(value, currency), 'Revenue']} />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                {/* Order Type Stats */}
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                    <Utensils className="h-5 w-5 text-emerald-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-600">{t('pos.order-type.dine-in')}</p>
                    <p className="font-bold text-emerald-700">{kpiData?.orderTypes.dineIn.count || 0}</p>
                  </div>
                  <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                    <ShoppingCart className="h-5 w-5 text-amber-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-600">{t('pos.order-type.take-away')}</p>
                    <p className="font-bold text-amber-700">{kpiData?.orderTypes.takeAway.count || 0}</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                    <Truck className="h-5 w-5 text-blue-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-600">{t('pos.order-type.delivery')}</p>
                    <p className="font-bold text-blue-700">{kpiData?.orderTypes.delivery.count || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Categories */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coffee className="h-5 w-5 text-primary" />
                  {t('analytics.top.products')}
                </CardTitle>
                <CardDescription>Revenue by product category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!kpiData?.topCategories || kpiData.topCategories.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Coffee className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No category data available for the selected period</p>
                    </div>
                  ) : (
                    kpiData.topCategories.map((category, index) => (
                      <div key={category.category} className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-slate-900 dark:text-white">{category.category}</span>
                            <span className="font-bold text-primary">{formatCurrency(category.revenue, currency)}</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all duration-500"
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

            {/* Payment Methods */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  {t('order.payment')}
                </CardTitle>
                <CardDescription>Transaction breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!kpiData?.paymentMethods || Object.keys(kpiData.paymentMethods).length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No payment data available for the selected period</p>
                    </div>
                  ) : (
                    Object.entries(kpiData.paymentMethods).map(([method, data]: [string, any]) => {
                      const count = typeof data === 'object' ? data.count : data;
                      const revenue = typeof data === 'object' ? data.revenue : 0;
                      if (typeof data !== 'object' || count === 0) return null;

                      let Icon = Wallet;
                      let iconColor = 'text-slate-600 dark:text-slate-400';
                      const methodLower = method.toLowerCase();

                      if (methodLower === 'card') {
                        Icon = CreditCard;
                        iconColor = 'text-blue-600 dark:text-blue-400';
                      } else if (methodLower === 'instapay') {
                        Icon = Smartphone;
                        iconColor = 'text-purple-600 dark:text-purple-400';
                      } else if (methodLower === 'wallet' || methodLower === 'mobile_wallet') {
                        Icon = Wallet;
                        iconColor = 'text-orange-600 dark:text-orange-400';
                      } else if (methodLower === 'cash') {
                        Icon = DollarSign;
                        iconColor = 'text-green-600 dark:text-green-400';
                      }

                      return (
                        <div key={method} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Icon className={`h-5 w-5 ${iconColor}`} />
                            <div>
                              <p className="font-medium capitalize text-slate-900 dark:text-white">
                                {methodLower === 'mobile_wallet' ? 'Mobile Wallet' : method}
                              </p>
                              <p className="text-xs text-slate-500">{count} {t('shifts.orders')}</p>
                            </div>
                          </div>
                          <p className="font-bold text-primary">{formatCurrency(revenue, currency)}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Export Actions */}
          <Card className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950/20 dark:to-blue-950/20 border-emerald-200 dark:border-emerald-800">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{t('btn.export')} {t('dashboard.reports')}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Download detailed reports in Excel format</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-emerald-200 dark:border-emerald-800">
                  <div>
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('form.date')} {t('from')}</Label>
                    <Input
                      type="date"
                      value={exportStartDate}
                      onChange={(e) => setExportStartDate(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('form.date')} {t('to')}</Label>
                    <Input
                      type="date"
                      value={exportEndDate}
                      onChange={(e) => setExportEndDate(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="md:col-span-2 flex items-end">
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={handleExport}
                      disabled={!exportStartDate || !exportEndDate}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t('btn.export')} Excel
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select a date range to export orders. Both dates are required.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sales & Refunds Tab */}
        <TabsContent value="sales" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                {t('reports.sales')}
              </CardTitle>
              <CardDescription>View and manage orders, process refunds</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-96">
                  <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : (
                <>
                <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
                  <div className="min-w-[800px] md:min-w-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('order.number')}</TableHead>
                        <TableHead>{t('form.datetime')}</TableHead>
                        <TableHead>{t('form.type')}</TableHead>
                        <TableHead>{t('order.payment')}</TableHead>
                        <TableHead>{t('order.subtotal')}</TableHead>
                        <TableHead>{t('order.delivery.fee')}</TableHead>
                        <TableHead>{t('pos.discount')}</TableHead>
                        <TableHead>{t('order.total')}</TableHead>
                        <TableHead>{t('order.cashier')}</TableHead>
                        <TableHead>{t('dashboard.branches')}</TableHead>
                        <TableHead>{t('status')}</TableHead>
                        <TableHead className="text-right">{t('actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => {
                        // Calculate discount: subtotal + deliveryFee - totalAmount
                        const discount = Math.max(0, order.subtotal + (order.deliveryFee || 0) - order.totalAmount);

                        return (
                          <TableRow key={order.id} className={order.isRefunded ? 'opacity-50' : ''}>
                            <TableCell className="font-medium">#{order.orderNumber}</TableCell>
                            <TableCell>
                              {new Date(order.orderTimestamp).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {order.orderType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={order.paymentMethod === 'card' ? 'default' : 'secondary'}>
                                {order.paymentMethod === 'cash' ? t('pos.cash') : 
                                 order.paymentMethodDetail === 'INSTAPAY' ? 'InstaPay' :
                                 order.paymentMethodDetail === 'MOBILE_WALLET' ? 'Mobile Wallet' :
                                 t('pos.card')}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold">
                              {formatCurrency(order.subtotal, currency)}
                            </TableCell>
                            <TableCell>
                              {order.deliveryFee > 0 ? (
                                <Badge variant="outline" className="text-amber-600">
                                  {formatCurrency(order.deliveryFee, currency)}
                                </Badge>
                              ) : (
                                <span className="text-slate-400">-</span>
                            )}
                            </TableCell>
                            <TableCell>
                              {discount > 0 ? (
                                <Badge variant="outline" className="text-purple-600">
                                  -{formatCurrency(discount, currency)}
                                </Badge>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </TableCell>
                            <TableCell className="font-bold">
                              {formatCurrency(order.totalAmount, currency)}
                            </TableCell>
                            <TableCell>{order.cashier?.name || 'Unknown'}</TableCell>
                            <TableCell>{order.branch?.branchName || 'Unknown'}</TableCell>
                            <TableCell>
                              {order.isRefunded ? (
                                <Badge variant="destructive">{t('order.refund')}</Badge>
                              ) : (
                                <Badge className="bg-emerald-600">{t('msg.saved.successfully')}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setOrderDialogOpen(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {orders.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                            {t('empty.no.orders')}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  </div>
                </div>
                {/* Pagination */}
                {totalOrders > 0 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {t('table.showing')} {((currentPage - 1) * ordersPerPage) + 1} {t('table.to')} {Math.min(currentPage * ordersPerPage, totalOrders)} {t('table.of')} {totalOrders} {t('orders')}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        {t('pagination.previous')}
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, Math.ceil(totalOrders / ordersPerPage)) }, (_, i) => {
                          let pageNum;
                          const totalPages = Math.ceil(totalOrders / ordersPerPage);
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                              className="w-10 h-10 p-0"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalOrders / ordersPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(totalOrders / ordersPerPage)}
                      >
                        {t('pagination.next')}
                      </Button>
                    </div>
                  </div>
                )}
                </>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Daily Reports Tab */}
        <TabsContent value="daily">
          <DailyReportsTab />
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products">
          <ProductPerformanceReport />
        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers">
          <CustomerAnalyticsReport />
        </TabsContent>

        {/* Staff Tab */}
        <TabsContent value="staff">
          <StaffPerformanceReport />
        </TabsContent>

        {/* Discounts Tab */}
        <TabsContent value="discounts">
          <DiscountsTracking />
        </TabsContent>

        {/* Branches Tab (Admin Only) */}
        {user?.role === 'ADMIN' && (
          <TabsContent value="branches">
            <BranchComparisonReport />
          </TabsContent>
        )}
      </Tabs>

      {/* Order Detail Dialog */}
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('order.details')} #{selectedOrder?.orderNumber}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-500">{t('form.datetime')}</Label>
                  <p className="font-semibold">{new Date(selectedOrder.orderTimestamp).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-slate-500">{t('order.type')}</Label>
                  <p className="font-semibold capitalize">{selectedOrder.orderType}</p>
                </div>
                <div>
                  <Label className="text-slate-500">{t('order.payment')}</Label>
                  <p className="font-semibold capitalize">{selectedOrder.paymentMethod}</p>
                </div>
                <div>
                  <Label className="text-slate-500">{t('order.subtotal')}</Label>
                  <p className="font-semibold text-lg">
                    {formatCurrency(selectedOrder.subtotal, currency)}
                  </p>
                </div>
                {selectedOrder.deliveryFee > 0 && (
                  <div>
                    <Label className="text-slate-500">{t('order.delivery.fee')}</Label>
                    <p className="font-semibold text-lg text-amber-600">
                      {formatCurrency(selectedOrder.deliveryFee, currency)}
                    </p>
                  </div>
                )}
                <div>
                  <Label className="text-slate-500">{t('pos.discount')}</Label>
                  <p className="font-semibold text-lg text-purple-600">
                    {formatCurrency(Math.max(0, selectedOrder.subtotal + (selectedOrder.deliveryFee || 0) - selectedOrder.totalAmount), currency)}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500">{t('order.total')} ({t('pos.cash')})</Label>
                  <p className="font-bold text-xl text-emerald-600">
                    {formatCurrency(selectedOrder.totalAmount, currency)}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500">{t('order.cashier')}</Label>
                  <p className="font-semibold">{selectedOrder.cashier?.name || 'Unknown'}</p>
                </div>
                <div>
                  <Label className="text-slate-500">{t('dashboard.branches')}</Label>
                  <p className="font-semibold">{selectedOrder.branch?.branchName || 'Unknown'}</p>
                </div>
              </div>

              <div>
                <Label className="text-slate-500 mb-2 block">{t('order.items')}</Label>
                <div className="border rounded-lg divide-y">
                  {selectedOrder.items.map((item, index: number) => (
                    <div key={index} className="p-3 flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">{item.menuItem?.name || item.itemName}</p>
                        <p className="text-sm text-slate-500">{t('form.quantity')}: {item.quantity} × {formatCurrency(item.unitPrice, currency)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">
                          {formatCurrency(item.quantity * item.unitPrice, currency)}
                        </p>
                        {!selectedOrder.isRefunded && item.quantity > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openVoidDialog(item)}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedOrder.isRefunded && (
                <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-lg">
                  <p className="font-semibold text-red-700 dark:text-red-300">{t('order.refund')}</p>
                  {selectedOrder.refundReason && (
                    <p className="text-sm text-slate-600 mt-1">{t('form.reason')}: {selectedOrder.refundReason}</p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    setDuplicateReceiptOrder(selectedOrder);
                    setOrderDialogOpen(false);
                  }}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {t('receipt.print')}
                </Button>

                {!selectedOrder.isRefunded && (
                  <Button
                    className="w-full bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      setOrderDialogOpen(false);
                      setRefundDialogOpen(true);
                    }}
                  >
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {t('order.refund')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('order.refund')}</DialogTitle>
            <DialogDescription>
              {t('order.refund')} order #{selectedOrder?.orderNumber} for {formatCurrency(selectedOrder?.totalAmount || 0, currency)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="username">{t('username')}</Label>
              <Input
                id="username"
                value={refundUsername}
                onChange={(e) => setRefundUsername(e.target.value)}
                placeholder={t('auth.username')}
              />
            </div>
            <div>
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                value={refundPassword}
                onChange={(e) => setRefundPassword(e.target.value)}
                placeholder={t('auth.password')}
              />
            </div>
            <div>
              <Label htmlFor="reason">{t('form.reason')} {t('order.refund')}</Label>
              <Input
                id="reason"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder={t('form.reason')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={handleRefund}
              disabled={isRefunding || !refundUsername || !refundPassword || !refundReason}
            >
              {isRefunding ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Confirm Refund
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Item Dialog */}
      <Dialog open={voidItemDialogOpen} onOpenChange={setVoidItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pos.void.item')}</DialogTitle>
            <DialogDescription>
              {t('btn.void')} {voidQuantity} x {selectedVoidItem?.menuItem?.name || selectedVoidItem?.itemName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="void-quantity">{t('form.quantity')} {t('to')} {t('pos.void')}</Label>
              <Input
                id="void-quantity"
                type="number"
                min="1"
                max={selectedVoidItem?.quantity || 1}
                value={voidQuantity}
                onChange={(e) => setVoidQuantity(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-slate-500 mt-1">
                {t('form.available')}: {selectedVoidItem?.quantity || 0}
              </p>
            </div>
            <div>
              <Label htmlFor="void-username">{t('username')}</Label>
              <Input
                id="void-username"
                value={voidUsername}
                onChange={(e) => setVoidUsername(e.target.value)}
                placeholder={t('auth.username')}
              />
            </div>
            <div>
              <Label htmlFor="void-password">{t('password')}</Label>
              <Input
                id="void-password"
                type="password"
                value={voidPassword}
                onChange={(e) => setVoidPassword(e.target.value)}
                placeholder={t('auth.password')}
              />
            </div>
            <div>
              <Label htmlFor="void-reason">{t('form.reason')} {t('pos.void')}</Label>
              <Input
                id="void-reason"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder={t('form.reason')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidItemDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            {isVoiding ? (
              <>
                <Button disabled>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t('msg.processing')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="bg-red-600 hover:bg-red-700"
                  onClick={handleVoidItem}
                  disabled={!voidUsername || !voidPassword || !voidReason || voidQuantity <= 0}
                >
                  {t('btn.void')} {t('pos.item')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Receipt Dialog */}
      <ReceiptViewer
        open={!!duplicateReceiptOrder}
        onClose={() => setDuplicateReceiptOrder(null)}
        order={duplicateReceiptOrder}
        isDuplicate={true}
      />

      {/* Detailed Revenue Report Dialog */}
      <Dialog open={detailedReportOpen} onOpenChange={setDetailedReportOpen}>
        <DialogContent className="w-[95vw] h-[90vh] max-w-[1600px] overflow-hidden flex flex-col p-0">
          {/* Fixed Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold text-white p-0">
                    Detailed Revenue Report
                  </DialogTitle>
                  <DialogDescription className="text-emerald-50">
                    View detailed breakdown of all orders with product costs and profit analysis
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDetailedReportOpen(false)}
                className="text-white hover:bg-white/20"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950">

          {detailedReportLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin h-12 w-12 border-4 border-white border-t-transparent rounded-full"></div>
                <p className="text-slate-500 text-lg font-medium">Loading detailed report...</p>
              </div>
            </div>
          ) : detailedOrders.length === 0 ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <FileText className="h-16 w-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500 text-lg">No orders found for the selected period</p>
                <p className="text-slate-400 text-sm mt-2">Try selecting a different time range or branch</p>
              </div>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-5 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                      <DollarSign className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(detailedOrders.reduce((sum, order) => sum + order.subtotal, 0), currency)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Revenue</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {detailedOrders.length} orders
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-5 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
                      <Package className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <span className="text-3xl font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(detailedOrders.reduce((sum, order) => sum + order.totalProductCost, 0), currency)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Product Cost</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {detailedOrders.reduce((sum, order) => sum + order.subtotal, 0) > 0
                      ? `${((detailedOrders.reduce((sum, order) => sum + order.totalProductCost, 0) / detailedOrders.reduce((sum, order) => sum + order.subtotal, 0) * 100).toFixed(1)}% of revenue`
                      : 'N/A'}
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-5 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                      <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(detailedOrders.reduce((sum, order) => sum + order.totalProfit, 0), currency)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Profit</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Net revenue after costs
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-5 hover:shadow-xl transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                      <BarChart3 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                      {(
                        detailedOrders.reduce((sum, order) => sum + order.totalProfit, 0) /
                        detailedOrders.reduce((sum, order) => sum + order.subtotal, 0) * 100
                      ).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Profit Margin</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {detailedOrders.reduce((sum, order) => sum + order.totalProfit, 0) >= 0 ? 'Profitable' : 'Loss'}
                  </p>
                </div>
              </div>

              {/* Export Button */}
              <div className="flex justify-end mb-6">
                <Button
                  onClick={handleExportDetailedReport}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all px-6"
                  size="lg"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Export Detailed Report (Excel)
                </Button>
              </div>

              {/* Orders Table */}
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                <ScrollArea className="h-[calc(90vh-380px)]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800">
                        <TableHead className="font-semibold">Order #</TableHead>
                        <TableHead className="font-semibold">Date/Time</TableHead>
                        <TableHead className="font-semibold">Cashier</TableHead>
                        <TableHead className="font-semibold">Items</TableHead>
                        <TableHead className="font-semibold text-right">Revenue</TableHead>
                        <TableHead className="font-semibold text-right">Product Cost</TableHead>
                        <TableHead className="font-semibold text-right">Profit</TableHead>
                        <TableHead className="font-semibold text-right">Margin %</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold">Payment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailedOrders.map((order, orderIndex) => (
                        <TableRow
                          key={order.id}
                          className={`
                            hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors
                            ${orderIndex % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-800/30'}
                          `}
                        >
                          <TableCell className="font-mono font-medium">
                            <span className="text-slate-500">#</span>
                            {order.orderNumber}
                            {order.isRefunded && (
                              <Badge variant="destructive" className="ml-2">Refunded</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{new Date(order.orderTimestamp).toLocaleDateString()}</div>
                              <div className="text-slate-500 text-xs">
                                {new Date(order.orderTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs">
                                {order.cashier?.name?.charAt(0) || '?'}
                              </div>
                              <span className="text-sm">{order.cashier?.name || 'N/A'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1.5 max-w-md">
                              {order.items.map((item: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-primary/30 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm text-slate-900 dark:text-white">
                                        {item.itemName}
                                      </div>
                                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                        <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                                          {item.quantity} × {formatCurrency(item.unitPrice, currency)}
                                        </span>
                                        {item.variantName && (
                                          <Badge variant="secondary" className="text-xs">
                                            {item.variantName}
                                          </Badge>
                                        )}
                                        {item.customVariantValue && (
                                          <Badge variant="outline" className="text-xs">
                                            {item.customVariantValue}x
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-slate-400">Cost:</span>
                                          <span className="text-xs font-medium text-red-600">
                                            {formatCurrency(item.productCost, currency)}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-slate-400">Profit:</span>
                                          <span className={`text-xs font-medium ${item.profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                            {formatCurrency(item.profit, currency)}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-slate-400">Margin:</span>
                                          <span className={`text-xs font-medium ${item.margin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                            {item.margin.toFixed(1)}%
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="font-medium text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(order.subtotal, currency)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="font-medium text-red-600 dark:text-red-400">
                              {formatCurrency(order.totalProductCost, currency)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className={`font-medium ${order.totalProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                              {formatCurrency(order.totalProfit, currency)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-semibold ${order.profitMargin >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                              {order.profitMargin.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline"
                              className={`${
                                order.orderType === 'dine-in' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                order.orderType === 'take-away' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-blue-50 text-blue-700 border-blue-200'
                              }`}
                            >
                              {order.orderType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline"
                              className="capitalize"
                            >
                              {order.paymentMethod}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </>
          )}

          {/* Fixed Footer */}
          <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-500">
                {detailedOrders.length} orders shown
                {detailedOrders.length > 0 && (
                  <span className="ml-4">
                    • Average margin: {(
                      detailedOrders.reduce((sum, order) => sum + order.totalProfit, 0) /
                      detailedOrders.reduce((sum, order) => sum + order.subtotal, 0) * 100
                    ).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDetailedReportOpen(false)}>
                  Close
                </Button>
                {!detailedReportLoading && detailedOrders.length > 0 && (
                  <Button
                    onClick={handleExportDetailedReport}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Excel
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
