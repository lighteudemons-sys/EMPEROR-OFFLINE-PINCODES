'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Tag, Plus, Search, Edit, Trash2, X, CheckCircle, 
  XCircle, Calendar, Percent, DollarSign, Check,
  Package, RefreshCw, Gift, ChevronDown, ChevronUp, Layers, Users
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface PromoCode {
  id: string;
  name: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'CATEGORY_PERCENTAGE' | 'CATEGORY_FIXED' | 'BUY_X_GET_Y_FREE';
  discountValue: number;
  minOrderAmount: number | null;
  maxUsage: number | null;
  maxDiscountAmount: number | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  codes: Array<{
    id: string;
    code: string;
    isActive: boolean;
    usageCount: number;
    maxUses: number | null;
  }>;
  _count?: {
    codes: number;
    usageLogs: number;
  };
}

interface Branch {
  id: string;
  branchName: string;
}

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  categoryId: string | null;
  variants?: Array<{
    id: string;
    menuItemId: string;
    priceModifier: number;
    variantType: {
      id: string;
      name: string;
      isCustomInput: boolean;
    };
    variantOption: {
      id: string;
      name: string;
    };
  }>;
}

export function MobilePromoCodes() {
  const { user } = useAuth();
  const { currency, t } = useI18n();

  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedPromo, setSelectedPromo] = useState<PromoCode | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bogoSectionExpanded, setBogoSectionExpanded] = useState(false);
  const [restrictionsSectionExpanded, setRestrictionsSectionExpanded] = useState(false);
  const [advancedSectionExpanded, setAdvancedSectionExpanded] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    discountType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED_AMOUNT' | 'CATEGORY_PERCENTAGE' | 'CATEGORY_FIXED' | 'BUY_X_GET_Y_FREE',
    discountValue: 10,
    categoryId: '',
    minOrderAmount: null as number | null,
    maxUsage: null as number | null,
    usesPerCustomer: null as number | null,
    startDate: '',
    endDate: '',
    isActive: true,
    allowStacking: false,
    maxDiscountAmount: null as number | null,
    // BOGO fields
    buyQuantity: null as number | null,
    getQuantity: null as number | null,
    buyProductId: '' as string | null,
    buyCategoryId: '' as string | null,
    buyProductVariantId: '' as string | null,
    getProductId: '' as string | null,
    getCategoryId: '' as string | null,
    getProductVariantId: '' as string | null,
    applyToCheapest: false,
    // Branch & category restrictions
    branchIds: [] as string[],
    categoryIds: [] as string[],
    // Multiple codes support
    codes: [] as Array<{ code: string; isSingleUse: boolean; maxUses: number | null }>,
  });

  // Fetch data on mount
  useEffect(() => {
    fetchPromoCodes();
    fetchBranches();
    fetchCategories();
    fetchMenuItems();
  }, []);

  // Role-based access control - same as desktop
  const canAccessCustomers = user?.role === 'ADMIN' || user?.role === 'BRANCH_MANAGER';

  // If user cannot access customer features, show access denied
  if (!canAccessCustomers) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <Tag className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-sm text-slate-600">
            {user?.role === 'CASHIER'
              ? 'Cashiers do not have access to promo codes'
              : 'You do not have permission to access this feature'}
          </p>
        </div>
      </div>
    );
  }

  const fetchPromoCodes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('includeCodes', 'true');
      params.append('includeUsage', 'true');

      const response = await fetch(`/api/promotions?${params.toString()}`);
      const data = await response.json();
      if (response.ok && data.promotions) {
        setPromoCodes(data.promotions || []);
      }
    } catch (error) {
      console.error('Failed to fetch promo codes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await fetch('/api/branches');
      const data = await response.json();
      if (response.ok) {
        setBranches(data.branches || []);
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories');
      const data = await response.json();
      if (response.ok) {
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const fetchMenuItems = async () => {
    try {
      const response = await fetch('/api/menu-items?includeVariants=true');
      const data = await response.json();
      if (response.ok) {
        setMenuItems(data.menuItems || []);
      }
    } catch (error) {
      console.error('Failed to fetch menu items:', error);
    }
  };

  const filteredPromoCodes = promoCodes.filter(promo => {
    const matchesSearch = promo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (promo.description || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === 'all' ||
                         (filterStatus === 'active' && promo.isActive) ||
                         (filterStatus === 'inactive' && !promo.isActive);

    return matchesSearch && matchesStatus;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          discountType: formData.discountType,
          discountValue: formData.discountValue,
          categoryId: formData.categoryId || null,
          minOrderAmount: formData.minOrderAmount,
          maxUses: formData.maxUsage,
          usesPerCustomer: formData.usesPerCustomer,
          startDate: formData.startDate ? new Date(formData.startDate).toISOString() : '',
          endDate: formData.endDate ? new Date(formData.endDate).toISOString() : '',
          isActive: formData.isActive,
          allowStacking: formData.allowStacking,
          maxDiscountAmount: formData.maxDiscountAmount,
          // BOGO fields
          buyQuantity: formData.buyQuantity,
          getQuantity: formData.getQuantity,
          buyProductId: formData.buyProductId,
          buyCategoryId: formData.buyCategoryId,
          buyProductVariantId: formData.buyProductVariantId,
          getProductId: formData.getProductId,
          getCategoryId: formData.getCategoryId,
          getProductVariantId: formData.getProductVariantId,
          applyToCheapest: formData.applyToCheapest,
          // Branch & category restrictions
          branchIds: formData.branchIds,
          categoryIds: formData.categoryIds,
          // Codes
          codes: formData.codes.length > 0 ? formData.codes : [],
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', 'Promotion created successfully!');
        setDialogOpen(false);
        resetForm();
        fetchPromoCodes();
      } else {
        showErrorToast('Error', data.error || 'Failed to create promotion');
      }
    } catch (error) {
      console.error('Create promotion error:', error);
      showErrorToast('Error', 'Failed to create promotion');
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const response = await fetch(`/api/promotions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          discountType: formData.discountType,
          discountValue: formData.discountValue,
          categoryId: formData.categoryId || null,
          minOrderAmount: formData.minOrderAmount,
          maxUses: formData.maxUsage,
          usesPerCustomer: formData.usesPerCustomer,
          startDate: formData.startDate ? new Date(formData.startDate).toISOString() : '',
          endDate: formData.endDate ? new Date(formData.endDate).toISOString() : '',
          isActive: formData.isActive,
          allowStacking: formData.allowStacking,
          maxDiscountAmount: formData.maxDiscountAmount,
          // BOGO fields
          buyQuantity: formData.buyQuantity,
          getQuantity: formData.getQuantity,
          buyProductId: formData.buyProductId,
          buyCategoryId: formData.buyCategoryId,
          buyProductVariantId: formData.buyProductVariantId,
          getProductId: formData.getProductId,
          getCategoryId: formData.getCategoryId,
          getProductVariantId: formData.getProductVariantId,
          applyToCheapest: formData.applyToCheapest,
          // Branch & category restrictions
          branchIds: formData.branchIds,
          categoryIds: formData.categoryIds,
          // Codes
          codes: formData.codes.length > 0 ? formData.codes : [],
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', 'Promotion updated successfully!');
        setSelectedPromo(null);
        setDialogOpen(false);
        resetForm();
        fetchPromoCodes();
      } else {
        showErrorToast('Error', data.error || 'Failed to update promotion');
      }
    } catch (error) {
      console.error('Update promotion error:', error);
      showErrorToast('Error', 'Failed to update promotion');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promotion?')) return;

    try {
      const response = await fetch(`/api/promotions/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', 'Promotion deleted successfully!');
        fetchPromoCodes();
      } else {
        showErrorToast('Error', data.error || 'Failed to delete promotion');
      }
    } catch (error) {
      console.error('Delete promotion error:', error);
      showErrorToast('Error', 'Failed to delete promotion');
    }
  };

  const handleToggleActive = async (promo: PromoCode) => {
    try {
      const response = await fetch(`/api/promotions/${promo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...promo,
          isActive: !promo.isActive,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', `Promotion ${promo.isActive ? 'paused' : 'activated'}`);
        fetchPromoCodes();
      } else {
        showErrorToast('Error', data.error || 'Failed to update promotion');
      }
    } catch (error) {
      console.error('Toggle promotion error:', error);
      showErrorToast('Error', 'Failed to update promotion');
    }
  };

  const handleEdit = (promo: PromoCode) => {
    setSelectedPromo(promo);
    setFormData({
      name: promo.name || '',
      description: promo.description || '',
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      categoryId: (promo as any).categoryId || '',
      minOrderAmount: promo.minOrderAmount,
      maxUsage: promo.maxUsage,
      usesPerCustomer: (promo as any).usesPerCustomer || null,
      startDate: new Date(promo.startDate).toISOString().split('T')[0],
      endDate: new Date(promo.endDate).toISOString().split('T')[0],
      isActive: promo.isActive,
      allowStacking: (promo as any).allowStacking || false,
      maxDiscountAmount: promo.maxDiscountAmount || null,
      // BOGO fields
      buyQuantity: (promo as any).buyQuantity || null,
      getQuantity: (promo as any).getQuantity || null,
      buyProductId: (promo as any).buyProductId || null,
      buyCategoryId: (promo as any).buyCategoryId || null,
      buyProductVariantId: (promo as any).buyProductVariantId || null,
      getProductId: (promo as any).getProductId || null,
      getCategoryId: (promo as any).getCategoryId || null,
      getProductVariantId: (promo as any).getProductVariantId || null,
      applyToCheapest: (promo as any).applyToCheapest || false,
      // Branch & category restrictions
      branchIds: ((promo as any).branchRestrictions || []).map((b: any) => b.branchId),
      categoryIds: ((promo as any).categoryRestrictions || []).map((c: any) => c.categoryId),
      // Codes
      codes: (promo.codes || []).map((c: any) => ({
        code: c.code,
        isSingleUse: c.isSingleUse || false,
        maxUses: c.maxUses,
      })),
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      categoryId: '',
      minOrderAmount: null,
      maxUsage: null,
      usesPerCustomer: null,
      startDate: '',
      endDate: '',
      isActive: true,
      allowStacking: false,
      maxDiscountAmount: null,
      // BOGO fields
      buyQuantity: null,
      getQuantity: null,
      buyProductId: null,
      buyCategoryId: null,
      buyProductVariantId: null,
      getProductId: null,
      getCategoryId: null,
      getProductVariantId: null,
      applyToCheapest: false,
      // Branch & category restrictions
      branchIds: [],
      categoryIds: [],
      // Codes
      codes: [],
    });
    setSelectedPromo(null);
    setBogoSectionExpanded(false);
    setRestrictionsSectionExpanded(false);
    setAdvancedSectionExpanded(false);
  };

  // Helper functions for codes management
  const addCode = () => {
    setFormData({
      ...formData,
      codes: [...formData.codes, { code: '', isSingleUse: false, maxUses: null }],
    });
  };

  const removeCode = (index: number) => {
    const newCodes = formData.codes.filter((_, i) => i !== index);
    setFormData({ ...formData, codes: newCodes });
  };

  const updateCode = (index: number, field: string, value: any) => {
    const newCodes = [...formData.codes];
    newCodes[index] = { ...newCodes[index], [field]: value };
    setFormData({ ...formData, codes: newCodes });
  };

  const toggleBranchSelection = (branchId: string) => {
    const newBranchIds = formData.branchIds.includes(branchId)
      ? formData.branchIds.filter(id => id !== branchId)
      : [...formData.branchIds, branchId];
    setFormData({ ...formData, branchIds: newBranchIds });
  };

  const toggleCategorySelection = (categoryId: string) => {
    const newCategoryIds = formData.categoryIds.includes(categoryId)
      ? formData.categoryIds.filter(id => id !== categoryId)
      : [...formData.categoryIds, categoryId];
    setFormData({ ...formData, categoryIds: newCategoryIds });
  };

  const getStatusBadge = (isActive: boolean, endDate: string) => {
    const isExpired = new Date(endDate) < new Date();
    if (isExpired) {
      return (
        <Badge className="bg-slate-100 text-slate-600 border-slate-300">
          <XCircle className="h-3 w-3 mr-1" />
          Expired
        </Badge>
      );
    }
    if (isActive) {
      return (
        <Badge className="bg-green-100 text-green-700 border-green-300">
          <CheckCircle className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-300">
        <XCircle className="h-3 w-3 mr-1" />
        Inactive
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <Tag className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Promo Codes</h1>
            <p className="text-blue-100 text-sm">Manage promotions & codes</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-blue-100 text-xs">Total</p>
              <p className="text-lg font-bold">{promoCodes.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-blue-100 text-xs">Active</p>
              <p className="text-lg font-bold">{promoCodes.filter(p => p.isActive).length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-blue-100 text-xs">Codes</p>
              <p className="text-lg font-bold">{promoCodes.reduce((sum, p) => sum + (p.codes?.length || 0), 0)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Branch Selector */}
        <MobileBranchSelector />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Search by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          <Button
            variant={filterStatus === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('all')}
            className="flex-1 h-11"
          >
            All
          </Button>
          <Button
            variant={filterStatus === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('active')}
            className="flex-1 h-11"
          >
            Active
          </Button>
          <Button
            variant={filterStatus === 'inactive' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('inactive')}
            className="flex-1 h-11"
          >
            Inactive
          </Button>
        </div>

        {/* Add Button */}
        <Button
          onClick={() => { resetForm(); setDialogOpen(true); }}
          className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Promotion
        </Button>

        {/* Promo Codes List */}
        <ScrollArea className="h-[calc(100vh-450px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full mb-3" />
              <p>Loading promotions...</p>
            </div>
          ) : filteredPromoCodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Tag className="w-16 h-16 mb-4 text-slate-300" />
              <p className="font-medium">No promotions found</p>
              <p className="text-sm">Add your first promotion to get started</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {filteredPromoCodes.map((promo) => (
                <Card key={promo.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Tag className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-slate-900 text-lg">{promo.name}</h3>
                            {getStatusBadge(promo.isActive, promo.endDate)}
                          </div>
                          {promo.description && (
                            <p className="text-sm text-slate-600 mt-1">{promo.description}</p>
                          )}
                          {promo.codes && promo.codes.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {promo.codes.slice(0, 3).map((code) => (
                                <Badge key={code.id} variant="outline" className="text-xs font-mono">
                                  {code.code}
                                </Badge>
                              ))}
                              {promo.codes.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{promo.codes.length - 3} more
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Discount Info */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                        {promo.discountType.includes('PERCENTAGE') ? (
                          <Percent className="h-4 w-4 text-blue-600 flex-shrink-0" />
                        ) : (
                          <DollarSign className="h-4 w-4 text-blue-600 flex-shrink-0" />
                        )}
                        <div>
                          <p className="text-xs text-slate-500">Discount</p>
                          <p className="font-semibold text-slate-900">
                            {promo.discountType.includes('PERCENTAGE')
                              ? `${promo.discountValue}%`
                              : `${currency} ${promo.discountValue.toFixed(2)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                        <Package className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-slate-500">Usage</p>
                          <p className="font-semibold text-slate-900">
                            {promo._count?.usageLogs || 0}/{promo.maxUsage || '∞'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="flex items-center gap-2 text-sm text-slate-600 mb-3 p-2 bg-slate-50 rounded-lg">
                      <Calendar className="h-4 w-4 flex-shrink-0" />
                      <span className="text-xs text-slate-500">
                        {new Date(promo.startDate).toLocaleDateString()} - {new Date(promo.endDate).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Min Order Amount */}
                    {promo.minOrderAmount && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 mb-3 p-2 bg-slate-50 rounded-lg">
                        <DollarSign className="h-4 w-4 flex-shrink-0" />
                        <span className="text-xs text-slate-500">
                          Min order: {currency} {promo.minOrderAmount.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(promo)}
                        className="flex-1 h-11"
                      >
                        {promo.isActive ? (
                          <>
                            <XCircle className="h-4 w-4 mr-1" />
                            Pause
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Activate
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(promo)}
                        className="flex-1 h-11"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(promo.id)}
                        className="h-11 px-4"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Promo Code Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPromo ? 'Edit Promotion' : 'Add New Promotion'}</DialogTitle>
            <DialogDescription>
              {selectedPromo ? 'Update promotion details' : 'Enter promotion details to create a new discount promotion'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={selectedPromo ? (e) => { e.preventDefault(); handleUpdate(selectedPromo.id); } : handleSubmit}>
            <ScrollArea className="max-h-[65vh] pr-4">
              <div className="space-y-4 py-4">
                {/* Basic Information */}
                <div className="space-y-2">
                  <Label htmlFor="name">Promotion Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Summer Sale"
                    required
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the promotion..."
                    rows={2}
                    className="resize-none"
                  />
                </div>

                {/* Discount Type */}
                <div className="space-y-2">
                  <Label htmlFor="discountType">Discount Type *</Label>
                  <Select
                    value={formData.discountType}
                    onValueChange={(value: any) => {
                      setFormData({ ...formData, discountType: value });
                      if (value === 'BUY_X_GET_Y_FREE') {
                        setBogoSectionExpanded(true);
                      }
                    }}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">
                        <div className="flex items-center gap-2">
                          <Percent className="h-4 w-4" />
                          <div>
                            <p className="font-medium">Percentage</p>
                            <p className="text-xs text-slate-500">Discount by %</p>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="FIXED_AMOUNT">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          <div>
                            <p className="font-medium">Fixed Amount</p>
                            <p className="text-xs text-slate-500">Discount by fixed amount</p>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="CATEGORY_PERCENTAGE">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          <div>
                            <p className="font-medium">Category %</p>
                            <p className="text-xs text-slate-500">Discount specific category by %</p>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="CATEGORY_FIXED">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          <div>
                            <p className="font-medium">Category Fixed</p>
                            <p className="text-xs text-slate-500">Discount specific category by amount</p>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="BUY_X_GET_Y_FREE">
                        <div className="flex items-center gap-2">
                          <Gift className="h-4 w-4" />
                          <div>
                            <p className="font-medium">Buy X Get Y Free</p>
                            <p className="text-xs text-slate-500">BOGO promotion</p>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Category selection for category-based discounts */}
                {(formData.discountType === 'CATEGORY_PERCENTAGE' || formData.discountType === 'CATEGORY_FIXED') && (
                  <div className="space-y-2">
                    <Label htmlFor="categoryId">Category *</Label>
                    <Select
                      value={formData.categoryId}
                      onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Discount Value */}
                <div className="space-y-2">
                  <Label htmlFor="discountValue">
                    {formData.discountType.includes('PERCENTAGE') ? 'Discount Percentage *' : 'Discount Amount *'}
                  </Label>
                  <div className="relative">
                    {formData.discountType.includes('PERCENTAGE') ? (
                      <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    ) : (
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    )}
                    <Input
                      id="discountValue"
                      type="number"
                      step={formData.discountType.includes('PERCENTAGE') ? '1' : '0.01'}
                      min="0"
                      max={formData.discountType.includes('PERCENTAGE') ? '100' : undefined}
                      value={formData.discountValue}
                      onChange={(e) => setFormData({ ...formData, discountValue: parseFloat(e.target.value) || 0 })}
                      required
                      className="h-11 pl-10"
                    />
                    {formData.discountType.includes('PERCENTAGE') && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>
                    )}
                  </div>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date *</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      required
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      required
                      className="h-11"
                    />
                  </div>
                </div>

                {/* Order Limits */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minOrderAmount">Min Order</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="minOrderAmount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.minOrderAmount || ''}
                        onChange={(e) => setFormData({ ...formData, minOrderAmount: parseFloat(e.target.value) || null })}
                        placeholder="Optional"
                        className="h-11 pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxUsage">Max Usage</Label>
                    <Input
                      id="maxUsage"
                      type="number"
                      min="1"
                      value={formData.maxUsage || ''}
                      onChange={(e) => setFormData({ ...formData, maxUsage: parseInt(e.target.value) || null })}
                      placeholder="Unlimited"
                      className="h-11"
                    />
                  </div>
                </div>

                {/* Advanced Settings - Collapsible */}
                <div className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAdvancedSectionExpanded(!advancedSectionExpanded)}
                    className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-slate-600" />
                      <span className="font-medium text-sm">Advanced Settings</span>
                    </div>
                    {advancedSectionExpanded ? (
                      <ChevronUp className="h-4 w-4 text-slate-600" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-600" />
                    )}
                  </button>
                  {advancedSectionExpanded && (
                    <div className="p-3 space-y-4 border-t">
                      {/* Allow Stacking */}
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="allowStacking" className="text-sm">Allow Stacking</Label>
                          <p className="text-xs text-slate-500">Combine with other discounts</p>
                        </div>
                        <Switch
                          id="allowStacking"
                          checked={formData.allowStacking}
                          onCheckedChange={(checked) => setFormData({ ...formData, allowStacking: checked })}
                        />
                      </div>

                      {/* Uses Per Customer */}
                      <div className="space-y-2">
                        <Label htmlFor="usesPerCustomer" className="text-sm">Uses Per Customer</Label>
                        <Input
                          id="usesPerCustomer"
                          type="number"
                          min="1"
                          value={formData.usesPerCustomer || ''}
                          onChange={(e) => setFormData({ ...formData, usesPerCustomer: parseInt(e.target.value) || null })}
                          placeholder="Unlimited"
                          className="h-10"
                        />
                        <p className="text-xs text-slate-500">Limit how many times a customer can use this</p>
                      </div>

                      {/* Max Discount Amount */}
                      <div className="space-y-2">
                        <Label htmlFor="maxDiscountAmount" className="text-sm">Max Discount Amount</Label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input
                            id="maxDiscountAmount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.maxDiscountAmount || ''}
                            onChange={(e) => setFormData({ ...formData, maxDiscountAmount: parseFloat(e.target.value) || null })}
                            placeholder="No limit"
                            className="h-10 pl-10"
                          />
                        </div>
                        <p className="text-xs text-slate-500">Maximum discount that can be applied</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* BOGO Settings - Only for BUY_X_GET_Y_FREE */}
                {formData.discountType === 'BUY_X_GET_Y_FREE' && (
                  <div className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setBogoSectionExpanded(!bogoSectionExpanded)}
                      className="w-full flex items-center justify-between p-3 bg-purple-50 hover:bg-purple-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-purple-600" />
                        <span className="font-medium text-sm">BOGO Settings</span>
                      </div>
                      {bogoSectionExpanded ? (
                        <ChevronUp className="h-4 w-4 text-purple-600" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-purple-600" />
                      )}
                    </button>
                    {bogoSectionExpanded && (
                      <div className="p-3 space-y-4 border-t">
                        {/* Buy Quantity */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="buyQuantity" className="text-sm">Buy Quantity *</Label>
                            <Input
                              id="buyQuantity"
                              type="number"
                              min="1"
                              value={formData.buyQuantity || ''}
                              onChange={(e) => setFormData({ ...formData, buyQuantity: parseInt(e.target.value) || null })}
                              placeholder="e.g., 1"
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="getQuantity" className="text-sm">Get Quantity *</Label>
                            <Input
                              id="getQuantity"
                              type="number"
                              min="1"
                              value={formData.getQuantity || ''}
                              onChange={(e) => setFormData({ ...formData, getQuantity: parseInt(e.target.value) || null })}
                              placeholder="e.g., 1"
                              className="h-10"
                            />
                          </div>
                        </div>

                        {/* Buy Product/Category */}
                        <div className="space-y-2">
                          <Label className="text-sm">Buy From (Product or Category)</Label>
                          <Select
                            value={formData.buyProductId || formData.buyCategoryId || ''}
                            onValueChange={(value) => {
                              const menuItem = menuItems.find(m => m.id === value);
                              if (menuItem) {
                                setFormData({ ...formData, buyProductId: value, buyCategoryId: null });
                              } else {
                                setFormData({ ...formData, buyCategoryId: value, buyProductId: null });
                              }
                            }}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Select product or leave empty for all" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">All Products</SelectItem>
                              <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">Products</div>
                              {menuItems.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.name}
                                </SelectItem>
                              ))}
                              <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 mt-2">Categories</div>
                              {categories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  Category: {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Get Product/Category */}
                        <div className="space-y-2">
                          <Label className="text-sm">Get From (Product or Category)</Label>
                          <Select
                            value={formData.getProductId || formData.getCategoryId || ''}
                            onValueChange={(value) => {
                              const menuItem = menuItems.find(m => m.id === value);
                              if (menuItem) {
                                setFormData({ ...formData, getProductId: value, getCategoryId: null });
                              } else {
                                setFormData({ ...formData, getCategoryId: value, getProductId: null });
                              }
                            }}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Select product or leave empty for all" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">All Products</SelectItem>
                              <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">Products</div>
                              {menuItems.map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.name}
                                </SelectItem>
                              ))}
                              <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 mt-2">Categories</div>
                              {categories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  Category: {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Apply to Cheapest */}
                        <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                          <div>
                            <Label htmlFor="applyToCheapest" className="text-sm font-medium">Apply to Cheapest</Label>
                            <p className="text-xs text-slate-500">Apply discount to cheapest eligible item</p>
                          </div>
                          <Switch
                            id="applyToCheapest"
                            checked={formData.applyToCheapest}
                            onCheckedChange={(checked) => setFormData({ ...formData, applyToCheapest: checked })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Restrictions - Branch & Category */}
                <div className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setRestrictionsSectionExpanded(!restrictionsSectionExpanded)}
                    className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-slate-600" />
                      <span className="font-medium text-sm">Restrictions</span>
                    </div>
                    {restrictionsSectionExpanded ? (
                      <ChevronUp className="h-4 w-4 text-slate-600" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-600" />
                    )}
                  </button>
                  {restrictionsSectionExpanded && (
                    <div className="p-3 space-y-4 border-t">
                      {/* Branch Restrictions */}
                      <div className="space-y-2">
                        <Label className="text-sm">Branch Restrictions</Label>
                        <p className="text-xs text-slate-500">Leave empty for all branches</p>
                        <div className="grid grid-cols-2 gap-2">
                          {branches.map((branch) => (
                            <label
                              key={branch.id}
                              className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-slate-50"
                            >
                              <Checkbox
                                checked={formData.branchIds.includes(branch.id)}
                                onCheckedChange={() => toggleBranchSelection(branch.id)}
                              />
                              <span className="text-xs font-medium">{branch.branchName}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Category Restrictions */}
                      <div className="space-y-2">
                        <Label className="text-sm">Category Restrictions</Label>
                        <p className="text-xs text-slate-500">Leave empty for all categories</p>
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                          {categories.map((category) => (
                            <label
                              key={category.id}
                              className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-slate-50"
                            >
                              <Checkbox
                                checked={formData.categoryIds.includes(category.id)}
                                onCheckedChange={() => toggleCategorySelection(category.id)}
                              />
                              <span className="text-xs font-medium">{category.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Promo Codes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Promo Codes</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addCode}
                      className="h-8"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Code
                    </Button>
                  </div>
                  {formData.codes.length === 0 ? (
                    <p className="text-xs text-slate-500 p-2 bg-slate-50 rounded text-center">
                      No codes added. Click "Add Code" to create promo codes.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {formData.codes.map((codeObj, index) => (
                        <div key={index} className="flex gap-2 items-start">
                          <div className="flex-1 space-y-2">
                            <Input
                              value={codeObj.code}
                              onChange={(e) => updateCode(index, 'code', e.target.value.toUpperCase())}
                              placeholder="CODE"
                              className="h-9 font-mono text-sm"
                            />
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                min="1"
                                value={codeObj.maxUses || ''}
                                onChange={(e) => updateCode(index, 'maxUses', parseInt(e.target.value) || null)}
                                placeholder="Max uses"
                                className="h-9 text-xs"
                              />
                              <label className="flex items-center gap-1 p-1 border rounded cursor-pointer">
                                <Checkbox
                                  checked={codeObj.isSingleUse}
                                  onCheckedChange={(checked) => updateCode(index, 'isSingleUse', checked)}
                                  className="h-4 w-4"
                                />
                                <span className="text-xs">Single use</span>
                              </label>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCode(index)}
                            className="h-9 w-9 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Status */}
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <Label htmlFor="isActive" className="text-base font-medium">Active Status</Label>
                    <p className="text-xs text-slate-500">Enable or disable this promotion</p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                </div>
              </div>
            </ScrollArea>
            <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setDialogOpen(false); resetForm(); }}
                className="w-full sm:w-auto h-11"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto h-11 bg-blue-600 hover:bg-blue-700"
              >
                {selectedPromo ? 'Update Promotion' : 'Create Promotion'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
