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
  Filter,
  ChevronDown,
  ShoppingCart,
  AlertCircle,
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

interface NetProfitData {
  period: string;
  sales: {
    revenue: number;
    productCost: number;
    netProfitFromOperations: number;
    grossMargin: number;
  };
  costs: {
    operational: number;
    entries: number;
    byCategory: Record<string, number>;
  };
  netProfit: {
    amount: number;
    margin: number;
    isProfitable: boolean;
  };
  items: {
    sold: number;
    orders: number;
  };
  costsBreakdown: Array<{
    id: string;
    category: string;
    amount: number;
    branch: string;
    notes: string | null;
    date: Date;
  }>;
  categoryBreakdown: Array<{
    category: string;
    revenue: number;
    orders: number;
    itemsSold: number;
    productCost: number;
    netFromOperations: number;
    grossMargin: number;
  }>;
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
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
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
    const periods: Array<{ value: string; label: string }> = [];
    const now = new Date();

    for (let i = -2; i <= 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      periods.push({ value: period, label: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) });
    }

    return periods;
  };

  // Net Profit state
  const [netProfitData, setNetProfitData] = useState<NetProfitData | null>(null);
  const [netProfitLoading, setNetProfitLoading] = useState(false);
  const [netProfitPeriod, setNetProfitPeriod] = useState<string>(getCurrentPeriod());
  const [netProfitBranch, setNetProfitBranch] = useState<string>(() => {
    if (currentUser?.role === 'BRANCH_MANAGER' && currentUser?.branchId) {
      return currentUser.branchId;
    }
    return 'all';
  });

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
  }, [selectedBranch, selectedPeriod, selectedCategory, startDate, endDate]);

  useEffect(() => {
    fetchSummary();
  }, [selectedBranch, selectedPeriod, selectedCategory, startDate, endDate]);

  const fetchCosts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranch !== 'all') params.append('branchId', selectedBranch);
      if (selectedPeriod !== 'all') params.append('period', selectedPeriod);
      if (selectedCategory !== 'all') params.append('costCategoryId', selectedCategory);
      if (startDate && endDate) {
        // Convert to YYYY-MM format for period filtering
        const startPeriod = startDate.slice(0, 7);
        const endPeriod = endDate.slice(0, 7);
        params.append('startDate', startPeriod);
        params.append('endDate', endPeriod);
      }

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
      if (startDate && endDate) {
        // Convert to YYYY-MM format for period filtering
        const startPeriod = startDate.slice(0, 7);
        const endPeriod = endDate.slice(0, 7);
        params.append('startDate', startPeriod);
        params.append('endDate', endPeriod);
      }

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

  // Fetch Net Profit data when period or branch changes
  useEffect(() => {
    if (activeTab === 'net-profit' && netProfitPeriod) {
      fetchNetProfitData();
    }
  }, [netProfitPeriod, netProfitBranch, activeTab]);

  const fetchNetProfitData = async () => {
    setNetProfitLoading(true);
    try {
      const params = new URLSearchParams();
      if (netProfitBranch !== 'all') params.append('branchId', netProfitBranch);
      if (netProfitPeriod) params.append('period', netProfitPeriod);

      const response = await fetch(`/api/reports/net-profit?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setNetProfitData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch net profit data:', error);
    } finally {
      setNetProfitLoading(false);
    }
  };

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
              {/* Filters Section */}
              <Card className="border-emerald-200">
                <CardContent className="p-4">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="w-full flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-medium text-slate-700">Filters</span>
                      {(selectedBranch !== 'all' || selectedPeriod !== 'all' || selectedCategory !== 'all' || startDate || endDate) && (
                        <span className="bg-emerald-600 text-white text-xs px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                  </button>

                  {showFilters && (
                    <div className="mt-4 space-y-3">
                      {/* Branch Filter - Only for ADMIN */}
                      {currentUser?.role === 'ADMIN' && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Branch</Label>
                          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                            <SelectTrigger className="w-full">
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
                        </div>
                      )}

                      {/* Category Filter */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Category</Label>
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="All Categories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {costCategories.map((category) => {
                              const Icon = getIcon(category.icon);
                              return (
                                <SelectItem key={category.id} value={category.id}>
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4" />
                                    {category.name}
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Period Filter */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Period</Label>
                        <Select value={selectedPeriod} onValueChange={(value) => {
                          setSelectedPeriod(value);
                          // Clear date range when selecting a period
                          if (value !== 'all') {
                            setStartDate('');
                            setEndDate('');
                          }
                        }}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="All Periods" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Periods</SelectItem>
                            {getPeriodOptions().map((period) => (
                              <SelectItem key={period.value} value={period.value}>
                                {period.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Date Range Filter */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Date Range</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-slate-500">From</Label>
                            <Input
                              type="month"
                              value={startDate}
                              onChange={(e) => {
                                setStartDate(e.target.value);
                                setSelectedPeriod('all'); // Clear period when using date range
                              }}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">To</Label>
                            <Input
                              type="month"
                              value={endDate}
                              onChange={(e) => {
                                setEndDate(e.target.value);
                                setSelectedPeriod('all'); // Clear period when using date range
                              }}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Clear Filters Button */}
                      {(selectedBranch !== 'all' || selectedPeriod !== 'all' || selectedCategory !== 'all' || startDate || endDate) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedBranch(currentUser?.role === 'ADMIN' ? 'all' : currentUser?.branchId || 'all');
                            setSelectedPeriod('all');
                            setSelectedCategory('all');
                            setStartDate('');
                            setEndDate('');
                          }}
                          className="w-full mt-2"
                        >
                          Clear All Filters
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

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
              {/* Net Profit Filters */}
              <Card className="border-emerald-200 mb-4">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Branch Filter - Only for ADMIN */}
                    {currentUser?.role === 'ADMIN' && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Branch</Label>
                        <Select value={netProfitBranch} onValueChange={setNetProfitBranch}>
                          <SelectTrigger className="w-full">
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
                      </div>
                    )}

                    {/* Period Filter */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Period</Label>
                      <Select value={netProfitPeriod} onValueChange={setNetProfitPeriod}>
                        <SelectTrigger className="w-full">
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
                </CardContent>
              </Card>

              {netProfitLoading ? (
                <Card>
                  <CardContent className="p-8">
                    <div className="flex flex-col items-center justify-center gap-4">
                      <div className="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
                      <p className="text-sm text-slate-600">Loading net profit data...</p>
                    </div>
                  </CardContent>
                </Card>
              ) : netProfitData ? (
                <>
                  {/* Main Summary Cards */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {/* Total Revenue */}
                    <Card className="border-emerald-200">
                      <CardContent className="p-3">
                        <p className="text-xs text-emerald-700 mb-1">Total Revenue</p>
                        <p className="text-lg font-bold text-emerald-900">
                          {formatCurrency(netProfitData.sales.revenue)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {netProfitData.items.orders} orders
                        </p>
                      </CardContent>
                    </Card>

                    {/* Product Cost */}
                    <Card className="border-red-200">
                      <CardContent className="p-3">
                        <p className="text-xs text-red-700 mb-1">Product Cost</p>
                        <p className="text-lg font-bold text-red-900">
                          {formatCurrency(netProfitData.sales.productCost)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {netProfitData.items.sold} items
                        </p>
                      </CardContent>
                    </Card>

                    {/* Net from Operations */}
                    <Card className={`border-2 ${netProfitData.sales.netProfitFromOperations >= 0 ? 'border-green-200' : 'border-red-200'}`}>
                      <CardContent className="p-3">
                        <p className="text-xs text-slate-700 mb-1">Net from Ops</p>
                        <p className={`text-lg font-bold ${netProfitData.sales.netProfitFromOperations >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                          {formatCurrency(Math.abs(netProfitData.sales.netProfitFromOperations))}
                        </p>
                        <p className={`text-xs mt-1 ${netProfitData.sales.grossMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {netProfitData.sales.grossMargin.toFixed(1)}% margin
                        </p>
                      </CardContent>
                    </Card>

                    {/* Operational Costs */}
                    <Card className="border-amber-200">
                      <CardContent className="p-3">
                        <p className="text-xs text-amber-700 mb-1">Op. Costs</p>
                        <p className="text-lg font-bold text-amber-900">
                          {formatCurrency(netProfitData.costs.operational)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {netProfitData.costs.entries} entries
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Net Profit/Loss Summary Card */}
                  <Card className={`border-2 mb-4 ${netProfitData.netProfit.isProfitable ? 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50' : 'border-red-300 bg-gradient-to-br from-red-50 to-orange-50'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${netProfitData.netProfit.isProfitable ? 'bg-green-500' : 'bg-red-500'}`}>
                            {netProfitData.netProfit.isProfitable ? (
                              <TrendingUp className="h-5 w-5 text-white" />
                            ) : (
                              <TrendingDown className="h-5 w-5 text-white" />
                            )}
                          </div>
                          <div>
                            <h3 className={`text-lg font-bold ${netProfitData.netProfit.isProfitable ? 'text-green-900' : 'text-red-900'}`}>
                              {netProfitData.netProfit.isProfitable ? 'صافي الربح' : 'صافي الخسارة'}
                            </h3>
                            <p className="text-xs text-slate-600">
                              {getPeriodLabel(netProfitData.period)}
                            </p>
                          </div>
                        </div>
                        <p className={`text-2xl font-bold ${netProfitData.netProfit.isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(Math.abs(netProfitData.netProfit.amount))}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="p-2 bg-white/50 rounded-lg">
                          <p className="text-xs text-slate-600">Net Margin</p>
                          <p className={`text-lg font-bold ${netProfitData.netProfit.isProfitable ? 'text-green-700' : 'text-red-700'}`}>
                            {netProfitData.netProfit.margin.toFixed(1)}%
                          </p>
                        </div>
                        <div className="p-2 bg-white/50 rounded-lg">
                          <p className="text-xs text-slate-600">Formula</p>
                          <p className="text-xs text-slate-800 font-medium mt-1">
                            Sales - Costs
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sales by Category - Collapsible */}
                  {netProfitData.categoryBreakdown.length > 0 && (
                    <Card className="mb-4">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <ShoppingCart className="h-4 w-4 text-emerald-600" />
                          Sales by Category
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {netProfitData.categoryBreakdown.map((cat) => (
                            <div key={cat.category} className="p-3 bg-slate-50 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-slate-700">{cat.category}</span>
                                <span className={`text-sm font-bold ${cat.netFromOperations >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatCurrency(cat.netFromOperations)}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                                <div>
                                  <span className="text-slate-500">Revenue:</span>{' '}
                                  {formatCurrency(cat.revenue)}
                                </div>
                                <div>
                                  <span className="text-slate-500">Orders:</span>{' '}
                                  {cat.orders}
                                </div>
                                <div>
                                  <span className="text-slate-500">Items:</span>{' '}
                                  {cat.itemsSold}
                                </div>
                                <div>
                                  <span className="text-slate-500">Margin:</span>{' '}
                                  <span className={cat.grossMargin >= 0 ? 'text-green-600' : 'text-red-600'}>
                                    {cat.grossMargin.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Costs by Category - Collapsible */}
                  {Object.keys(netProfitData.costs.byCategory).length > 0 && (
                    <Card className="mb-4">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Package className="h-4 w-4 text-emerald-600" />
                          Costs by Category
                        </CardTitle>
                        <CardDescription>
                          Total: {formatCurrency(netProfitData.costs.operational)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(netProfitData.costs.byCategory)
                            .sort((a, b) => b[1] - a[1])
                            .map(([category, amount]) => (
                              <div key={category} className="p-2 bg-slate-50 rounded-lg">
                                <p className="text-xs font-medium text-slate-600 truncate mb-1">{category}</p>
                                <p className="text-base font-bold text-slate-900">{formatCurrency(amount)}</p>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="p-8">
                    <div className="flex flex-col items-center justify-center gap-4">
                      <AlertCircle className="h-12 w-12 text-slate-300" />
                      <p className="text-sm text-slate-600 text-center">
                        No net profit data available for the selected period and branch.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
