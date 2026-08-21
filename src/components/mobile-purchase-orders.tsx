'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ShoppingCart,
  Plus,
  RefreshCw,
  Package,
  CheckCircle,
  Clock,
  Truck,
  XCircle,
  FileText,
  Trash2,
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign
} from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
}

interface Supplier {
  id: string;
  name: string;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  status: 'PENDING' | 'APPROVED' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED';
  totalAmount: number;
  orderedAt: string;
  expectedAt?: string;
  receivedAt?: string;
  notes?: string;
  supplier: Supplier;
  items: PurchaseOrderItem[];
  creator?: { name?: string };
  branch?: { id: string; name: string };
}

interface PurchaseOrderItem {
  id: string;
  ingredient: Ingredient;
  quantity: number;
  unit: string;
  unitPrice: number;
  receivedQty: number;
}

export function MobilePurchaseOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [orderItems, setOrderItems] = useState<{ ingredientId: string; quantity: number; unitPrice: number }[]>([]);

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (user?.branchId) params.append('branchId', user.branchId);

      const [ordersRes, ingredientsRes, suppliersRes] = await Promise.all([
        fetch(`/api/purchase-orders?${params.toString()}`),
        fetch('/api/ingredients'),
        fetch('/api/suppliers'),
      ]);

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.purchaseOrders || []);
      }
      if (ingredientsRes.ok) {
        const data = await ingredientsRes.json();
        setIngredients(data.ingredients || []);
      }
      if (suppliersRes.ok) {
        const data = await suppliersRes.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      showErrorToast('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-4 w-4" />;
      case 'APPROVED':
        return <CheckCircle className="h-4 w-4" />;
      case 'RECEIVED':
        return <Package className="h-4 w-4" />;
      case 'PARTIAL':
        return <Truck className="h-4 w-4" />;
      case 'CANCELLED':
        return <XCircle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-700';
      case 'APPROVED':
        return 'bg-blue-100 text-blue-700';
      case 'RECEIVED':
        return 'bg-emerald-100 text-emerald-700';
      case 'PARTIAL':
        return 'bg-orange-100 text-orange-700';
      case 'CANCELLED':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const handleAddItem = () => {
    setOrderItems([...orderItems, { ingredientId: '', quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], [field]: value };
    setOrderItems(updated);
  };

  const createOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);
    const orderData = {
      supplierId: formData.get('supplierId'),
      branchId: formData.get('branchId') || user?.branchId,
      orderNumber: `PO-${Date.now()}`,
      expectedAt: formData.get('expectedAt'),
      notes: formData.get('notes'),
      items: orderItems.filter(item => item.ingredientId && item.quantity > 0).map(item => {
        const ingredient = ingredients.find(i => i.id === item.ingredientId);
        return {
          ingredientId: item.ingredientId,
          quantity: item.quantity,
          unit: ingredient?.unit || 'unit',
          unitPrice: item.unitPrice || ingredient?.costPerUnit || 0,
        };
      }),
    };

    try {
      const response = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (response.ok) {
        showSuccessToast('Success', 'Purchase order created successfully');
        fetchData();
        setIsDialogOpen(false);
        setOrderItems([]);
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || 'Failed to create order');
      }
    } catch (error) {
      console.error('Failed to create order:', error);
      showErrorToast('Error', 'Failed to create order');
    }
  };

  const approveOrder = async (orderId: string) => {
    try {
      const response = await fetch(`/api/purchase-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      });

      if (response.ok) {
        showSuccessToast('Success', 'Order approved successfully');
        fetchData();
        if (selectedOrder) {
          const updated = await response.json();
          setSelectedOrder(updated.purchaseOrder);
        }
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || 'Failed to approve order');
      }
    } catch (error) {
      console.error('Failed to approve order:', error);
      showErrorToast('Error', 'Failed to approve order');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const resetForm = () => {
    setOrderItems([]);
  };

  if (selectedOrder) {
    return (
      <div className="h-full flex flex-col bg-slate-50">
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setSelectedOrder(null)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold truncate">{selectedOrder.orderNumber}</h1>
            <p className="text-emerald-100 text-sm">Order Details</p>
          </div>
          <Badge className="bg-white/20 text-white border-white/30">
            {selectedOrder.items.length} items
          </Badge>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {/* Status */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Status</span>
                  <Badge className={getStatusColor(selectedOrder.status)}>
                    <span className="flex items-center gap-1">
                      {getStatusIcon(selectedOrder.status)}
                      {selectedOrder.status}
                    </span>
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Supplier Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-emerald-600" />
                  Supplier
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-semibold">{selectedOrder.supplier.name}</p>
                {selectedOrder.branch && (
                  <p className="text-sm text-slate-600 mt-1">Branch: {selectedOrder.branch.name}</p>
                )}
              </CardContent>
            </Card>

            {/* Dates */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-emerald-600" />
                  Dates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Ordered</span>
                  <span className="font-medium">{formatDate(selectedOrder.orderedAt)}</span>
                </div>
                {selectedOrder.expectedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Expected</span>
                    <span className="font-medium">{formatDate(selectedOrder.expectedAt)}</span>
                  </div>
                )}
                {selectedOrder.receivedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Received</span>
                    <span className="font-medium">{formatDate(selectedOrder.receivedAt)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Items */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Order Items</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedOrder.items.map((item, index) => (
                  <div key={item.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <Badge variant="outline" className="mt-1">{index + 1}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.ingredient.name}</p>
                      <div className="flex items-center gap-4 text-sm text-slate-600 mt-1">
                        <span>{item.quantity} {item.unit}</span>
                        <span>× {formatCurrency(item.unitPrice)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </p>
                      {item.receivedQty > 0 && (
                        <p className="text-xs text-slate-600">Rec: {item.receivedQty}</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Total */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-emerald-600" />
                    <span className="font-semibold">Total Amount</span>
                  </div>
                  <span className="text-2xl font-bold text-emerald-600">
                    {formatCurrency(selectedOrder.totalAmount)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            {selectedOrder.notes && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-slate-600 mb-1">Notes</p>
                  <p className="font-medium">{selectedOrder.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            {selectedOrder.status === 'PENDING' && (
              <Button
                className="w-full h-14 bg-blue-600 hover:bg-blue-700"
                onClick={() => approveOrder(selectedOrder.id)}
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                Approve Order
              </Button>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">Purchase Orders</h1>
          <Button
            variant="secondary"
            size="icon"
            className="bg-white/20 hover:bg-white/30 text-white"
            onClick={fetchData}
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
        </div>

        {/* Status Filter */}
        <Select
          value={statusFilter || 'all'}
          onValueChange={(val) => setStatusFilter(val === 'all' ? '' : val)}
        >
          <SelectTrigger className="bg-white/20 border-white/30 text-white">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="RECEIVED">Received</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Order List */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
          </div>
        ) : orders.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <ShoppingCart className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-4">No purchase orders found</p>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setIsDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Order
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <Card
                key={order.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedOrder(order)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg">{order.orderNumber}</h3>
                      <p className="text-sm text-slate-600">{order.supplier.name}</p>
                    </div>
                    <Badge className={getStatusColor(order.status)}>
                      <span className="flex items-center gap-1">
                        {getStatusIcon(order.status)}
                      </span>
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{order.items.length} items</span>
                    <span className="font-semibold text-emerald-600">
                      {formatCurrency(order.totalAmount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(order.orderedAt)}</span>
                    {order.expectedAt && (
                      <>
                        <span>•</span>
                        <span>Exp: {formatDate(order.expectedAt)}</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Add Order Button */}
      <div className="p-4 bg-white border-t">
        <Button
          className="w-full h-14 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-5 w-5 mr-2" />
          Create Order
        </Button>
      </div>

      {/* Create Order Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
            <DialogDescription>Create a new purchase order from supplier</DialogDescription>
          </DialogHeader>
          <form onSubmit={createOrder}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Supplier *</Label>
                <Select name="supplierId" required>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {user?.role === 'ADMIN' && (
                <div className="grid gap-2">
                  <Label>Branch *</Label>
                  <Select name="branchId" required>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cmhphh1x20002zv5e6zq068y4">Main Branch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label>Expected Delivery Date</Label>
                <Input type="date" name="expectedAt" className="h-12" />
              </div>
              <div className="grid gap-2">
                <Label>Order Items *</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {orderItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Select
                        value={item.ingredientId}
                        onValueChange={(val) => handleItemChange(index, 'ingredientId', val)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Item" />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredients.map(ing => (
                            <SelectItem key={ing.id} value={ing.id}>
                              {ing.name} ({ing.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                        className="w-16 h-10"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="$"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value))}
                        className="w-16 h-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full h-10"
                    onClick={handleAddItem}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Input name="notes" placeholder="Any additional notes..." className="h-12" />
              </div>
            </div>
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setIsDialogOpen(false); resetForm(); }}
                className="w-full sm:w-auto h-12"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto h-12"
              >
                Create Order
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
