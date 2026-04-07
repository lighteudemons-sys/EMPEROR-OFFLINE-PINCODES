'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { useAuth } from '@/lib/auth-context';
import {
  Search,
  Filter,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Printer,
  X,
  ChevronRight,
  Utensils,
  Package,
  MapPin,
  User,
  DollarSign,
  Receipt,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
type OrderType = 'dine-in' | 'take-away' | 'delivery';

interface Order {
  id: string;
  orderNumber: number;
  orderType: OrderType;
  status: OrderStatus;
  totalAmount: number;
  taxAmount?: number;
  createdAt: string;
  customer?: {
    name: string;
    phone: string;
  };
  deliveryAddress?: string;
  courier?: string;
  items: OrderItem[];
  paymentMethod: string;
  notes?: string;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export function MobileOrders() {
  const { currency, t } = useI18n();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'all'>('today');
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  const fetchOrders = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);

      // For admin, use selectedBranch; for others, use user's branch
      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;

      // Fetch orders from API first
      let allOrders: any[] = [];
      try {
        const url = branchId ? `/api/orders?branchId=${branchId}` : '/api/orders';
        const response = await fetch(url);
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

        // Filter by branch if branchId is specified
        if (branchId) {
          dbOrders = dbOrders.filter((order: any) => order.branchId === branchId);
        }

        allOrders = dbOrders;
      }

      // Convert to our Order interface
      const convertedOrders: Order[] = allOrders.map((order: any) => ({
        id: order.id,
        orderNumber: order.orderNumber || 0,
        orderType: order.orderType || 'take-away',
        status: order.status || 'completed',
        totalAmount: order.totalAmount || 0,
        taxAmount: order.taxAmount || 0,
        createdAt: order.createdAt || order.orderTimestamp || new Date().toISOString(),
        customer: order._offlineData?.customerName ? {
          name: order._offlineData.customerName,
          phone: order._offlineData.customerPhone || '',
        } : undefined,
        deliveryAddress: order._offlineData?.deliveryAddress,
        courier: order._offlineData?.courierId,
        items: (order.items || []).map((item: any) => ({
          id: item.id,
          name: item.itemName || item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice || item.price,
          subtotal: item.subtotal || (item.quantity * (item.unitPrice || item.price)),
        })),
        paymentMethod: order.paymentMethod || 'cash',
        notes: order.notes,
      }));

      setOrders(convertedOrders);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching orders:', error);
      showErrorToast('Error', 'Failed to load orders');
      setLoading(false);
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Refetch orders when branch changes (for admin)
  useEffect(() => {
    if (selectedBranch && user?.role === 'ADMIN') {
      fetchOrders();
    }
  }, [selectedBranch, user?.role]);

  const handleRefresh = () => {
    fetchOrders(true);
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.orderNumber.toString().includes(searchQuery) ||
      (order.customer?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    const now = new Date();
    const orderDate = new Date(order.createdAt);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (activeTab === 'today') {
      return orderDate >= today;
    } else {
      return true;
    }
  });

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-600" />;
      case 'preparing':
        return <AlertCircle className="w-4 h-4 text-blue-600" />;
      case 'ready':
        return <CheckCircle className="w-4 h-4 text-purple-600" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-emerald-600" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const getStatusBadge = (status: OrderStatus) => {
    const variants: Record<OrderStatus, any> = {
      pending: 'bg-amber-100 text-amber-800',
      preparing: 'bg-blue-100 text-blue-800',
      ready: 'bg-purple-100 text-purple-800',
      completed: 'bg-emerald-100 text-emerald-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return variants[status] || 'bg-slate-100 text-slate-800';
  };

  const getOrderTypeIcon = (type: OrderType) => {
    switch (type) {
      case 'dine-in':
        return <Utensils className="w-4 h-4 text-slate-600" />;
      case 'take-away':
        return <Package className="w-4 h-4 text-slate-600" />;
      case 'delivery':
        return <MapPin className="w-4 h-4 text-slate-600" />;
    }
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

  const handlePrintReceipt = (order: Order) => {
    // Trigger print
    showSuccessToast('Printing', 'Receipt sent to printer');
  };

  const handleCompleteOrder = async (order: Order) => {
    try {
      const storage = getIndexedDBStorage();
      await storage.init();

      // Update order status
      const updatedOrder = {
        ...order,
        status: 'completed' as OrderStatus,
      };

      await storage.put('orders', updatedOrder);

      // Refresh orders
      await fetchOrders();

      showSuccessToast('Order Completed', `Order #${order.orderNumber} marked as complete`);
    } catch (error) {
      console.error('Error completing order:', error);
      showErrorToast('Error', 'Failed to complete order');
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
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 sticky top-0 z-40">
        {/* Branch Selector for Admins */}
        <MobileBranchSelector
          className="mb-3"
          onBranchChange={setSelectedBranch}
        />
        
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="text"
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 text-base bg-slate-50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tab Filter */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('today')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'today'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              activeTab === 'all'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Orders List */}
      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="p-4 space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Receipt className="w-16 h-16 mb-4 text-slate-300" />
              <p className="font-medium">No orders found</p>
              <p className="text-sm">Try a different search or filter</p>
            </div>
          ) : (
            filteredOrders.map((order) => (
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
                    <div className="flex items-center gap-2">
                      {getOrderTypeIcon(order.orderType)}
                      <div>
                        <h3 className="font-semibold text-slate-900">Order #{order.orderNumber}</h3>
                        <p className="text-xs text-slate-500">{formatTime(order.createdAt)}</p>
                      </div>
                    </div>
                    <Badge className={getStatusBadge(order.status)}>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(order.status)}
                        <span className="capitalize">{order.status}</span>
                      </div>
                    </Badge>
                  </div>

                  <div className="text-sm text-slate-600 mb-2 line-clamp-2">
                    {order.items.slice(0, 3).map((item, i) => (
                      <span key={item.id}>
                        {item.name} x{item.quantity}
                        {i < Math.min(2, order.items.length - 1) && ', '}
                      </span>
                    ))}
                    {order.items.length > 3 && ` +${order.items.length - 3} more`}
                  </div>

                  {order.deliveryAddress && (
                    <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
                      <MapPin className="w-3 h-3" />
                      <span className="line-clamp-1">{order.deliveryAddress}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-emerald-600">
                      {formatCurrency(order.totalAmount)}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintReceipt(order);
                        }}
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      {order.status !== 'completed' && order.status !== 'cancelled' && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCompleteOrder(order);
                          }}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Complete
                        </Button>
                      )}
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
                  </div>
                </CardContent>
              </Card>
            ))
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
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handlePrintReceipt(selectedOrder)}
                    >
                      <Printer className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <ScrollArea className="h-[calc(100vh-180px)] px-6 py-4">
                <div className="space-y-6">
                  {/* Order Info */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Order Information</h4>
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Type</span>
                          <div className="flex items-center gap-2">
                            {getOrderTypeIcon(selectedOrder.orderType)}
                            <span className="font-medium capitalize">{selectedOrder.orderType.replace('-', ' ')}</span>
                          </div>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Status</span>
                          <Badge className={getStatusBadge(selectedOrder.status)}>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(selectedOrder.status)}
                              <span className="capitalize">{selectedOrder.status}</span>
                            </div>
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Time</span>
                          <span className="font-medium">
                            {new Date(selectedOrder.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Payment</span>
                          <span className="font-medium capitalize">{selectedOrder.paymentMethod}</span>
                        </div>
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
                            <div>
                              <p className="font-semibold text-slate-900">{selectedOrder.customer.name}</p>
                              <p className="text-sm text-slate-600">{selectedOrder.customer.phone}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Delivery Info */}
                  {selectedOrder.orderType === 'delivery' && selectedOrder.deliveryAddress && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Delivery</h4>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-slate-600 mt-0.5" />
                            <p className="text-sm text-slate-700">{selectedOrder.deliveryAddress}</p>
                          </div>
                          {selectedOrder.courier && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <p className="text-sm text-slate-600">Courier: {selectedOrder.courier}</p>
                            </div>
                          )}
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
                            {formatCurrency(selectedOrder.totalAmount - (selectedOrder.taxAmount || 0))}
                          </span>
                        </div>
                        {(selectedOrder.taxAmount || 0) > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Tax</span>
                            <span className="font-medium">
                              {formatCurrency(selectedOrder.taxAmount || 0)}
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

              {/* Actions */}
              {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                <div className="border-t border-slate-200 p-4 bg-white">
                  <Button
                    size="lg"
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => {
                      handleCompleteOrder(selectedOrder);
                      setOrderDetailOpen(false);
                    }}
                  >
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Mark Complete
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
