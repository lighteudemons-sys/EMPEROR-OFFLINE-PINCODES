'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, RefreshCw, Edit, Archive, Loader2, Sparkles } from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

// ============================================================
// Types — mirror /api/loyalty/promotions response shape
// ============================================================

interface EarnBranchRef {
  branchId: string;
  branch: { branchName: string };
}
interface RedeemBranchRef extends EarnBranchRef {}
interface ProductRef {
  menuItemId: string;
  menuItem?: { name: string };
}
interface CategoryRef {
  categoryId: string;
  category?: { name: string };
}

interface Promotion {
  id: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'SCHEDULED' | 'EXPIRED' | 'ARCHIVED';
  startDate: string;
  endDate: string | null;
  earningMethod: 'PER_VISIT' | 'PER_ITEM' | 'PER_QUANTITY' | 'PER_AMOUNT';
  earningValue: string | number;
  stampsRequired: number;
  maxEarnPerOrder: number | null;
  maxEarnPerDay: number | null;
  rewardType: 'FREE_ITEM' | 'DISCOUNT_PERCENT' | 'DISCOUNT_FIXED' | 'FREE_PRODUCT' | 'POINTS_BONUS';
  rewardValue: string | number | null;
  rewardProductId: string | null;
  rewardCategoryId: string | null;
  rewardExpiresInDays: number | null;
  minPurchaseAmount: string | number | null;
  overlapRule: 'EXCLUSIVE' | 'SHARED' | 'PRIORITY';
  priority: number;
  isActive: boolean;
  currentVersion: number;
  createdAt: string;
  earnBranches: EarnBranchRef[];
  redeemBranches: RedeemBranchRef[];
  productRestrictions: ProductRef[];
  categoryRestrictions: CategoryRef[];
  _count?: { enrollments: number };
}

interface Branch {
  id: string;
  branchName: string;
}
interface MenuItem {
  id: string;
  name: string;
}
interface Category {
  id: string;
  name: string;
}

// ============================================================
// Constants
// ============================================================

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  PAUSED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  SCHEDULED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  EXPIRED: 'bg-slate-200 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400',
  ARCHIVED: 'bg-slate-200 text-slate-500 dark:bg-slate-800/60 dark:text-slate-500',
};

const OVERLAP_COLORS: Record<string, string> = {
  EXCLUSIVE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  PRIORITY: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  SHARED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

const EARNING_METHOD_LABEL: Record<string, string> = {
  PER_VISIT: 'Per Visit',
  PER_ITEM: 'Per Item',
  PER_QUANTITY: 'Per Unit',
  PER_AMOUNT: 'Per EGP',
};

const REWARD_TYPE_LABEL: Record<string, string> = {
  FREE_ITEM: 'Free Item',
  FREE_PRODUCT: 'Free Product',
  DISCOUNT_PERCENT: '% Discount',
  DISCOUNT_FIXED: 'Fixed Discount',
  POINTS_BONUS: 'Points Bonus',
};

// ============================================================
// Empty form
// ============================================================

function emptyForm() {
  return {
    name: '',
    description: '',
    status: 'SCHEDULED' as const,
    startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), // tomorrow
    endDate: '',
    earningMethod: 'PER_ITEM' as const,
    earningValue: '1',
    stampsRequired: 10,
    maxEarnPerOrder: '',
    maxEarnPerDay: '',
    rewardType: 'FREE_ITEM' as const,
    rewardValue: '',
    rewardProductId: '',
    rewardCategoryId: '',
    rewardExpiresInDays: '',
    minPurchaseAmount: '',
    overlapRule: 'SHARED' as const,
    priority: 0,
    isActive: true,
    earnBranchIds: [] as string[],
    redeemBranchIds: [] as string[],
    productIds: [] as string[],
    categoryIds: [] as string[],
  };
}

// ============================================================
// Component
// ============================================================

export default function LoyaltyPromotionsManagement() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/loyalty/promotions?pageSize=100', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPromotions(data.promotions || []);
    } catch (err) {
      console.error('[LoyaltyPromoMgmt] load failed:', err);
      showErrorToast('Failed to load promotions', '');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAux = useCallback(async () => {
    try {
      const [bRes, mRes, cRes] = await Promise.all([
        fetch('/api/branches', { cache: 'no-store' }),
        fetch('/api/menu-items?includeArchived=false&pageSize=200', { cache: 'no-store' }),
        fetch('/api/categories', { cache: 'no-store' }),
      ]);
      if (bRes.ok) {
        const data = await bRes.json();
        const list = data.branches || data;
        setBranches(Array.isArray(list) ? list : []);
      }
      if (mRes.ok) {
        const data = await mRes.json();
        const list = data.menuItems || data.items || [];
        setMenuItems(Array.isArray(list) ? list : []);
      }
      if (cRes.ok) {
        const data = await cRes.json();
        const list = data.categories || [];
        setCategories(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      console.error('[LoyaltyPromoMgmt] aux load failed:', err);
    }
  }, []);

  useEffect(() => {
    load();
    loadAux();
  }, [load, loadAux]);

  const handleOpenNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const handleOpenEdit = (p: Promotion) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description || '',
      status: p.status as any,
      startDate: p.startDate ? new Date(p.startDate).toISOString().slice(0, 10) : '',
      endDate: p.endDate ? new Date(p.endDate).toISOString().slice(0, 10) : '',
      earningMethod: p.earningMethod as any,
      earningValue: String(p.earningValue),
      stampsRequired: p.stampsRequired,
      maxEarnPerOrder: p.maxEarnPerOrder ? String(p.maxEarnPerOrder) : '',
      maxEarnPerDay: p.maxEarnPerDay ? String(p.maxEarnPerDay) : '',
      rewardType: p.rewardType as any,
      rewardValue: p.rewardValue != null ? String(p.rewardValue) : '',
      rewardProductId: p.rewardProductId || '',
      rewardCategoryId: p.rewardCategoryId || '',
      rewardExpiresInDays: p.rewardExpiresInDays ? String(p.rewardExpiresInDays) : '',
      minPurchaseAmount: p.minPurchaseAmount != null ? String(p.minPurchaseAmount) : '',
      overlapRule: p.overlapRule as any,
      priority: p.priority,
      isActive: p.isActive,
      earnBranchIds: p.earnBranches.map((b) => b.branchId),
      redeemBranchIds: p.redeemBranches.map((b) => b.branchId),
      productIds: p.productRestrictions.map((p) => p.menuItemId),
      categoryIds: p.categoryRestrictions.map((c) => c.categoryId),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      showErrorToast('Validation error', 'Name is required');
      return;
    }
    if (!form.stampsRequired || form.stampsRequired <= 0) {
      showErrorToast('Validation error', 'Stamps required must be positive');
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        startDate: new Date(form.startDate).toISOString(),
        endDate: form.endDate ? new Date(form.endDate + 'T23:59:59').toISOString() : null,
        earningMethod: form.earningMethod,
        earningValue: form.earningValue,
        stampsRequired: Number(form.stampsRequired),
        maxEarnPerOrder: form.maxEarnPerOrder ? Number(form.maxEarnPerOrder) : null,
        maxEarnPerDay: form.maxEarnPerDay ? Number(form.maxEarnPerDay) : null,
        rewardType: form.rewardType,
        rewardValue: form.rewardValue ? form.rewardValue : null,
        rewardProductId: form.rewardProductId || null,
        rewardCategoryId: form.rewardCategoryId || null,
        rewardExpiresInDays: form.rewardExpiresInDays ? Number(form.rewardExpiresInDays) : null,
        minPurchaseAmount: form.minPurchaseAmount ? form.minPurchaseAmount : null,
        overlapRule: form.overlapRule,
        priority: Number(form.priority),
        isActive: form.isActive,
        earnBranchIds: form.earnBranchIds,
        redeemBranchIds: form.redeemBranchIds,
        productIds: form.productIds,
        categoryIds: form.categoryIds,
      };

      const url = editing
        ? `/api/loyalty/promotions/${editing.id}`
        : '/api/loyalty/promotions';
      const method = editing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      showSuccessToast(
        editing ? 'Promotion updated' : 'Promotion created',
        form.name
      );
      setDialogOpen(false);
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      showErrorToast('Save failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (p: Promotion) => {
    if (!confirm(`Archive promotion "${p.name}"? It will stop earning immediately.`)) return;
    try {
      const res = await fetch(`/api/loyalty/promotions/${p.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showSuccessToast('Promotion archived', p.name);
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Archive failed';
      showErrorToast('Archive failed', msg);
    }
  };

  const toggleBranch = (key: 'earnBranchIds' | 'redeemBranchIds', id: string) => {
    setForm((prev) => {
      const list = prev[key];
      return {
        ...prev,
        [key]: list.includes(id) ? list.filter((b) => b !== id) : [...list, id],
      };
    });
  };

  const toggleIdList = (key: 'productIds' | 'categoryIds', id: string) => {
    setForm((prev) => {
      const list = prev[key];
      return {
        ...prev,
        [key]: list.includes(id) ? list.filter((b) => b !== id) : [...list, id],
      };
    });
  };

  const filtered = promotions.filter((p) =>
    !search.trim() ? true : p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            Loyalty Promotions
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Create stamp-based promotions and rewards. Each save creates an immutable version
            snapshot for offline validation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenNew}>
            <Plus className="h-4 w-4 mr-1" />
            New Promotion
          </Button>
        </div>
      </div>

      <Input
        placeholder="Search promotions by name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Earning</TableHead>
                <TableHead>Reward</TableHead>
                <TableHead>Overlap</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead>Version</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                    No promotions yet. Click &quot;New Promotion&quot; to create one.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.name}
                      {p.description && (
                        <p className="text-xs text-slate-500 line-clamp-1">{p.description}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[p.status] || STATUS_COLORS.SCHEDULED}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {EARNING_METHOD_LABEL[p.earningMethod]} × {String(p.earningValue)}
                      <br />
                      <span className="text-slate-400">/ {p.stampsRequired} stamps</span>
                    </TableCell>
                    <TableCell className="text-xs">{REWARD_TYPE_LABEL[p.rewardType]}</TableCell>
                    <TableCell>
                      <Badge className={OVERLAP_COLORS[p.overlapRule]} variant="outline">
                        {p.overlapRule}
                        {p.priority !== 0 && ` · ${p.priority}`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{p._count?.enrollments || 0}</TableCell>
                    <TableCell className="text-xs text-slate-500">v{p.currentVersion}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleOpenEdit(p)}
                          title="Edit"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleArchive(p)}
                          title="Archive"
                          disabled={p.status === 'ARCHIVED'}
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Promotion' : 'New Promotion'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Editing "${editing.name}". Changing config fields creates a new version snapshot.`
                : 'Configure the earning rules, reward, and branch eligibility for this promotion.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Basics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Buy 10 Coffees Get 1 Free"
                />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="PAUSED">Paused</SelectItem>
                    <SelectItem value="EXPIRED">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional — shown to customer in portal"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start Date *</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">End Date (optional)</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>

            {/* Earning */}
            <div className="border-t pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-2">
                Earning Rules
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Method</Label>
                  <Select
                    value={form.earningMethod}
                    onValueChange={(v) => setForm({ ...form, earningMethod: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PER_VISIT">Per Visit</SelectItem>
                      <SelectItem value="PER_ITEM">Per Item</SelectItem>
                      <SelectItem value="PER_QUANTITY">Per Quantity</SelectItem>
                      <SelectItem value="PER_AMOUNT">Per Amount (EGP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Earning Value</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={form.earningValue}
                    onChange={(e) => setForm({ ...form, earningValue: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Stamps Required</Label>
                  <Input
                    type="number"
                    value={form.stampsRequired}
                    onChange={(e) =>
                      setForm({ ...form, stampsRequired: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Max / Order</Label>
                  <Input
                    type="number"
                    placeholder="—"
                    value={form.maxEarnPerOrder}
                    onChange={(e) => setForm({ ...form, maxEarnPerOrder: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="text-xs">Max / Day</Label>
                  <Input
                    type="number"
                    placeholder="—"
                    value={form.maxEarnPerDay}
                    onChange={(e) => setForm({ ...form, maxEarnPerDay: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Min Purchase (EGP)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="—"
                    value={form.minPurchaseAmount}
                    onChange={(e) => setForm({ ...form, minPurchaseAmount: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Reward */}
            <div className="border-t pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-2">
                Reward
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Reward Type</Label>
                  <Select
                    value={form.rewardType}
                    onValueChange={(v) => setForm({ ...form, rewardType: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FREE_ITEM">Free Item</SelectItem>
                      <SelectItem value="FREE_PRODUCT">Free Product</SelectItem>
                      <SelectItem value="DISCOUNT_PERCENT">% Discount</SelectItem>
                      <SelectItem value="DISCOUNT_FIXED">Fixed Discount</SelectItem>
                      <SelectItem value="POINTS_BONUS">Points Bonus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Reward Value</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="—"
                    value={form.rewardValue}
                    onChange={(e) => setForm({ ...form, rewardValue: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Reward Expiry (days)</Label>
                  <Input
                    type="number"
                    placeholder="—"
                    value={form.rewardExpiresInDays}
                    onChange={(e) =>
                      setForm({ ...form, rewardExpiresInDays: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="text-xs">Reward Product (optional)</Label>
                  <Select
                    value={form.rewardProductId || 'none'}
                    onValueChange={(v) =>
                      setForm({ ...form, rewardProductId: v === 'none' ? '' : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {menuItems.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Reward Category (optional)</Label>
                  <Select
                    value={form.rewardCategoryId || 'none'}
                    onValueChange={(v) =>
                      setForm({ ...form, rewardCategoryId: v === 'none' ? '' : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Overlap */}
            <div className="border-t pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-purple-700 dark:text-purple-300 mb-2">
                Overlap Behavior
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Overlap Rule</Label>
                  <Select
                    value={form.overlapRule}
                    onValueChange={(v) => setForm({ ...form, overlapRule: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SHARED">Shared — earn alongside others</SelectItem>
                      <SelectItem value="PRIORITY">Priority — wins over Shared</SelectItem>
                      <SelectItem value="EXCLUSIVE">Exclusive — claims product</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-end pb-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                    />
                    <Label className="text-xs">Active</Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Branch + product restrictions */}
            <div className="border-t pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300 mb-2">
                Eligibility
              </p>
              <p className="text-[11px] text-slate-500 mb-2">
                Leave empty to allow all branches / all products / all categories.
              </p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Earn Branches</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {branches.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleBranch('earnBranchIds', b.id)}
                        className={`text-xs px-2 py-1 rounded border ${
                          form.earnBranchIds.includes(b.id)
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {b.branchName}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Redeem Branches</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {branches.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleBranch('redeemBranchIds', b.id)}
                        className={`text-xs px-2 py-1 rounded border ${
                          form.redeemBranchIds.includes(b.id)
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {b.branchName}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Qualifying Products</Label>
                  <p className="text-[11px] text-slate-500 mb-1">
                    Empty = all products qualify. Use for product-specific promotions.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1 max-h-32 overflow-y-auto">
                    {menuItems.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleIdList('productIds', m.id)}
                        className={`text-[11px] px-1.5 py-0.5 rounded border ${
                          form.productIds.includes(m.id)
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Qualifying Categories</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleIdList('categoryIds', c.id)}
                        className={`text-[11px] px-1.5 py-0.5 rounded border ${
                          form.categoryIds.includes(c.id)
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : editing ? (
                'Save Changes'
              ) : (
                'Create Promotion'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
