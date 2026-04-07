'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ShoppingCart, Plus, RefreshCw, Package, CheckCircle, 
  XCircle, Clock, Truck, FileText, Trash2, Printer, 
  Eye, Edit, Calendar, Filter, Store, ArrowLeft 
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface Branch {
  id: string;
  branchName: string;
  isActive: boolean;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  reorderThreshold: number;
}

interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';
  totalAmount: number;
  orderedAt: string;
  expectedAt?: string;
  receivedAt?: string;
  notes?: string;
  supplier: Supplier;
  branch: Branch;
  items: PurchaseOrderItem[];
  creator: { name?: string; username?: string };
  approver?: { name?: string; username?: string };
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
  const { currency } = useI18n();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('orders');
  const [selectedBranch, setSelectedBranch] = useState('');
  
  // Orders State
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialogs
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form data
  const [orderItems, setOrderItems] = useState<{ ingredientId: string; quantity: number; unitPrice: number }[]>([]);
  const [receiveItems, setReceiveItems] = useState<{ itemId: string; receivedQty: number }[]>([]);
  
  const [formData, setFormData] = useState({
    supplierId: '',
    branchId: '',
    expectedAt: '',
    notes: '',
  });

  // Fetch branches on mount
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const response = await fetch('/api/branches');
        if (response.ok) {
          setBranches((await response.json()).branches || []);
        }
      } catch (error) {
        console.error('Failed to fetch branches:', error);
      }
    };
    fetchBranches();
  }, []);

  // Set default branch based on user role
  useEffect(() => {
    if (user && branches.length > 0) {
      if (user.role === 'ADMIN') {
        if (!selectedBranch) {
          setSelectedBranch(branches[0].id);
        }
      } else if (user.branchId) {
        if (!selectedBranch) {
          setSelectedBranch(user.branchId);
        }
      }
    }
  }, [user, branches, selectedBranch]);

  // Fetch data when branch changes
  useEffect(() => {
    if (selectedBranch) {
      fetchData();
    }
  }, [selectedBranch, statusFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (selectedBranch) params.append('branchId', selectedBranch);

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
      showErrorToast('Error', 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <FileText className="h-4 w-4" />;
      case 'PENDING':
        return <Clock className="h-4 w-4" />;
      case 'APPROVED':
        return <CheckCircle className="h-4 w-4" />;
      case 'ORDERED':
        return <Truck className="h-4 w-4" />;
      case 'RECEIVED':
        return <Package className="h-4 w-4" />;
      case 'CANCELLED':
        return <XCircle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-slate-100 text-slate-700';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-700';
      case 'APPROVED':
        return 'bg-blue-100 text-blue-700';
      case 'ORDERED':
        return 'bg-purple-100 text-purple-700';
      case 'RECEIVED':
        return 'bg-emerald-100 text-emerald-700';
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

  const resetForm = () => {
    setEditingOrder(null);
    setFormData({
      supplierId: '',
      branchId: selectedBranch,
      expectedAt: '',
      notes: '',
    });
    setOrderItems([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const orderData = {
        supplierId: formData.supplierId,
        branchId: selectedBranch,
        orderNumber: `PO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`,
        expectedAt: formData.expectedAt || null,
        notes: formData.notes,
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

      if (orderData.items.length === 0) {
        showErrorToast('Error', 'Please add at least one item');
        return;
      }

      let response;
      if (editingOrder) {
        // Update existing order
        response = await fetch(`/api/purchase-orders/${editingOrder.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplierId: orderData.supplierId,
            expectedAt: orderData.expectedAt,
            notes: orderData.notes,
            items: orderData.items,
          }),
        });
      } else {
        // Create new order
        response = await fetch('/api/purchase-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        showErrorToast('Error', data.error || 'Failed to save order');
        return;
      }

      setIsDialogOpen(false);
      resetForm();
      await fetchData();
      showSuccessToast('Success', editingOrder ? 'Order updated!' : 'Order created!');
    } catch (error) {
      showErrorToast('Error', 'Failed to save order');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setFormData({
      supplierId: order.supplier.id,
      branchId: order.branch.id,
      expectedAt: order.expectedAt ? order.expectedAt.split('T')[0] : '',
      notes: order.notes || '',
    });
    setOrderItems(order.items.map(item => ({
      ingredientId: item.ingredient.id,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })));
    setIsDialogOpen(true);
  };

  const handleDelete = async (orderId: string) => {
    setCancellingOrderId(orderId);
    setIsCancelDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!cancellingOrderId) return;

    try {
      const response = await fetch(`/api/purchase-orders/${cancellingOrderId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchData();
        showSuccessToast('Success', 'Order deleted!');
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || 'Failed to delete order');
      }
    } catch (error) {
      showErrorToast('Error', 'Failed to delete order');
    } finally {
      setIsCancelDialogOpen(false);
      setCancellingOrderId(null);
    }
  };

  const handleUpdateStatus = async (orderId: string, status: string) => {
    try {
      const response = await fetch(`/api/purchase-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        await fetchData();
        showSuccessToast('Success', `Order ${status.toLowerCase()}!`);
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || 'Failed to update order');
      }
    } catch (error) {
      showErrorToast('Error', 'Failed to update order');
    }
  };

  const handleReceiveOrder = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setReceiveItems(order.items.map(item => ({
      itemId: item.id,
      receivedQty: item.quantity - item.receivedQty,
    })));
    setIsReceiveDialogOpen(true);
  };

  const submitReceive = async () => {
    if (!selectedOrder) return;

    try {
      const response = await fetch(`/api/purchase-orders/${selectedOrder.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'receive',
          items: receiveItems,
        }),
      });

      if (response.ok) {
        await fetchData();
        setIsReceiveDialogOpen(false);
        setSelectedOrder(null);
        setReceiveItems([]);
        showSuccessToast('Success', 'Items received!');
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || 'Failed to receive items');
      }
    } catch (error) {
      showErrorToast('Error', 'Failed to receive items');
    }
  };

  const handleViewOrder = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setIsViewDialogOpen(true);
  };

  const handlePrintInvoice = async (orderId: string) => {
    try {
      const response = await fetch(`/api/purchase-orders/${orderId}`);
      if (!response.ok) {
        showErrorToast('Error', 'Failed to fetch order details');
        return;
      }

      const data = await response.json();
      const order = data.purchaseOrder;

      if (!order) {
        showErrorToast('Error', 'Order not found');
        return;
      }

      // Simple print implementation
      const printContent = `
        PURCHASE ORDER - ${order.orderNumber}
        ================================
        Supplier: ${order.supplier.name}
        Status: ${order.status}
        Total: ${formatCurrency(order.totalAmount)}
        -------------------------------
        Items:
        ${order.items.map(item => `- ${item.ingredient.name}: ${item.quantity} ${item.unit} @ ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.quantity * item.unitPrice)}`).join('\n')}
        ================================
        TOTAL: ${formatCurrency(order.totalAmount)}
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`<pre>${printContent}</pre>`);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      showErrorToast('Error', 'Failed to print invoice');
    }
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => {
      const ingredient = ingredients.find(i => i.id === item.ingredientId);
      const price = item.unitPrice || ingredient?.costPerUnit || 0;
      return sum + (item.quantity * price);
    }, 0);
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.supplier.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = orders.filter(o => o.status === 'PENDING').length;
  const receivedCount = orders.filter(o => o.status === 'RECEIVED').length;
  const totalValue = orders.reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <ShoppingCart className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Purchase Orders</h1>
            <p className="text-emerald-100 text-sm">Manage supplier orders</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-emerald-100 text-xs">Total Value</p>
              <p className="text-lg font-bold">{formatCurrency(totalValue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-emerald-100 text-xs">Pending</p>
              <p className="text-lg font-bold text-amber-300">{pendingCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-emerald-100 text-xs">Received</p>
              <p className="text-lg font-bold">{receivedCount}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="bg-white border-b border-slate-200 px-4 pt-4">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        {/* Orders Tab */}
        <TabsContent value="orders" className="mt-0">
          <div className="p-4 space-y-4">
            {/* Branch Selector */}
            {user?.role === 'ADMIN' ? (
              <MobileBranchSelector selectedBranch={selectedBranch} onBranchChange={setSelectedBranch} />
            ) : (
              branches.length > 0 && selectedBranch && (
                <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-slate-200 px-3 py-2">
                  <Store className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 font-medium">Your Branch</p>
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {branches.find(b => b.id === selectedBranch)?.branchName || selectedBranch}
                    </p>
                  </div>
                </div>
              )
            )}

            {/* Search and Filter */}
            <div className="space-y-3">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12 bg-white"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="ORDERED">Ordered</SelectItem>
                  <SelectItem value="RECEIVED">Received</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Add Button */}
            <Button
              onClick={() => { resetForm(); setIsDialogOpen(true); }}
              className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              New Purchase Order
            </Button>

            {/* Orders List */}
            <ScrollArea className="h-[calc(100vh-450px)]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <div className="animate-spin h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full mb-3" />
                  <p>Loading orders...</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <ShoppingCart className="w-16 h-16 mb-4 text-slate-300" />
                  <p className="font-medium">No purchase orders found</p>
                  <p className="text-sm">Create your first order to get started</p>
                </div>
              ) : (
                <div className="space-y-3 pb-4">
                  {filteredOrders.map((order) => (
                    <Card key={order.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-bold text-slate-900">{order.orderNumber}</h3>
                              <Badge className={getStatusColor(order.status)} variant="secondary">
                                <span className="flex items-center gap-1">
                                  {getStatusIcon(order.status)}
                                  {order.status}
                                </span>
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600 mb-1">{order.supplier.name}</p>
                            <p className="text-xs text-slate-500">
                              {order.items.length} items • {formatCurrency(order.totalAmount)}
                            </p>
                          </div>
                        </div>

                        {/* Order Details */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-xs text-slate-600">Order Date</p>
                            <p className="font-semibold text-sm text-slate-900">
                              {new Date(order.orderedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-xs text-slate-600">Expected</p>
                            <p className="font-semibold text-sm text-slate-900">
                              {order.expectedAt ? new Date(order.expectedAt).toLocaleDateString() : '-'}
                            </p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewOrder(order)}
                            className="flex-1 min-w-[80px] h-10"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          
                          {order.status === 'PENDING' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateStatus(order.id, 'APPROVED')}
                                className="flex-1 min-w-[80px] h-10 text-blue-700 border-blue-300 hover:bg-blue-50"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(order)}
                                className="flex-1 min-w-[80px] h-10"
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                            </>
                          )}

                          {(order.status === 'PENDING' || order.status === 'APPROVED') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReceiveOrder(order)}
                              className="flex-1 min-w-[80px] h-10 text-green-700 border-green-300 hover:bg-green-50"
                            >
                              <Package className="w-4 h-4 mr-1" />
                              Receive
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrintInvoice(order.id)}
                            className="h-10"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>

                          {order.status === 'PENDING' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(order.id)}
                              className="h-10 text-red-600 border-red-300 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        {/* History Tab - Same as Orders but with different filter */}
        <TabsContent value="history" className="mt-0">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">All Orders</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                className="h-10"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            <ScrollArea className="h-[calc(100vh-300px)]">
              {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <ShoppingCart className="w-16 h-16 mb-4 text-slate-300" />
                  <p className="font-medium">No order history</p>
                  <p className="text-sm">Orders will appear here</p>
                </div>
              ) : (
                <div className="space-y-3 pb-4">
                  {orders.map((order) => (
                    <Card key={order.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-slate-900">{order.orderNumber}</h4>
                              <Badge className={getStatusColor(order.status)} variant="secondary" className="text-xs">
                                {order.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600">{order.supplier.name}</p>
                          </div>
                          <p className="font-bold text-emerald-600">
                            {formatCurrency(order.totalAmount)}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500">
                          {new Date(order.orderedAt).toLocaleDateString()} • {order.items.length} items
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Order Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrder ? 'Edit Purchase Order' : 'New Purchase Order'}</DialogTitle>
            <DialogDescription>
              {editingOrder ? 'Update order details' : 'Create a new purchase order from supplier'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier *</Label>
                <Select
                  value={formData.supplierId}
                  onValueChange={(value) => setFormData({ ...formData, supplierId: value })}
                  required
                >
                  <SelectTrigger id="supplier" className="h-11">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expectedAt">Expected Delivery Date</Label>
                <Input
                  id="expectedAt"
                  type="date"
                  value={formData.expectedAt}
                  onChange={(e) => setFormData({ ...formData, expectedAt: e.target.value })}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label>Order Items *</Label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {orderItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Select
                        value={item.ingredientId}
                        onValueChange={(val) => handleItemChange(index, 'ingredientId', val)}
                        className="flex-1"
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select ingredient" />
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
                        value={item.quantity || ''}
                        onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                        className="w-16 h-11"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(index)}
                        className="h-11 w-11 text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddItem}
                    className="w-full h-11"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </div>

              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="font-semibold">Total:</span>
                <span className="text-xl font-bold text-emerald-600">{formatCurrency(calculateTotal())}</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any additional notes..."
                  className="h-11"
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto h-11">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto h-11 bg-emerald-600 hover:bg-emerald-700">
                {loading ? 'Saving...' : editingOrder ? 'Update' : 'Create'} Order
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Order Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedOrder?.orderNumber}</DialogTitle>
            <DialogDescription>Order details</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Supplier</p>
                  <p className="font-semibold text-sm">{selectedOrder.supplier.name}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Status</p>
                  <Badge className={getStatusColor(selectedOrder.status)} variant="secondary">
                    {selectedOrder.status}
                  </Badge>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Total</p>
                  <p className="font-bold text-emerald-600">{formatCurrency(selectedOrder.totalAmount)}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Items</p>
                  <p className="font-semibold text-sm">{selectedOrder.items.length}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Order Date</p>
                  <p className="font-semibold text-sm">{new Date(selectedOrder.orderedAt).toLocaleDateString()}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1">Expected</p>
                  <p className="font-semibold text-sm">
                    {selectedOrder.expectedAt ? new Date(selectedOrder.expectedAt).toLocaleDateString() : '-'}
                  </p>
                </div>
              </div>

              {selectedOrder.notes && (
                <div>
                  <Label className="mb-2 block">Notes</Label>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{selectedOrder.notes}</p>
                </div>
              )}

              <div>
                <Label className="mb-2 block">Items</Label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="bg-slate-50 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-sm">{item.ingredient.name}</span>
                        <span className="font-bold text-emerald-600">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-600">
                        <span>{item.quantity} {item.unit} @ {formatCurrency(item.unitPrice)}</span>
                        <Badge variant={item.receivedQty >= item.quantity ? 'default' : 'secondary'} className="text-xs">
                          {item.receivedQty} / {item.quantity}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)} className="w-full h-11">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive Items Dialog */}
      <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receive Items - {selectedOrder?.orderNumber}</DialogTitle>
            <DialogDescription>Enter received quantities</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {selectedOrder.items.map((item) => {
                const remaining = item.quantity - item.receivedQty;
                return (
                  <div key={item.id} className="bg-slate-50 rounded-lg p-3">
                    <p className="font-medium text-sm mb-2">{item.ingredient.name}</p>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <p className="text-xs text-slate-600">Ordered</p>
                        <p className="font-semibold">{item.quantity}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">Already Received</p>
                        <p className="font-semibold">{item.receivedQty}</p>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`receive-${item.id}`} className="text-xs">Receiving (max {remaining})</Label>
                      <Input
                        id={`receive-${item.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        max={remaining}
                        value={receiveItems.find(r => r.itemId === item.id)?.receivedQty || 0}
                        onChange={(e) => {
                          const updated = receiveItems.map(r =>
                            r.itemId === item.id
                              ? { ...r, receivedQty: parseFloat(e.target.value) || 0 }
                              : r
                          );
                          setReceiveItems(updated);
                        }}
                        className="h-11"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsReceiveDialogOpen(false)} className="w-full sm:w-auto h-11">
              Cancel
            </Button>
            <Button onClick={submitReceive} disabled={loading} className="w-full sm:w-auto h-11 bg-emerald-600 hover:bg-emerald-700">
              {loading ? 'Receiving...' : 'Confirm Receipt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this purchase order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setCancellingOrderId(null)} className="w-full sm:w-auto h-11">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="w-full sm:w-auto h-11 bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
