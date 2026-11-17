'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Coffee, DollarSign, Building2, Layers, Save, X, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  type MenuItem,
  type Category,
  type Branch,
  type MenuItemFormData,
  type BranchPriceEntry,
  emptyMenuItemFormData,
  menuItemToFormData,
  buildBranchPriceEntries,
  createMenuItem,
  updateMenuItem,
} from './menu-shared';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface MenuItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: MenuItem | null;
  categories: Category[];
  branches: Branch[];
  onSaved: () => Promise<void>;
}

export function MenuItemDialog({
  open,
  onOpenChange,
  editingItem,
  categories,
  branches,
  onSaved,
}: MenuItemDialogProps) {
  const [formData, setFormData] = useState<MenuItemFormData>(emptyMenuItemFormData());
  const [saving, setSaving] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  // Initialize form when dialog opens or editingItem changes
  useEffect(() => {
    if (open) {
      if (editingItem) {
        setFormData(menuItemToFormData(editingItem, branches));
      } else {
        const empty = emptyMenuItemFormData();
        empty.branchPrices = buildBranchPriceEntries(branches, undefined);
        setFormData(empty);
      }
    }
  }, [open, editingItem, branches]);

  function update<K extends keyof MenuItemFormData>(key: K, value: MenuItemFormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function updateBranchPrice(branchId: string, patch: Partial<BranchPriceEntry>) {
    setFormData((prev) => ({
      ...prev,
      branchPrices: prev.branchPrices.map((bp) =>
        bp.branchId === branchId ? { ...bp, ...patch } : bp,
      ),
    }));
  }

  function resetBranchPrice(branchId: string) {
    setFormData((prev) => ({
      ...prev,
      branchPrices: prev.branchPrices.map((bp) =>
        bp.branchId === branchId
          ? { ...bp, price: '', isActive: true, isOverridden: false }
          : bp,
      ),
    }));
  }

  function applyPriceToAll(price: string) {
    setFormData((prev) => ({
      ...prev,
      branchPrices: prev.branchPrices.map((bp) => ({
        ...bp,
        price: price,
        isOverridden: price !== '',
      })),
    }));
  }

  function enableAll(active: boolean) {
    setFormData((prev) => ({
      ...prev,
      branchPrices: prev.branchPrices.map((bp) => ({ ...bp, isActive: active })),
    }));
  }

  function handleCategoryChange(categoryId: string) {
    const cat = categories.find((c) => c.id === categoryId);
    setFormData((prev) => ({
      ...prev,
      categoryId: categoryId,
      category: cat?.name || '',
    }));
  }

  async function handleSave() {
    // Validation
    if (!formData.name.trim()) {
      showErrorToast('Validation error', 'Name is required.');
      return;
    }
    if (!formData.price || isNaN(parseFloat(formData.price))) {
      showErrorToast('Validation error', 'A valid global price is required.');
      return;
    }
    if (!formData.categoryId) {
      showErrorToast('Validation error', 'Please select a category.');
      return;
    }

    setSaving(true);
    try {
      const globalPrice = parseFloat(formData.price);

      // Build branchPrices payload — only include branches with overrides or explicit settings
      const branchPricesPayload = formData.branchPrices
        .filter((bp) => {
          // Include if: has price override, OR explicitly disabled, OR EXPLICIT mode (needs row for availability)
          if (bp.price !== '' && bp.price !== null) return true;
          if (!bp.isActive) return true;
          if (formData.availabilityMode === 'EXPLICIT' && bp.isActive) return true;
          return false;
        })
        .map((bp) => ({
          branchId: bp.branchId,
          price: bp.price !== '' && bp.price !== null ? Number(bp.price) : null,
          isActive: bp.isActive,
        }));

      const payload = {
        name: formData.name.trim(),
        category: formData.category,
        categoryId: formData.categoryId,
        price: globalPrice,
        taxRate: parseFloat(formData.taxRate) || 0.14,
        isActive: formData.isActive,
        hasVariants: formData.hasVariants,
        sortOrder: formData.sortOrder ? parseInt(formData.sortOrder) : null,
        imagePath: formData.imagePath || null,
        availabilityMode: formData.availabilityMode,
        branchPrices: branchPricesPayload,
        productCode: formData.productCode || null,
      };

      if (editingItem) {
        await updateMenuItem(editingItem.id, payload);
        showSuccessToast('Updated', `"${payload.name}" has been updated.`);
      } else {
        await createMenuItem(payload);
        showSuccessToast('Created', `"${payload.name}" has been created.`);
      }

      await onSaved();
      onOpenChange(false);
    } catch (e: any) {
      showErrorToast('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open && saving) return; // don't close while saving
    onOpenChange(open);
  }

  const isEditing = !!editingItem;
  const hasOverrides = formData.branchPrices.some((bp) => bp.isOverridden);
  const hasDisabled = formData.branchPrices.some((bp) => !bp.isActive);
  const overridesCount = formData.branchPrices.filter((bp) => bp.isOverridden).length;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5 text-emerald-600" />
              {isEditing ? `Edit: ${editingItem?.name}` : 'New Menu Item'}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="pricing">
                Pricing
              </TabsTrigger>
              <TabsTrigger value="branches">
                Branches
                {hasOverrides && <Badge variant="outline" className="ml-2 text-xs">{overridesCount} override{overridesCount !== 1 ? 's' : ''}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>

            {/* BASIC INFO TAB */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="item-name">Name *</Label>
                  <Input
                    id="item-name"
                    value={formData.name}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="e.g. Cappuccino"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-category">Category *</Label>
                  <Select value={formData.categoryId} onValueChange={handleCategoryChange}>
                    <SelectTrigger id="item-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-sort">Sort Order</Label>
                  <Input
                    id="item-sort"
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => update('sortOrder', e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="item-image">Image URL</Label>
                  <Input
                    id="item-image"
                    value={formData.imagePath}
                    onChange={(e) => update('imagePath', e.target.value)}
                    placeholder="/images/cappuccino.jpg (optional)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-code">Product Code (B2B E-Invoice)</Label>
                  <Input
                    id="item-code"
                    value={formData.productCode}
                    onChange={(e) => update('productCode', e.target.value)}
                    placeholder="Optional — unique barcode/SKU"
                  />
                </div>
                <div className="flex items-end gap-4 pb-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.isActive}
                      onCheckedChange={(v) => update('isActive', v)}
                    />
                    <Label className="text-sm">Active</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.hasVariants}
                      onCheckedChange={(v) => update('hasVariants', v)}
                    />
                    <Label className="text-sm">Has Variants</Label>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* PRICING TAB */}
            <TabsContent value="pricing" className="space-y-4 mt-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-sm font-semibold text-slate-900">Default (Global) Price</h4>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => update('price', e.target.value)}
                    className="w-40 font-mono"
                    placeholder="0.00"
                  />
                  <span className="text-sm text-slate-500">EGP</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  This is the fallback price used by branches that don't have a specific override.
                  Branch-specific prices are configured in the "Branches" tab.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="item-tax">Tax Rate</Label>
                  <Input
                    id="item-tax"
                    type="number"
                    step="0.01"
                    value={formData.taxRate}
                    onChange={(e) => update('taxRate', e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-slate-400">
                    Note: tax is currently calculated at the branch level (Branch.taxEnabled / Branch.taxRate).
                    This field is preserved for future use.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* BRANCHES TAB */}
            <TabsContent value="branches" className="space-y-4 mt-4">
              {/* Availability mode selector */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <Label className="text-sm font-semibold">Availability Mode</Label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                    formData.availabilityMode === 'GLOBAL' ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}>
                    <input
                      type="radio"
                      name="availabilityMode"
                      value="GLOBAL"
                      checked={formData.availabilityMode === 'GLOBAL'}
                      onChange={() => update('availabilityMode', 'GLOBAL')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-900">Available in all branches</div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Item is visible everywhere unless explicitly disabled per branch.
                      </p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                    formData.availabilityMode === 'EXPLICIT' ? 'border-purple-400 bg-purple-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}>
                    <input
                      type="radio"
                      name="availabilityMode"
                      value="EXPLICIT"
                      checked={formData.availabilityMode === 'EXPLICIT'}
                      onChange={() => update('availabilityMode', 'EXPLICIT')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-900">Only in selected branches</div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Item is visible only in branches listed below.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Branch pricing grid */}
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-600" />
                    <h4 className="text-sm font-semibold text-slate-900">Branch Pricing</h4>
                    {hasOverrides && (
                      <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">
                        {overridesCount} price override{overridesCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const price = formData.price;
                        if (price) applyPriceToAll(price);
                      }}
                      className="text-xs"
                    >
                      Apply global to all
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => enableAll(true)} className="text-xs">
                      Enable all
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => enableAll(false)} className="text-xs">
                      Disable all
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-slate-700">Branch</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-700 w-32">Available</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-700 w-40">Price (EGP)</th>
                        <th className="text-left px-4 py-2 font-medium text-slate-700 w-32">Status</th>
                        <th className="text-right px-4 py-2 font-medium text-slate-700 w-20">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formData.branchPrices.map((bp) => (
                        <tr key={bp.branchId} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2 font-medium text-slate-900">{bp.branchName}</td>
                          <td className="px-4 py-2">
                            <Switch
                              checked={bp.isActive}
                              onCheckedChange={(v) => updateBranchPrice(bp.branchId, { isActive: v })}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder={formData.price || 'inherit'}
                              value={bp.price}
                              onChange={(e) => updateBranchPrice(bp.branchId, {
                                price: e.target.value,
                                isOverridden: e.target.value !== '',
                              })}
                              disabled={!bp.isActive}
                              className={`h-8 font-mono text-sm w-36 ${
                                bp.isOverridden
                                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                                  : 'bg-slate-50 text-slate-500'
                              }`}
                            />
                          </td>
                          <td className="px-4 py-2">
                            {bp.isOverridden ? (
                              <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">
                                override
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">
                                inherited
                              </Badge>
                            )}
                            {!bp.isActive && (
                              <Badge variant="outline" className="ml-1 text-xs text-red-700 border-red-300 bg-red-50">
                                disabled
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {bp.isOverridden && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => resetBranchPrice(bp.branchId)}
                                title="Reset to inherited"
                                className="h-7 w-7"
                              >
                                <RotateCcw className="h-3 w-3 text-slate-500" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {hasDisabled && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  <AlertTriangle className="h-3 w-3" />
                  Some branches are disabled. The item won't be available at those branches.
                </div>
              )}
            </TabsContent>

            {/* AUDIT TAB */}
            <TabsContent value="audit" className="space-y-4 mt-4">
              {isEditing && editingItem ? (
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                  <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500">Item ID</span>
                    <span className="font-mono text-xs text-slate-700">{editingItem.id}</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500">Created</span>
                    <span className="text-slate-700">{editingItem.createdAt ? new Date(editingItem.createdAt as any).toLocaleString() : 'N/A'}</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500">Last Updated</span>
                    <span className="text-slate-700">{editingItem.updatedAt ? new Date(editingItem.updatedAt as any).toLocaleString() : 'N/A'}</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500">Version</span>
                    <span className="text-slate-700">{editingItem.version}</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500">Historical Order References</span>
                    <span className="text-slate-700">{editingItem._count?.orderItems ?? 0} order(s)</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500">Branch Assignments</span>
                    <span className="text-slate-700">{editingItem._count?.branchAssignments ?? 0} row(s)</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500">Variants</span>
                    <span className="text-slate-700">{editingItem._count?.variants ?? 0}</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500">Recipes</span>
                    <span className="text-slate-700">{editingItem._count?.recipes ?? 0}</span>
                  </div>
                  {editingItem.deletedAt && (
                    <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
                      <span className="text-slate-500">Archived At</span>
                      <span className="text-red-600">{new Date(editingItem.deletedAt as any).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-slate-500">
                  Audit information will be available after the item is created.
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {isEditing ? 'Save Changes' : 'Create Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
