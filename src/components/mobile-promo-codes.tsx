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
import { 
  Tag, Plus, Search, Edit, Trash2, X, CheckCircle, 
  XCircle, Calendar, Percent, DollarSign, Check,
  Package, RefreshCw
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

export function MobilePromoCodes() {
  const { user } = useAuth();
  const { currency, t } = useI18n();

  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedPromo, setSelectedPromo] = useState<PromoCode | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    discountType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED_AMOUNT',
    discountValue: 10,
    minOrderAmount: null as number | null,
    maxUsage: null as number | null,
    startDate: '',
    endDate: '',
    isActive: true,
  });

  // Fetch promo codes on mount
  useEffect(() => {
    fetchPromoCodes();
    fetchBranches();
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
          name: formData.description,
          description: '',
          discountType: formData.discountType,
          discountValue: formData.discountValue,
          minOrderAmount: formData.minOrderAmount,
          maxUses: formData.maxUsage,
          startDate: formData.startDate ? new Date(formData.startDate).toISOString() : '',
          endDate: formData.endDate ? new Date(formData.endDate).toISOString() : '',
          isActive: formData.isActive,
          codes: formData.code ? [{ code: formData.code, isSingleUse: false, maxUses: formData.maxUsage }] : [],
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
          name: formData.description,
          description: '',
          discountType: formData.discountType,
          discountValue: formData.discountValue,
          minOrderAmount: formData.minOrderAmount,
          maxUses: formData.maxUsage,
          startDate: formData.startDate ? new Date(formData.startDate).toISOString() : '',
          endDate: formData.endDate ? new Date(formData.endDate).toISOString() : '',
          isActive: formData.isActive,
          codes: formData.code ? [{ code: formData.code, isSingleUse: false, maxUses: formData.maxUsage }] : [],
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
      code: promo.codes && promo.codes.length > 0 ? promo.codes[0].code : '',
      description: promo.name || '',
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      minOrderAmount: promo.minOrderAmount,
      maxUsage: promo.maxUsage,
      startDate: new Date(promo.startDate).toISOString().split('T')[0],
      endDate: new Date(promo.endDate).toISOString().split('T')[0],
      isActive: promo.isActive,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      code: '',
      description: '',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderAmount: null,
      maxUsage: null,
      startDate: '',
      endDate: '',
      isActive: true,
    });
    setSelectedPromo(null);
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
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Promotion Name *</Label>
                <Input
                  id="name"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Summer Sale"
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Promo Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="SUMMER2024"
                  required
                  className="h-11 font-mono text-lg"
                />
                <p className="text-xs text-slate-500">Code will be automatically converted to uppercase</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountType">Discount Type *</Label>
                <Select
                  value={formData.discountType}
                  onValueChange={(value: any) => setFormData({ ...formData, discountType: value })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">
                      <div className="flex items-center gap-2">
                        <Percent className="h-4 w-4" />
                        Percentage
                      </div>
                    </SelectItem>
                    <SelectItem value="FIXED_AMOUNT">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Fixed Amount
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minOrderAmount">Min Order Amount</Label>
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

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label htmlFor="isActive" className="text-base font-medium">Active Status</Label>
                  <p className="text-xs text-slate-500">Enable or disable this promo code</p>
                </div>
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
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
