'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Coffee, DollarSign, Building2, Save, X, Loader2, RotateCcw, AlertTriangle, Layers, Plus, Trash2 } from 'lucide-react';
import {
  type MenuItem,
  type Category,
  type Branch,
  type VariantType,
  type MenuItemVariant,
  type MenuItemFormData,
  type BranchPriceEntry,
  emptyMenuItemFormData,
  menuItemToFormData,
  buildBranchPriceEntries,
  createMenuItem,
  updateMenuItem,
  fetchVariantTypes,
  fetchMenuItemVariants,
  createMenuItemVariant,
  updateMenuItemVariant,
  deleteMenuItemVariant,
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

interface ItemVariantRow {
  id?: string; // existing variant ID (if editing); undefined if new
  variantOptionId: string;
  priceModifier: string;
  sortOrder: number;
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
  const [variantTypes, setVariantTypes] = useState<VariantType[]>([]);
  const [selectedVariantType, setSelectedVariantType] = useState<string>('');
  const [itemVariants, setItemVariants] = useState<ItemVariantRow[]>([]);

  // Load variant types when the dialog opens
  useEffect(() => {
    if (open) {
      fetchVariantTypes()
        .then((vts) => setVariantTypes(vts))
        .catch((e) => console.error('Failed to load variant types:', e));
    }
  }, [open]);

  // Initialize form when dialog opens or editingItem changes
  useEffect(() => {
    if (open) {
      if (editingItem) {
        setFormData(menuItemToFormData(editingItem, branches));
        // Load existing variants for this item
        fetchMenuItemVariants(editingItem.id)
          .then((vs) => {
            setItemVariants(
              vs.map((v) => ({
                id: v.id,
                variantOptionId: v.variantOptionId,
                priceModifier: v.priceModifier.toString(),
                sortOrder: v.sortOrder,
              })),
            );
            if (vs.length > 0) setSelectedVariantType(vs[0].variantTypeId);
          })
          .catch((e) => console.error('Failed to load item variants:', e));
      } else {
        const empty = emptyMenuItemFormData();
        empty.branchPrices = buildBranchPriceEntries(branches, undefined);
        setFormData(empty);
        setItemVariants([]);
        setSelectedVariantType('');
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

  // ---- Variant rows handlers ----

  function handleAddVariantRow() {
    if (!selectedVariantType) {
      showErrorToast('Select a variant type first', 'Choose a variant type (e.g. Size) before adding rows.');
      return;
    }
    setItemVariants((prev) => [
      ...prev,
      { variantOptionId: '', priceModifier: '0', sortOrder: prev.length },
    ]);
  }

  function handleRemoveVariantRow(index: number) {
    setItemVariants((prev) => prev.filter((_, i) => i !== index));
  }

  function handleVariantRowChange(index: number, field: keyof ItemVariantRow, value: string | number) {
    setItemVariants((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function getVariantFinalPrice(modifier: string): string {
    const base = parseFloat(formData.price) || 0;
    const mod = parseFloat(modifier) || 0;
    return (base + mod).toFixed(2);
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
    if (formData.hasVariants && !selectedVariantType) {
      showErrorToast('Validation error', 'When variants are enabled, please select a variant type.');
      return;
    }

    setSaving(true);
    try {
      const globalPrice = parseFloat(formData.price);

      // Build branchPrices payload
      const branchPricesPayload = formData.branchPrices
        .filter((bp) => {
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

      let menuItemId: string;
      if (editingItem) {
        await updateMenuItem(editingItem.id, payload);
        menuItemId = editingItem.id;
        showSuccessToast('Updated', `"${payload.name}" has been updated.`);
      } else {
        const created = await createMenuItem(payload);
        menuItemId = created.id;
        showSuccessToast('Created', `"${payload.name}" has been created.`);
      }

      // Save variants if enabled
      if (formData.hasVariants && menuItemId) {
        await saveVariants(menuItemId);
      } else if (!formData.hasVariants && editingItem) {
        // Variants were disabled — delete any existing variant rows
        await deleteAllVariants(editingItem.id);
      }

      await onSaved();
      onOpenChange(false);
    } catch (e: any) {
      showErrorToast('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveVariants(menuItemId: string) {
    // Get existing variants for this menu item
    const existing = await fetchMenuItemVariants(menuItemId);
    const processedIds = new Set<string>();

    for (const row of itemVariants) {
      if (!row.variantOptionId) continue;

      const existingVariant = existing.find((v) => v.variantOptionId === row.variantOptionId);
      if (existingVariant && row.id) {
        // Update existing variant
        await updateMenuItemVariant(row.id, {
          priceModifier: parseFloat(row.priceModifier) || 0,
          variantTypeId: selectedVariantType,
          sortOrder: row.sortOrder,
        });
        processedIds.add(row.id);
      } else {
        // Create new variant
        await createMenuItemVariant({
          menuItemId,
          variantTypeId: selectedVariantType,
          variantOptionId: row.variantOptionId,
          priceModifier: parseFloat(row.priceModifier) || 0,
          sortOrder: row.sortOrder,
        });
      }
    }

    // Delete variants that are no longer in the list
    for (const v of existing) {
      if (!processedIds.has(v.id)) {
        await deleteMenuItemVariant(v.id);
      }
    }
  }

  async function deleteAllVariants(menuItemId: string) {
    const existing = await fetchMenuItemVariants(menuItemId);
    for (const v of existing) {
      await deleteMenuItemVariant(v.id);
    }
    setItemVariants([]);
  }

  function handleOpenChange(open: boolean) {
    if (!open && saving) return;
    onOpenChange(open);
  }

  const isEditing = !!editingItem;
  const hasOverrides = formData.branchPrices.some((bp) => bp.isOverridden);
  const hasDisabled = formData.branchPrices.some((bp) => !bp.isActive);
  const overridesCount = formData.branchPrices.filter((bp) => bp.isOverridden).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-[1100px] max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header — fixed at top */}
        <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Coffee className="h-5 w-5 text-emerald-600" />
            {isEditing ? `Edit: ${editingItem?.name}` : 'New Menu Item'}
          </DialogTitle>
        </DialogHeader>

        {/* Tabs and content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="basic" className="text-xs sm:text-sm">
                Basic Info
              </TabsTrigger>
              <TabsTrigger value="pricing" className="text-xs sm:text-sm">
                Pricing
              </TabsTrigger>
              <TabsTrigger value="branches" className="text-xs sm:text-sm">
                Branches
                {hasOverrides && <Badge variant="outline" className="ml-2 text-xs">{overridesCount} override{overridesCount !== 1 ? 's' : ''}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="variants" className="text-xs sm:text-sm">
                Variants
                {itemVariants.length > 0 && <Badge variant="outline" className="ml-2 text-xs">{itemVariants.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {/* BASIC INFO TAB */}
            <TabsContent value="basic" className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="item-name">Name *</Label>
                  <Input
                    id="item-name"
                    value={formData.name}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="e.g. Cappuccino"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-category">Category *</Label>
                  <Select value={formData.categoryId} onValueChange={handleCategoryChange}>
                    <SelectTrigger id="item-category" className="h-10">
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
                    className="h-10"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="item-image">Image URL</Label>
                  <Input
                    id="item-image"
                    value={formData.imagePath}
                    onChange={(e) => update('imagePath', e.target.value)}
                    placeholder="/images/cappuccino.jpg (optional)"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-code">Product Code (B2B E-Invoice)</Label>
                  <Input
                    id="item-code"
                    value={formData.productCode}
                    onChange={(e) => update('productCode', e.target.value)}
                    placeholder="Optional — unique barcode/SKU"
                    className="h-10"
                  />
                </div>
                <div className="flex items-end gap-6 pb-2">
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
              {formData.hasVariants && (
                <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-800">
                  Variants are configured in the <strong>Variants</strong> tab. Switch there to add size/weight options.
                </div>
              )}
            </TabsContent>

            {/* PRICING TAB */}
            <TabsContent value="pricing" className="space-y-5">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-sm font-semibold text-slate-900">Default (Global) Price</h4>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => update('price', e.target.value)}
                    className="w-48 h-10 font-mono"
                    placeholder="0.00"
                  />
                  <span className="text-sm text-slate-500">EGP</span>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  This is the fallback price used by branches that don't have a specific override.
                  Branch-specific prices are configured in the "Branches" tab.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="item-tax">Tax Rate</Label>
                  <Input
                    id="item-tax"
                    type="number"
                    step="0.01"
                    value={formData.taxRate}
                    onChange={(e) => update('taxRate', e.target.value)}
                    className="h-10 font-mono"
                  />
                  <p className="text-xs text-slate-400">
                    Note: tax is currently calculated at the branch level (Branch.taxEnabled / Branch.taxRate).
                    This field is preserved for future use.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* BRANCHES TAB */}
            <TabsContent value="branches" className="space-y-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <Label className="text-sm font-semibold">Availability Mode</Label>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
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

            {/* VARIANTS TAB */}
            <TabsContent value="variants" className="space-y-5">
              {!formData.hasVariants ? (
                <div className="text-center py-10">
                  <Layers className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-slate-700">Variants are disabled</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Enable the "Has Variants" switch in the Basic Info tab to configure size/weight options.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <Label className="text-sm font-semibold">Variant Type</Label>
                    <p className="text-xs text-slate-500 mt-1 mb-3">
                      Choose a variant type (e.g. Size, Weight). All variants on this item share the same type.
                    </p>
                    <Select value={selectedVariantType} onValueChange={setSelectedVariantType}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select variant type (e.g. Size, Weight)" />
                      </SelectTrigger>
                      <SelectContent>
                        {variantTypes.map((vt) => (
                          <SelectItem key={vt.id} value={vt.id}>
                            {vt.name}{vt.description ? ` (${vt.description})` : ''}{vt.isCustomInput ? ' · custom input' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {variantTypes.length === 0 && (
                      <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 p-2 rounded">
                        No variant types defined yet. Create one in the Variants management tab first.
                      </p>
                    )}
                  </div>

                  {selectedVariantType && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">Variant Options</h4>
                          <p className="text-xs text-slate-500">
                            Each row is one option (e.g. Small, Medium, Large) with its price modifier.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddVariantRow}
                          className="h-9"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Variant
                        </Button>
                      </div>

                      {itemVariants.length === 0 && (
                        <p className="text-sm text-slate-500 italic py-2">
                          No variants added yet. Click "Add Variant" to add options.
                        </p>
                      )}

                      {itemVariants.map((variant, index) => {
                        const selectedType = variantTypes.find((vt) => vt.id === selectedVariantType);
                        const options = selectedType?.options || [];
                        return (
                          <div key={index} className="flex flex-col md:flex-row gap-3 items-start md:items-center border border-slate-200 rounded-lg p-3 bg-white">
                            <div className="flex-1 w-full">
                              <Label className="text-xs text-slate-500">Option</Label>
                              <Select
                                value={variant.variantOptionId}
                                onValueChange={(v) => handleVariantRowChange(index, 'variantOptionId', v)}
                              >
                                <SelectTrigger className="h-10 mt-1">
                                  <SelectValue placeholder="Select option" />
                                </SelectTrigger>
                                <SelectContent>
                                  {options.map((option) => (
                                    <SelectItem key={option.id} value={option.id}>
                                      {option.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="md:w-40 w-full">
                              <Label className="text-xs text-slate-500">Price Modifier (EGP)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={variant.priceModifier}
                                onChange={(e) => handleVariantRowChange(index, 'priceModifier', e.target.value)}
                                placeholder="+0.00"
                                className="h-10 mt-1 font-mono"
                              />
                            </div>
                            <div className="md:w-40 w-full text-sm text-slate-600">
                              <Label className="text-xs text-slate-500">Final Price</Label>
                              <div className="h-10 mt-1 flex items-center font-mono font-medium">
                                {getVariantFinalPrice(variant.priceModifier)} EGP
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveVariantRow(index)}
                              className="h-10 w-10 shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Remove variant"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}

                      {itemVariants.length > 0 && (
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                          <strong>How variants work:</strong> The final price = global price + price modifier.
                          Branch-specific overrides apply to the base price; the modifier is added on top.
                          For example, if the global price is 50 EGP and a branch override sets it to 75 EGP,
                          a "Large" variant with modifier +5 would be 80 EGP in that branch.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer — fixed at bottom */}
        <DialogFooter className="px-6 py-4 border-t border-slate-200 bg-white shrink-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving} className="h-10">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="h-10 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isEditing ? 'Save Changes' : 'Create Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
