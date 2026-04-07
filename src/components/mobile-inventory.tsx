'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Package, Plus, Search, Edit, Trash2, DollarSign, 
  AlertTriangle, Store, TrendingUp, ArrowDownCircle, 
  ArrowUpCircle, RefreshCw, Filter, X, ArrowLeft
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
  version: number;
  currentStock?: number;
  isLowStock?: boolean;
  lastModifiedAt?: Date;
}

interface InventoryTransaction {
  id: string;
  ingredientId: string;
  ingredientName: string;
  transactionType: string;
  quantityChange: number;
  stockBefore: number;
  stockAfter: number;
  orderId?: string | null;
  reason?: string | null;
  createdAt: Date;
  userName?: string;
}

const units = ['kg', 'g', 'L', 'ml', 'units'];

export function MobileInventory() {
  const { currency } = useI18n();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('inventory');
  const [selectedBranch, setSelectedBranch] = useState('');
  
  // Inventory State
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'ok'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [restockDialogOpen, setRestockDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [restockItem, setRestockItem] = useState<Ingredient | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    unit: 'kg',
    costPerUnit: '',
    reorderThreshold: '10',
    initialStock: '',
  });
  
  const [restockData, setRestockData] = useState({
    quantity: '',
    reason: '',
  });
  
  // Transaction History State
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  
  const [loading, setLoading] = useState(false);

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
        // For admins, use the first branch if no branch is selected yet
        if (!selectedBranch) {
          setSelectedBranch(branches[0].id);
        }
      } else if (user.branchId) {
        // For non-admin users, use their assigned branch
        if (!selectedBranch) {
          setSelectedBranch(user.branchId);
        }
      }
    }
  }, [user, branches, selectedBranch]);

  // Fetch inventory data when branch changes
  useEffect(() => {
    if (selectedBranch) {
      console.log(`[MobileInventory] Branch changed to: ${selectedBranch}, fetching data`);
      fetchIngredients();
      fetchTransactions();
    }
  }, [selectedBranch]);

  const fetchIngredients = async () => {
    if (!selectedBranch) {
      console.log('[MobileInventory] No selected branch, skipping ingredients fetch');
      return;
    }
    setLoading(true);
    try {
      console.log(`[MobileInventory] Fetching ingredients for branch: ${selectedBranch}`);
      const response = await fetch(`/api/ingredients?branchId=${selectedBranch}`);
      if (response.ok) {
        const data = await response.json();
        console.log('[MobileInventory] Ingredients data:', data);
        const ingredientsWithInventory = (data.ingredients || []).map((ing: any) => ({
          ...ing,
          // Ensure currentStock is properly set from API response
          currentStock: ing.currentStock !== undefined ? ing.currentStock : 0,
          branchStock: ing.branchStock !== undefined ? ing.branchStock : 0,
          isLowStock: ing.isLowStock !== undefined ? ing.isLowStock : false,
        }));
        console.log('[MobileInventory] Mapped ingredients:', ingredientsWithInventory);
        setIngredients(ingredientsWithInventory);
      } else {
        console.error('[MobileInventory] Failed to fetch ingredients:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('[MobileInventory] Failed to fetch ingredients:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    if (!selectedBranch) {
      console.log('[MobileInventory] No selected branch, skipping transactions fetch');
      return;
    }
    try {
      console.log(`[MobileInventory] Fetching transactions for branch: ${selectedBranch}`);
      const response = await fetch(`/api/inventory/transactions?branchId=${selectedBranch}&limit=50`);
      if (response.ok) {
        const data = await response.json();
        console.log('[MobileInventory] Transactions data:', data);
        setTransactions(data.transactions || []);
      } else {
        console.error('[MobileInventory] Failed to fetch transactions:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('[MobileInventory] Failed to fetch transactions:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingItem) {
        const payload: any = {
          _method: 'PATCH',
          name: formData.name,
          unit: formData.unit,
          branchId: selectedBranch,
        };

        if (formData.costPerUnit) payload.costPerUnit = parseFloat(formData.costPerUnit);
        if (formData.reorderThreshold) payload.reorderThreshold = parseFloat(formData.reorderThreshold);
        if (formData.initialStock?.trim()) payload.initialStock = formData.initialStock;

        const response = await fetch(`/api/ingredients/${editingItem.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
          showErrorToast('Error', data.error || 'Failed to update ingredient');
          return;
        }
      } else {
        const payload: any = {
          name: formData.name,
          unit: formData.unit,
          costPerUnit: formData.costPerUnit,
          reorderThreshold: formData.reorderThreshold,
        };

        if (formData.initialStock?.trim()) {
          payload.branchId = selectedBranch;
          payload.initialStock = formData.initialStock;
        }

        const response = await fetch('/api/ingredients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
          showErrorToast('Error', data.error || 'Failed to create ingredient');
          return;
        }
      }

      setDialogOpen(false);
      resetForm();
      await fetchIngredients();
      showSuccessToast('Success', editingItem ? 'Ingredient updated!' : 'Ingredient created!');
    } catch (error) {
      showErrorToast('Error', 'Failed to save ingredient');
    } finally {
      setLoading(false);
    }
  };

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockItem) return;

    setLoading(true);

    try {
      const response = await fetch('/api/inventory/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: selectedBranch,
          ingredientId: restockItem.id,
          quantity: parseFloat(restockData.quantity),
          reason: restockData.reason || 'Manual restock',
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showErrorToast('Error', data.error || 'Failed to restock');
        return;
      }

      setRestockDialogOpen(false);
      setRestockData({ quantity: '', reason: '' });
      setRestockItem(null);
      await fetchIngredients();
      await fetchTransactions();
      showSuccessToast('Success', 'Stock restocked successfully!');
    } catch (error) {
      showErrorToast('Error', 'Failed to restock');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: Ingredient) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      unit: item.unit,
      costPerUnit: item.costPerUnit.toString(),
      reorderThreshold: item.reorderThreshold.toString(),
      initialStock: item.currentStock?.toString() || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this ingredient? This will affect all recipes and inventory records.')) return;
    
    try {
      const response = await fetch(`/api/ingredients/${itemId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchIngredients();
        showSuccessToast('Success', 'Ingredient deleted!');
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || 'Failed to delete ingredient');
      }
    } catch (error) {
      showErrorToast('Error', 'Failed to delete ingredient');
    }
  };

  const resetForm = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      unit: 'kg',
      costPerUnit: '',
      reorderThreshold: '10',
      initialStock: '',
    });
  };

  const filteredIngredients = ingredients.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStock = 
      stockFilter === 'all' || 
      (stockFilter === 'low' && item.isLowStock) ||
      (stockFilter === 'ok' && !item.isLowStock);
    return matchesSearch && matchesStock;
  });

  const lowStockCount = ingredients.filter(i => i.isLowStock).length;
  const totalStockValue = ingredients.reduce((sum, i) => sum + (i.currentStock || 0) * i.costPerUnit, 0);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'SALE': return <ArrowDownCircle className="h-4 w-4 text-red-600" />;
      case 'RESTOCK': return <ArrowUpCircle className="h-4 w-4 text-green-600" />;
      case 'WASTE': return <Trash2 className="h-4 w-4 text-orange-600" />;
      case 'ADJUSTMENT': return <RefreshCw className="h-4 w-4 text-blue-600" />;
      case 'REFUND': return <TrendingUp className="h-4 w-4 text-purple-600" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'SALE': return <Badge variant="destructive">Sale</Badge>;
      case 'RESTOCK': return <Badge className="bg-green-600">Restock</Badge>;
      case 'WASTE': return <Badge className="bg-orange-600">Waste</Badge>;
      case 'ADJUSTMENT': return <Badge className="bg-blue-600">Adjustment</Badge>;
      case 'REFUND': return <Badge className="bg-purple-600">Refund</Badge>;
      default: return <Badge>{type}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <Package className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Inventory</h1>
            <p className="text-emerald-100 text-sm">Manage ingredients and stock</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-emerald-100 text-xs">Total Value</p>
              <p className="text-lg font-bold">{formatCurrency(totalStockValue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-emerald-100 text-xs">Low Stock</p>
              <p className="text-lg font-bold text-amber-300">{lowStockCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-emerald-100 text-xs">Items</p>
              <p className="text-lg font-bold">{ingredients.length}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="bg-white border-b border-slate-200 px-4 pt-4">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="mt-0">
          <div className="p-4 space-y-4">
            {/* Branch Selector - Connected to parent state */}
            {user?.role === 'ADMIN' ? (
              <MobileBranchSelector selectedBranch={selectedBranch} onBranchChange={setSelectedBranch} />
            ) : (
              /* Branch Info for Non-Admin Users */
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Search ingredients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12 bg-white"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              <Select value={stockFilter} onValueChange={(v: any) => setStockFilter(v)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="All Items" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  <SelectItem value="low">Low Stock</SelectItem>
                  <SelectItem value="ok">In Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Add Button */}
            {user?.role === 'ADMIN' && (
              <Button
                onClick={() => { resetForm(); setDialogOpen(true); }}
                className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Ingredient
              </Button>
            )}

            {/* Ingredients List */}
            <ScrollArea className="h-[calc(100vh-450px)]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <div className="animate-spin h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full mb-3" />
                  <p>Loading ingredients...</p>
                </div>
              ) : filteredIngredients.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Package className="w-16 h-16 mb-4 text-slate-300" />
                  <p className="font-medium">No ingredients found</p>
                  <p className="text-sm">Add your first ingredient to get started</p>
                </div>
              ) : (
                <div className="space-y-3 pb-4">
                  {filteredIngredients.map((item) => (
                    <Card key={item.id} className={item.isLowStock ? 'border-2 border-amber-300 bg-amber-50' : ''}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-slate-900 text-base">{item.name}</h3>
                              {item.isLowStock ? (
                                <Badge variant="destructive" className="gap-1 text-xs h-6">
                                  <AlertTriangle className="h-3 w-3" />
                                  Low Stock
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-600 text-xs h-6">In Stock</Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Detailed Information Grid */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
                            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Current Stock</p>
                            <p className={`font-bold text-lg ${item.isLowStock ? 'text-red-600' : 'text-slate-900'}`}>
                              {(item.currentStock || 0).toFixed(2)}
                            </p>
                            <p className="text-xs text-slate-500">{item.unit}</p>
                          </div>

                          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
                            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Cost/Unit</p>
                            <p className="font-bold text-lg text-slate-900">
                              {formatCurrency(item.costPerUnit)}
                            </p>
                            <p className="text-xs text-slate-500">per {item.unit}</p>
                          </div>

                          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
                            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Reorder Level</p>
                            <p className="font-bold text-lg text-slate-900">
                              {item.reorderThreshold}
                            </p>
                            <p className="text-xs text-slate-500">{item.unit}</p>
                          </div>

                          <div className="bg-emerald-50 dark:bg-emerald-950 rounded-lg p-2 border border-emerald-200 dark:border-emerald-800">
                            <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">Stock Value</p>
                            <p className="font-bold text-lg text-emerald-700 dark:text-emerald-400">
                              {formatCurrency((item.currentStock || 0) * item.costPerUnit)}
                            </p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-500">Total</p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRestockItem(item);
                              setRestockDialogOpen(true);
                            }}
                            className="flex-1 h-10 text-green-700 border-green-300 hover:bg-green-50"
                          >
                            <ArrowUpCircle className="w-4 h-4 mr-2" />
                            Restock
                          </Button>
                          {user?.role === 'ADMIN' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(item)}
                                className="flex-1 h-10"
                              >
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(item.id)}
                                className="h-10 text-red-600 border-red-300 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
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

        {/* Transaction History Tab */}
        <TabsContent value="history" className="mt-0">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Transaction History</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchTransactions}
                className="h-10"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            <ScrollArea className="h-[calc(100vh-300px)]">
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <RefreshCw className="w-16 h-16 mb-4 text-slate-300" />
                  <p className="font-medium">No transactions found</p>
                  <p className="text-sm">Inventory movements will appear here</p>
                </div>
              ) : (
                <div className="space-y-3 pb-4">
                  {transactions.map((txn) => (
                    <Card key={txn.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 flex-shrink-0">
                            {getTransactionIcon(txn.transactionType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-2 gap-2">
                              <h4 className="font-semibold text-slate-900 truncate">{txn.ingredientName}</h4>
                              {getTransactionBadge(txn.transactionType)}
                            </div>

                            {/* Transaction Details Grid */}
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                                <p className="text-xs text-slate-600 dark:text-slate-400">Change</p>
                                <p className={`font-bold ${txn.quantityChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {txn.quantityChange >= 0 ? '+' : ''}{txn.quantityChange.toFixed(2)}
                                </p>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
                                <p className="text-xs text-slate-600 dark:text-slate-400">After</p>
                                <p className="font-bold text-slate-900">
                                  {txn.stockAfter.toFixed(2)}
                                </p>
                              </div>
                            </div>

                            {/* Additional Details */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-600">Before:</span>
                                <span className="font-medium">{txn.stockBefore.toFixed(2)}</span>
                              </div>
                              {txn.reason && (
                                <div className="bg-amber-50 dark:bg-amber-950 rounded p-2 mt-2">
                                  <p className="text-xs text-amber-800 dark:text-amber-300">{txn.reason}</p>
                                </div>
                              )}
                              <p className="text-xs text-slate-400 mt-2">
                                {new Date(txn.createdAt).toLocaleString()}
                              </p>
                              {txn.userName && (
                                <p className="text-xs text-slate-500">
                                  By: {txn.userName}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>

      {/* Ingredient Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Ingredient' : 'Add Ingredient'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Update ingredient details' : 'Add a new ingredient to track inventory'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Ingredient Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Coffee Beans"
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit *</Label>
                <Select
                  value={formData.unit}
                  onValueChange={(value) => setFormData({ ...formData, unit: value })}
                >
                  <SelectTrigger id="unit" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="costPerUnit">Cost/Unit ({currency}) *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="costPerUnit"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.costPerUnit}
                    onChange={(e) => setFormData({ ...formData, costPerUnit: e.target.value })}
                    placeholder="0.00"
                    className="pl-10 h-11"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reorderThreshold">Reorder Threshold *</Label>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <Input
                    id="reorderThreshold"
                    type="number"
                    min="0"
                    value={formData.reorderThreshold}
                    onChange={(e) => setFormData({ ...formData, reorderThreshold: e.target.value })}
                    placeholder="10"
                    required
                    className="h-11"
                  />
                </div>
              </div>
              {!editingItem && (
                <div className="space-y-2">
                  <Label htmlFor="initialStock">Initial Stock ({formData.unit})</Label>
                  <Input
                    id="initialStock"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.initialStock}
                    onChange={(e) => setFormData({ ...formData, initialStock: e.target.value })}
                    placeholder="0.00"
                    className="h-11"
                  />
                </div>
              )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto h-11">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto h-11 bg-emerald-600 hover:bg-emerald-700">
                {loading ? 'Saving...' : editingItem ? 'Update' : 'Add'} Ingredient
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Restock Dialog */}
      <Dialog open={restockDialogOpen} onOpenChange={setRestockDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restock {restockItem?.name}</DialogTitle>
            <DialogDescription>
              Add stock to this ingredient
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRestock}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="restockQuantity">Quantity to Add ({restockItem?.unit}) *</Label>
                <Input
                  id="restockQuantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={restockData.quantity}
                  onChange={(e) => setRestockData({ ...restockData, quantity: e.target.value })}
                  placeholder="0.00"
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="restockReason">Reason (Optional)</Label>
                <Input
                  id="restockReason"
                  value={restockData.reason}
                  onChange={(e) => setRestockData({ ...restockData, reason: e.target.value })}
                  placeholder="e.g., Supplier delivery"
                  className="h-11"
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setRestockDialogOpen(false)} className="w-full sm:w-auto h-11">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto h-11 bg-emerald-600 hover:bg-emerald-700">
                {loading ? 'Restocking...' : 'Restock'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
