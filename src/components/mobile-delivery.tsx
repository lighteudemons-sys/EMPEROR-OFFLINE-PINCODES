'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { useAuth } from '@/lib/auth-context';
import {
  Search,
  Truck,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  MapPin,
  DollarSign,
  Receipt,
  RefreshCw,
  X,
  ChevronRight,
  Navigation,
  Phone,
  Send,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

type DeliveryStatus = 'pending' | 'assigned' | 'out-for-delivery' | 'delivered' | 'cancelled';

interface DeliveryOrder {
  id: string;
  orderNumber: number;
  orderType: string;
  status: DeliveryStatus;
  totalAmount: number;
  deliveryFee: number;
  createdAt: string;
  customer?: {
    name: string;
    phone: string;
  };
  deliveryAddress?: string;
  deliveryArea?: {
    id: string;
    name: string;
  };
  courier?: {
    id: string;
    name: string;
    phone: string;
  };
  courierId?: string;
  items: DeliveryOrderItem[];
  paymentMethod: string;
  notes?: string;
  eta?: string;
}

interface DeliveryOrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface Courier {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
}

export function MobileDelivery() {
  const { currency, t } = useI18n();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [assignCourierOpen, setAssignCourierOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const fetchOrders = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);

      // For admin, use selectedBranch; for others, use user's branch
      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;

      // Fetch orders from API first
      let allOrders: any[] = [];
      try {
        const params = new URLSearchParams();
        if (branchId) params.append('branchId', branchId);
        params.append('orderType', 'delivery');

        const response = await fetch(`/api/orders?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          allOrders = data.orders || [];
        }
      } catch (error) {
        console.log('Failed to fetch orders from API, using IndexedDB');
      }

      // Fallback to IndexedDB if API failed or returned no data
      if (allOrders.length === 0) {
        const storage = getIndexedDBStorage();
        await storage.init();
        let dbOrders = await storage.getAllOrders();

        // Filter by branch and order type
        dbOrders = dbOrders.filter((order: any) => {
          const matchesBranch = !branchId || order.branchId === branchId;
          const matchesType = order.orderType === 'delivery';
          return matchesBranch && matchesType;
        });

        allOrders = dbOrders;
      }

      // Convert to our DeliveryOrder interface
      const convertedOrders: DeliveryOrder[] = allOrders.map((order: any) => ({
        id: order.id,
        orderNumber: order.orderNumber || 0,
        orderType: order.orderType || 'delivery',
        status: mapOrderStatus(order.status),
        totalAmount: order.totalAmount || 0,
        deliveryFee: order.deliveryFee || 0,
        createdAt: order.createdAt || order.orderTimestamp || new Date().toISOString(),
        customer: order.customer || order._offlineData?.customerName ? {
          name: order.customer?.name || order._offlineData?.customerName || 'N/A',
          phone: order.customer?.phone || order._offlineData?.customerPhone || '',
        } : undefined,
        deliveryAddress: order.deliveryAddress || order._offlineData?.deliveryAddress,
        deliveryArea: order.deliveryArea ? {
          id: order.deliveryArea.id,
          name: order.deliveryArea.name,
        } : undefined,
        courier: order.courier ? {
          id: order.courier.id,
          name: order.courier.name,
          phone: order.courier.phone || '',
        } : undefined,
        courierId: order.courierId,
        items: (order.items || []).map((item: any) => ({
          id: item.id,
          name: item.itemName || item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice || item.price,
          subtotal: item.subtotal || (item.quantity * (item.unitPrice || item.price)),
        })),
        paymentMethod: order.paymentMethod || 'cash',
        notes: order.notes,
        eta: order.eta,
      }));

      setOrders(convertedOrders);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching delivery orders:', error);
      showErrorToast('Error', 'Failed to load delivery orders');
      setLoading(false);
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  };

  const mapOrderStatus = (status: string): DeliveryStatus => {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'preparing':
      case 'ready':
        return 'pending';
      case 'assigned':
        return 'assigned';
      case 'out-for-delivery':
        return 'out-for-delivery';
      case 'completed':
        return 'delivered';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'pending';
    }
  };

  const fetchCouriers = async () => {
    try {
      const response = await fetch('/api/couriers');
      const data = await response.json();
      if (response.ok && data.couriers) {
        setCouriers(data.couriers.filter((c: Courier) => c.isActive));
      }
    } catch (error) {
      console.error('Failed to fetch couriers:', error);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchCouriers();
  }, []);

  // Refetch orders when branch changes (for admin)
  useEffect(() => {
    if (selectedBranch && user?.role === 'ADMIN') {
      fetchOrders();
    }
  }, [selectedBranch, user?.role]);

  const handleRefresh = () => {
    fetchOrders(true);
    fetchCouriers();
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.orderNumber.toString().includes(searchQuery) ||
      (order.customer?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.deliveryAddress || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter !== 'all' && order.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const getStatusIcon = (status: DeliveryStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-600" />;
      case 'assigned':
        return <User className="w-4 h-4 text-blue-600" />;
      case 'out-for-delivery':
        return <Navigation className="w-4 h-4 text-purple-600" />;
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-emerald-600" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const getStatusBadge = (status: DeliveryStatus) => {
    const variants: Record<DeliveryStatus, any> = {
      pending: 'bg-amber-100 text-amber-800',
      assigned: 'bg-blue-100 text-blue-800',
      'out-for-delivery': 'bg-purple-100 text-purple-800',
      delivered: 'bg-emerald-100 text-emerald-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    const labels: Record<DeliveryStatus, string> = {
      pending: 'Pending',
      assigned: 'Assigned',
      'out-for-delivery': 'Out for Delivery',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
    };
    return { className: variants[status] || 'bg-slate-100 text-slate-800', label: labels[status] || status };
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleStatusChange = async (orderId: string, newStatus: DeliveryStatus) => {
    try {
      setUpdatingStatus(orderId);

      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus === 'delivered' ? 'completed' : newStatus }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', `Order status updated to ${newStatus.replace('-', ' ')}`);
        await fetchOrders();
      } else {
        showErrorToast('Error', data.error || 'Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      showErrorToast('Error', 'Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleAssignCourier = async () => {
    if (!selectedOrder || !selectedCourierId) return;

    try {
      const response = await fetch(`/api/orders/${selectedOrder.id}/assign-courier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courierId: selectedCourierId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', 'Courier assigned successfully');
        setAssignCourierOpen(false);
        setSelectedCourierId('');
        await fetchOrders();
      } else {
        showErrorToast('Error', data.error || 'Failed to assign courier');
      }
    } catch (error) {
      console.error('Error assigning courier:', error);
      showErrorToast('Error', 'Failed to assign courier');
    }
  };

  const handleOpenAssignCourier = (order: DeliveryOrder) => {
    setSelectedOrder(order);
    setSelectedCourierId(order.courierId || '');
    setAssignCourierOpen(true);
  };

  const handleCallCourier = (courier: Courier) => {
    if (courier.phone) {
      window.location.href = `tel:${courier.phone}`;
    } else {
      showErrorToast('Error', 'Courier phone number not available');
    }
  };

  const handleCallCustomer = (phone: string) => {
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 flex-1" />
        </div>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6 sticky top-0 z-40">
        {/* Branch Selector for Admins */}
        <MobileBranchSelector
          className="mb-3"
          onBranchChange={setSelectedBranch}
        />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
              <Truck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Delivery</h1>
              <p className="text-emerald-100 text-sm">
                {orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length} active
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-white hover:bg-white/10"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60" />
          <Input
            type="text"
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 text-base bg-white/10 border-white/20 text-white placeholder:text-white/60"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            All
          </button>
          {(['pending', 'assigned', 'out-for-delivery', 'delivered', 'cancelled'] as DeliveryStatus[]).map((status) => {
            const { label } = getStatusBadge(status);
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === status
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders List */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="p-4 space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Truck className="w-16 h-16 mb-4 text-slate-300" />
              <p className="font-medium">No delivery orders found</p>
              <p className="text-sm">Try a different search or filter</p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const { className: statusClass, label: statusLabel } = getStatusBadge(order.status);
              return (
                <Card
                  key={order.id}
                  className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    setSelectedOrder(order);
                    setOrderDetailOpen(true);
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900">Order #{order.orderNumber}</h3>
                          <Badge className={statusClass}>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(order.status)}
                              <span className="capitalize text-xs">{statusLabel}</span>
                            </div>
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500">{formatTime(order.createdAt)}</p>
                      </div>
                    </div>

                    {/* Customer */}
                    {order.customer && (
                      <div className="flex items-center gap-2 text-sm text-slate-700 mb-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="font-medium">{order.customer.name}</span>
                        {order.customer.phone && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCallCustomer(order.customer!.phone);
                            }}
                            className="p-1 hover:bg-slate-100 rounded"
                          >
                            <Phone className="w-3 h-3 text-emerald-600" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Address */}
                    {order.deliveryAddress && (
                      <div className="flex items-start gap-2 text-sm text-slate-600 mb-2">
                        <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{order.deliveryAddress}</span>
                      </div>
                    )}

                    {/* Courier Info */}
                    {order.courier && (
                      <div className="flex items-center gap-2 text-sm text-slate-700 mb-2">
                        <User className="w-4 h-4 text-blue-500" />
                        <span className="font-medium">{order.courier.name}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCallCourier(order.courier!);
                          }}
                          className="p-1 hover:bg-slate-100 rounded"
                        >
                          <Phone className="w-3 h-3 text-blue-600" />
                        </button>
                      </div>
                    )}

                    {/* Delivery Area */}
                    {order.deliveryArea && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
                        <MapPin className="w-3 h-3" />
                        <span>{order.deliveryArea.name}</span>
                      </div>
                    )}

                    {/* Items Preview */}
                    <div className="text-sm text-slate-600 mb-3 line-clamp-2">
                      {order.items.slice(0, 2).map((item, i) => (
                        <span key={item.id}>
                          {item.name} x{item.quantity}
                          {i < Math.min(1, order.items.length - 1) && ', '}
                        </span>
                      ))}
                      {order.items.length > 2 && ` +${order.items.length - 2} more`}
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-lg font-bold text-emerald-600">
                          {formatCurrency(order.totalAmount)}
                        </span>
                        {order.deliveryFee > 0 && (
                          <span className="text-xs text-slate-500 ml-2">
                            +{formatCurrency(order.deliveryFee)} delivery
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Order Detail Sheet */}
      <Sheet open={orderDetailOpen} onOpenChange={setOrderDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {selectedOrder && (
            <>
              <SheetHeader className="px-6 pt-6">
                <div className="flex items-center justify-between">
                  <SheetTitle>Order #{selectedOrder.orderNumber}</SheetTitle>
                  <div className="flex gap-2">
                    {selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAssignCourier(selectedOrder)}
                      >
                        <User className="w-4 h-4 mr-1" />
                        Assign Courier
                      </Button>
                    )}
                  </div>
                </div>
              </SheetHeader>

              <ScrollArea className="h-[calc(100vh-180px)] px-6 py-4">
                <div className="space-y-6">
                  {/* Status Actions */}
                  {selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Update Status</h4>
                      <Card>
                        <CardContent className="p-3 space-y-2">
                          {selectedOrder.status === 'pending' && (
                            <Button
                              className="w-full justify-start h-12 min-h-[44px]"
                              variant="outline"
                              onClick={() => handleStatusChange(selectedOrder.id, 'assigned')}
                              disabled={updatingStatus === selectedOrder.id}
                            >
                              <User className="w-4 h-4 mr-2" />
                              Mark as Assigned
                            </Button>
                          )}
                          {selectedOrder.status === 'assigned' && (
                            <Button
                              className="w-full justify-start h-12 min-h-[44px]"
                              variant="outline"
                              onClick={() => handleStatusChange(selectedOrder.id, 'out-for-delivery')}
                              disabled={updatingStatus === selectedOrder.id}
                            >
                              <Navigation className="w-4 h-4 mr-2" />
                              Mark as Out for Delivery
                            </Button>
                          )}
                          {selectedOrder.status === 'out-for-delivery' && (
                            <Button
                              className="w-full justify-start h-12 min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => handleStatusChange(selectedOrder.id, 'delivered')}
                              disabled={updatingStatus === selectedOrder.id}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Mark as Delivered
                            </Button>
                          )}
                          <Button
                            className="w-full justify-start h-12 min-h-[44px]"
                            variant="outline"
                            onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')}
                            disabled={updatingStatus === selectedOrder.id}
                          >
                            <XCircle className="w-4 h-4 mr-2 text-red-600" />
                            Cancel Order
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Order Info */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Order Information</h4>
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Status</span>
                          <Badge className={getStatusBadge(selectedOrder.status).className}>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(selectedOrder.status)}
                              <span className="capitalize text-xs">
                                {getStatusBadge(selectedOrder.status).label}
                              </span>
                            </div>
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Time</span>
                          <span className="font-medium text-sm">
                            {new Date(selectedOrder.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Payment</span>
                          <span className="font-medium capitalize text-sm">{selectedOrder.paymentMethod}</span>
                        </div>
                        {selectedOrder.eta && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">ETA</span>
                            <span className="font-medium text-sm">{selectedOrder.eta}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Customer Info */}
                  {selectedOrder.customer && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Customer</h4>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                              <User className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900">{selectedOrder.customer.name}</p>
                              <p className="text-sm text-slate-600">{selectedOrder.customer.phone}</p>
                            </div>
                            {selectedOrder.customer.phone && (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleCallCustomer(selectedOrder.customer!.phone)}
                              >
                                <Phone className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Delivery Info */}
                  {selectedOrder.deliveryAddress && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Delivery Address</h4>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-slate-700">{selectedOrder.deliveryAddress}</p>
                          </div>
                          {selectedOrder.deliveryArea && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <p className="text-sm text-slate-600">
                                Area: <span className="font-medium">{selectedOrder.deliveryArea.name}</span>
                              </p>
                            </div>
                          )}
                          {selectedOrder.deliveryFee > 0 && (
                            <div className="mt-2">
                              <p className="text-sm text-slate-600">
                                Delivery Fee: <span className="font-medium text-emerald-600">
                                  {formatCurrency(selectedOrder.deliveryFee)}
                                </span>
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Courier Info */}
                  {selectedOrder.courier && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Assigned Courier</h4>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900">{selectedOrder.courier.name}</p>
                              {selectedOrder.courier.phone && (
                                <p className="text-sm text-slate-600">{selectedOrder.courier.phone}</p>
                              )}
                            </div>
                            {selectedOrder.courier.phone && (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleCallCourier(selectedOrder.courier!)}
                              >
                                <Phone className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Items */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Items ({selectedOrder.items.length})</h4>
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        {selectedOrder.items.map((item) => (
                          <div key={item.id} className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium text-slate-900">{item.name}</p>
                              <p className="text-sm text-slate-600">Qty: {item.quantity}</p>
                            </div>
                            <span className="font-semibold text-slate-900">
                              {formatCurrency(item.subtotal)}
                            </span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Notes */}
                  {selectedOrder.notes && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Notes</h4>
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-sm text-slate-700">{selectedOrder.notes}</p>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Total */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Payment Summary</h4>
                    <Card>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Subtotal</span>
                          <span className="font-medium">
                            {formatCurrency(selectedOrder.totalAmount - selectedOrder.deliveryFee)}
                          </span>
                        </div>
                        {selectedOrder.deliveryFee > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Delivery Fee</span>
                            <span className="font-medium">
                              {formatCurrency(selectedOrder.deliveryFee)}
                            </span>
                          </div>
                        )}
                        <Separator />
                        <div className="flex justify-between text-lg font-bold">
                          <span>Total</span>
                          <span className="text-emerald-600">{formatCurrency(selectedOrder.totalAmount)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </ScrollArea>

              {/* Action Buttons */}
              {selectedOrder.courier && selectedOrder.courier.phone && (
                <div className="border-t border-slate-200 p-4 bg-white">
                  <Button
                    size="lg"
                    className="w-full h-12 min-h-[44px]"
                    onClick={() => handleCallCourier(selectedOrder.courier!)}
                  >
                    <Phone className="w-5 h-5 mr-2" />
                    Call Courier
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Assign Courier Dialog */}
      <Dialog open={assignCourierOpen} onOpenChange={setAssignCourierOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Courier</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600 mb-4">
              Select a courier for Order #{selectedOrder?.orderNumber}
            </p>
            {couriers.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No active couriers available</p>
            ) : (
              <Select value={selectedCourierId} onValueChange={setSelectedCourierId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select a courier" />
                </SelectTrigger>
                <SelectContent>
                  {couriers.map((courier) => (
                    <SelectItem key={courier.id} value={courier.id}>
                      {courier.name} {courier.phone && `(${courier.phone})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAssignCourierOpen(false);
                setSelectedCourierId('');
              }}
              className="w-full sm:w-auto h-11 min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAssignCourier}
              disabled={!selectedCourierId}
              className="w-full sm:w-auto h-11 min-h-[44px]"
            >
              Assign Courier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
