'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Pencil,
  Trash2,
  DollarSign,
  TrendingDown,
  Building2,
  Zap,
  Wifi,
  Flame,
  Users,
  Wrench,
  Package,
  Megaphone,
  MoreHorizontal,
  Calendar,
  TrendingUp,
  Tag,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import NetProfitReport from '@/components/reports-net-profit';
import { formatCurrency } from '@/lib/utils';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface Branch {
  id: string;
  branchName: string;
}

interface CostCategory {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

interface BranchCost {
  id: string;
  branchId: string;
  costCategoryId: string;
  amount: number;
  period: string;
  notes: string | null;
  createdAt: Date;
  branch: { id: string; branchName: string };
  costCategory: { id: string; name: string; icon?: string };
}

interface CostFormData {
  branchId: string;
  costCategoryId: string;
  amount: string;
  period: string;
  notes: string;
}

interface CategoryFormData {
  name: string;
  description: string;
  icon: string;
  sortOrder: string;
  isActive: boolean;
}

interface SummaryData {
  grandTotal: number;
  totalCosts: number;
  totalsByBranch: Record<string, { branchName: string; total: number; byCategory: Record<string, number> }>;
  totalsByCategory: Record<string, { total: number; icon?: string }>;
  byPeriod: Record<string, { total: number; count: number }>;
}

const iconMap: Record<string, any> = {
  Building2,
  Shield: Zap,
  Wifi,
  Flame,
  Users,
  Wrench,
  Package,
  Megaphone,
  MoreHorizontal,
};

const getIcon = (iconName?: string) => {
  if (!iconName) return DollarSign;
  return iconMap[iconName] || DollarSign;
};

export function MobileCosts() {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('costs');
  const [costs, setCosts] = useState<BranchCost[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [costCategories, setCostCategories] = useState<CostCategory[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (currentUser?.role === 'ADMIN') {
      return 'all';
    } else if (currentUser?.branchId) {
      return currentUser.branchId;
    }
    return 'all';
  });
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<BranchCost | null>(null);
  const [formData, setFormData] = useState<CostFormData>({
    branchId: '',
    costCategoryId: '',
    amount: '',
    period: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [addAmountDialogOpen, setAddAmountDialogOpen] = useState(false);
  const [selectedCostForAdd, setSelectedCostForAdd] = useState<BranchCost | null>(null);
  const [addAmountData, setAddAmountData] = useState({
    amount: '',
    notes: '',
  });

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CostCategory | null>(null);
  const [categoryFormData, setCategoryFormData] = useState<CategoryFormData>({
    name: '',
    description: '',
    icon: '',
    sortOrder: '',
    isActive: true,
  });

  const getCurrentPeriod = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const getPeriodOptions = () => {
    const periods: string[] = [];
    const now = new Date();

    for (let i = -2; i <= 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      periods.push({ value: period, label: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) });
    }

    return periods;
  };

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const response = await fetch('/api/branches');
        const data = await response.json();
        if (response.ok && data.branches) {
          setBranches(data.branches);
        }
      } catch (error) {
        console.error('Failed to fetch branches:', error);
      }
    };
    fetchBranches();
  }, []);

  const fetchCostCategories = async () => {
    try {
      const response = await fetch('/api/cost-categories');
      const data = await response.json();
      if (response.ok && data.costCategories) {
        setCostCategories(data.costCategories);
      }
    } catch (error) {
      console.error('Failed to fetch cost categories:', error);
    }
  };

  useEffect(() => {
    fetchCostCategories();
  }, []);

  useEffect(() => {
    fetchCosts();
  }, [selectedBranch, selectedPeriod, selectedCategory]);

  useEffect(() => {
    fetchSummary();
  }, [selectedBranch, selectedPeriod, selectedCategory]);

  const fetchCosts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranch !== 'all') params.append('branchId', selectedBranch);
      if (selectedPeriod !== 'all') params.append('period', selectedPeriod);
      if (selectedCategory !== 'all') params.append('costCategoryId', selectedCategory);

      const response = await fetch(`/api/costs?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        setCosts(data.costs || []);
      }
    } catch (error) {
      console.error('Failed to fetch costs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedBranch !== 'all') params.append('branchId', selectedBranch);
      if (selectedPeriod !== 'all') params.append('period', selectedPeriod);
      if (selectedCategory !== 'all') params.append('costCategoryId', selectedCategory);

      const response = await fetch(`/api/costs/summary?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setMessage(null);

    try {
      const url = editingCost ? `/api/costs/${editingCost.id}` : '/api/costs';
      const method = editingCost ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage({ type: 'error', text: data.error || 'Failed to save cost' });
        return;
      }

      setDialogOpen(false);
      resetForm();
      await fetchCosts();
      await fetchSummary();
      setMessage({ type: 'success', text: editingCost ? 'Cost updated successfully!' : 'Cost added successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save cost:', error);
      setMessage({ type: 'error', text: 'Failed to save cost' });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cost: BranchCost) => {
    setEditingCost(cost);
    setFormData({
      branchId: cost.branchId,
      costCategoryId: cost.costCategoryId,
      amount: cost.amount.toString(),
      period: cost.period,
      notes: cost.notes || '',
    });
    setDialogOpen(true);
    setMessage(null);
  };

  const handleDelete = async (costId: string) => {
    if (!confirm('Are you sure you want to delete this cost entry?')) return;

    try {
      const response = await fetch(`/api/costs/${costId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage({ type: 'error', text: data.error || 'Failed to delete cost' });
        return;
      }

      await fetchCosts();
      await fetchSummary();
      setMessage({ type: 'success', text: 'Cost deleted successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Failed to delete cost:', error);
      setMessage({ type: 'error', text: 'Failed to delete cost' });
    }
  };

  const handleAddAmount = (cost: BranchCost) => {
    setSelectedCostForAdd(cost);
    setAddAmountData({ amount: '', notes: '' });
    setAddAmountDialogOpen(true);
    setMessage(null);
  };

  const handleSubmitAddAmount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCostForAdd) return;

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/costs/${selectedCostForAdd.id}/add-amount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(addAmountData.amount),
          notes: addAmountData.notes,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage({ type: 'error', text: data.error || 'Failed to add amount' });
        return;
      }

      setAddAmountDialogOpen(false);
      setSelectedCostForAdd(null);
      setAddAmountData({ amount: '', notes: '' });
      await fetchCosts();
      await fetchSummary();
      setMessage({ type: 'success', text: `Amount added successfully! New total: ${formatCurrency(data.newTotal)}` });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Failed to add amount:', error);
      setMessage({ type: 'error', text: 'Failed to add amount' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      branchId: currentUser?.branchId || '',
      costCategoryId: '',
      amount: '',
      period: getCurrentPeriod(),
      notes: '',
    });
    setEditingCost(null);
    setMessage(null);
  };

  useEffect(() => {
    resetForm();
  }, [currentUser?.branchId]);

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingCategory 
        ? `/api/cost-categories/${editingCategory.id}` 
        : '/api/cost-categories';
      const method = editingCategory ? 'POST' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...categoryFormData,
          ...(editingCategory && { _method: 'PATCH' }),
          sortOrder: categoryFormData.sortOrder ? parseInt(categoryFormData.sortOrder) : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage({ type: 'error', text: data.error || 'Failed to save category' });
        return;
      }

      setCategoryDialogOpen(false);
      resetCategoryForm();
      await fetchCostCategories();
      setMessage({ type: 'success', text: editingCategory ? 'Category updated successfully!' : 'Category added successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save category:', error);
      setMessage({ type: 'error', text: 'Failed to save category' });
    }
  };

  const handleEditCategory = (category: CostCategory) => {
    setEditingCategory(category);
    setCategoryFormData({
      name: category.name,
      description: category.description || '',
      icon: category.icon || '',
      sortOrder: category.sortOrder?.toString() || '',
      isActive: category.isActive !== undefined ? category.isActive : true,
    });
    setCategoryDialogOpen(true);
    setMessage(null);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      const response = await fetch(`/api/cost-categories/${categoryId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage({ type: 'error', text: data.error || 'Failed to delete category' });
        return;
      }

      await fetchCostCategories();
      setMessage({ type: 'success', text: 'Category deleted successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Failed to delete category:', error);
      setMessage({ type: 'error', text: 'Failed to delete category' });
    }
  };

  const resetCategoryForm = () => {
    setCategoryFormData({
      name: '',
      description: '',
      icon: '',
      sortOrder: '',
      isActive: true,
    });
    setEditingCategory(null);
    setMessage(null);
  };

  const getPeriodLabel = (period: string) => {
    const [year, month] = period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <DollarSign className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Costs</h1>
            <p className="text-emerald-100 text-sm">Operational Expenses</p>
          </div>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-140px)]">
        <div className="p-4 space-y-4">
          {message && (
            <div className={`p-4 rounded-lg border ${
              message.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-white dark:bg-slate-800 w-full">
              <TabsTrigger value="costs" className="flex-1 data-[state=active]:bg-emerald-600">
                <TrendingDown className="h-4 w-4 mr-2" />
                Branch Costs
              </TabsTrigger>
              <TabsTrigger value="net-profit" className="flex-1 data-[state=active]:bg-emerald-600">
                <TrendingUp className="h-4 w-4 mr-2" />
                Net Profit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="costs" className="space-y-4 mt-4">
              {summary && (
                <div className="grid grid-cols-2 gap-3">
                  <Card className="border-emerald-200">
                    <CardContent className="p-3">
                      <p className="text-xs text-emerald-700">Total Cost</p>
                      <p className="text-lg font-bold text-emerald-900">
                        {formatCurrency(summary.grandTotal)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-blue-200">
                    <CardContent className="p-3">
                      <p className="text-xs text-blue-700">Entries</p>
                      <p className="text-lg font-bold text-blue-900">
                        {summary.totalCosts}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {summary && Object.keys(summary.totalsByCategory).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Tag className="h-4 w-4 text-emerald-600" />
                      Costs by Category
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(summary.totalsByCategory)
                        .sort((a, b) => b[1].total - a[1].total)
                        .slice(0, 5)
                        .map(([category, data]) => {
                          const Icon = getIcon(data.icon);
                          return (
                            <div key={category} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-slate-600" />
                                <span className="text-sm font-medium">{category}</span>
                              </div>
                              <span className="text-sm font-bold text-emerald-600">
                                {formatCurrency(data.total)}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Categories</CardTitle>
                    <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8">
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCategorySubmit}>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="categoryName">Name *</Label>
                              <Input
                                id="categoryName"
                                type="text"
                                placeholder="e.g., Rent, Utilities"
                                value={categoryFormData.name}
                                onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="categoryIcon">Icon</Label>
                              <Input
                                id="categoryIcon"
                                type="text"
                                placeholder="e.g., Building2, Zap"
                                value={categoryFormData.icon}
                                onChange={(e) => setCategoryFormData({ ...categoryFormData, icon: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="sortOrder">Sort Order</Label>
                              <Input
                                id="sortOrder"
                                type="number"
                                placeholder="0"
                                value={categoryFormData.sortOrder}
                                onChange={(e) => setCategoryFormData({ ...categoryFormData, sortOrder: e.target.value })}
                                min="0"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                              {loading ? 'Saving...' : 'Save'}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {costCategories.map((category) => {
                      const Icon = getIcon(category.icon);
                      return (
                        <div key={category.id} className="flex items-center justify-between p-2 border rounded-lg">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-slate-600" />
                            <span className="text-sm font-medium">{category.name}</span>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEditCategory(category)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600" onClick={() => handleDeleteCategory(category.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Costs</CardTitle>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="h-8">
                          <Plus className="h-3 w-3 mr-1" />
                          Add Cost
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{editingCost ? 'Edit Cost' : 'Add New Cost'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit}>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="branch">Branch *</Label>
                              {currentUser?.role === 'BRANCH_MANAGER' ? (
                                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-md">
                                  <Building2 className="h-4 w-4 text-slate-500" />
                                  <span className="font-medium text-sm">
                                    {branches.find(b => b.id === currentUser.branchId)?.branchName || 'Your Branch'}
                                  </span>
                                </div>
                              ) : (
                                <Select
                                  value={formData.branchId}
                                  onValueChange={(value) => setFormData({ ...formData, branchId: value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select branch" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {branches.map((branch) => (
                                      <SelectItem key={branch.id} value={branch.id}>
                                        {branch.branchName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="costCategory">Category *</Label>
                              <Select
                                value={formData.costCategoryId}
                                onValueChange={(value) => setFormData({ ...formData, costCategoryId: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {costCategories.map((category) => {
                                    const Icon = getIcon(category.icon);
                                    return (
                                      <SelectItem key={category.id} value={category.id}>
                                        <div className="flex items-center gap-2">
                                          {Icon && <Icon className="h-4 w-4" />}
                                          {category.name}
                                        </div>
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="amount">Amount *</Label>
                              <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                  id="amount"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  value={formData.amount}
                                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                  className="pl-10"
                                  required
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="period">Period *</Label>
                              <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Select
                                  value={formData.period}
                                  onValueChange={(value) => setFormData({ ...formData, period: value })}
                                >
                                  <SelectTrigger className="pl-10">
                                    <SelectValue placeholder="Select period" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getPeriodOptions().map((period) => (
                                      <SelectItem key={period.value} value={period.value}>
                                        {period.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="notes">Notes</Label>
                              <Textarea
                                id="notes"
                                placeholder="Additional details..."
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                rows={2}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                              {loading ? 'Saving...' : editingCost ? 'Update' : 'Add'}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {loading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-16" />
                        <Skeleton className="h-16" />
                        <Skeleton className="h-16" />
                      </div>
                    ) : costs.length === 0 ? (
                      <p className="text-center text-sm text-slate-500 py-4">No costs found</p>
                    ) : (
                      costs.map((cost) => {
                        const Icon = getIcon(cost.costCategory.icon);
                        return (
                          <div key={cost.id} className="p-3 border rounded-lg bg-white">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-slate-600" />
                                <div>
                                  <p className="text-sm font-medium">{cost.costCategory.name}</p>
                                  <p className="text-xs text-slate-500">{cost.branch.branchName}</p>
                                </div>
                              </div>
                              <p className="text-sm font-bold text-emerald-600">
                                {formatCurrency(cost.amount)}
                              </p>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-slate-500">{getPeriodLabel(cost.period)}</p>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleAddAmount(cost)}>
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleEdit(cost)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => handleDelete(cost.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>

              <Dialog open={addAmountDialogOpen} onOpenChange={setAddAmountDialogOpen}>
                <DialogContent className="w-[95vw] max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Amount to Cost</DialogTitle>
                  </DialogHeader>
                  {selectedCostForAdd && (
                    <div className="bg-slate-50 rounded-lg p-3 mb-4">
                      <p className="text-sm text-slate-600 mb-1">{selectedCostForAdd.branch.branchName}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-slate-600" />
                          <span className="font-medium">{selectedCostForAdd.costCategory.name}</span>
                        </div>
                        <span className="text-lg font-bold text-emerald-600">
                          {formatCurrency(selectedCostForAdd.amount)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{getPeriodLabel(selectedCostForAdd.period)}</p>
                    </div>
                  )}
                  <form onSubmit={handleSubmitAddAmount}>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="addAmount">Amount to Add *</Label>
                        <div className="relative">
                          <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                          <DollarSign className="absolute left-9 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input
                            id="addAmount"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={addAmountData.amount}
                            onChange={(e) => setAddAmountData({ ...addAmountData, amount: e.target.value })}
                            className="pl-16"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="addNotes">Notes</Label>
                        <Textarea
                          id="addNotes"
                          placeholder="Reason for this addition..."
                          value={addAmountData.notes}
                          onChange={(e) => setAddAmountData({ ...addAmountData, notes: e.target.value })}
                          rows={2}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setAddAmountDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={loading}>
                        {loading ? 'Adding...' : 'Add Amount'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="net-profit" className="mt-4">
              <Card>
                <CardContent className="p-4">
                  <NetProfitReport />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
