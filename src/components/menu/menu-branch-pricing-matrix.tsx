'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, DollarSign, Copy, RotateCcw, CheckCircle2, AlertTriangle, Loader2, Save } from 'lucide-react';
import {
  type MenuItem,
  type Branch,
  type Category,
  type BranchPriceEntry,
  parsePrice,
  priceToInputValue,
  saveBranchPrices,
  fetchMenuItems,
} from './menu-shared';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/hooks/use-toast';

interface MenuBranchPricingMatrixProps {
  menuItems: MenuItem[];
  branches: Branch[];
  categories: Category[];
  onRefresh: () => Promise<void>;
}

export function MenuBranchPricingMatrix({ menuItems, branches, categories, onRefresh }: MenuBranchPricingMatrixProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkTargetBranch, setBulkTargetBranch] = useState<string>('all');
  const [copyFromBranch, setCopyFromBranch] = useState<string>('');
  const [copyToBranch, setCopyToBranch] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [confirmBulkApply, setConfirmBulkApply] = useState(false);

  // Local state for inline edits: { [menuItemId_branchId]: { price, isActive } }
  const [edits, setEdits] = useState<Record<string, { price: string; isActive: boolean }>>({});

  // Filtered items based on search and category
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (item.deletedAt) return false; // hide archived
      if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) return false;
      if (searchTerm && !item.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [menuItems, searchTerm, categoryFilter]);

  // Get the current (edited or original) price/isActive for a cell
  function getCell(menuItemId: string, branchId: string, item: MenuItem): { price: string; isActive: boolean; isOverridden: boolean; isInherited: boolean } {
    const editKey = `${menuItemId}_${branchId}`;
    if (edits[editKey]) {
      const e = edits[editKey];
      return {
        price: e.price,
        isActive: e.isActive,
        isOverridden: e.price !== '',
        isInherited: e.price === '',
      };
    }
    const assignment = item.branchAssignments?.find((a) => a.branchId === branchId);
    if (assignment) {
      const priceStr = priceToInputValue(assignment.price);
      return {
        price: priceStr,
        isActive: assignment.isActive,
        isOverridden: priceStr !== '',
        isInherited: priceStr === '',
      };
    }
    return {
      price: '',
      isActive: true,
      isOverridden: false,
      isInherited: true,
    };
  }

  function updateCell(menuItemId: string, branchId: string, patch: Partial<{ price: string; isActive: boolean }>) {
    const editKey = `${menuItemId}_${branchId}`;
    const current = getCell(menuItemId, branchId, menuItems.find((i) => i.id === menuItemId)!);
    setEdits((prev) => ({
      ...prev,
      [editKey]: { ...current, ...patch },
    }));
  }

  function resetCell(menuItemId: string, branchId: string) {
    const editKey = `${menuItemId}_${branchId}`;
    setEdits((prev) => {
      const next = { ...prev };
      delete next[editKey];
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filteredItems.map((i) => i.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  // Count pending edits per item
  function getItemPendingEdits(menuItemId: string): number {
    return Object.keys(edits).filter((k) => k.startsWith(`${menuItemId}_`)).length;
  }

  // Save all edits for a single menu item
  async function saveItem(menuItemId: string) {
    const item = menuItems.find((i) => i.id === menuItemId);
    if (!item) return;

    const itemEdits = Object.keys(edits).filter((k) => k.startsWith(`${menuItemId}_`));
    if (itemEdits.length === 0) return;

    setSaving(true);
    try {
      // Build the full branch-price entries for this item, applying edits on top of existing data
      const entries: BranchPriceEntry[] = branches.map((branch) => {
        const cell = getCell(menuItemId, branch.id, item);
        return {
          branchId: branch.id,
          branchName: branch.branchName,
          price: cell.price,
          isActive: cell.isActive,
          isOverridden: cell.isOverridden,
        };
      });

      await saveBranchPrices(menuItemId, entries, item.availabilityMode);

      // Clear the saved edits from local state
      setEdits((prev) => {
        const next = { ...prev };
        for (const k of itemEdits) delete next[k];
        return next;
      });

      showSuccessToast('Saved', `Branch prices for "${item.name}" updated.`);
      await onRefresh();
    } catch (e: any) {
      showErrorToast('Save failed', e.message || 'Failed to save branch prices.');
    } finally {
      setSaving(false);
    }
  }

  // Bulk apply: set one price to multiple branches for selected items
  async function applyBulkPrice() {
    if (selectedIds.size === 0) {
      showWarningToast('No selection', 'Select items first.');
      return;
    }
    if (bulkTargetBranch === 'all' && !bulkPrice) {
      showWarningToast('No price', 'Enter a price or choose a specific branch.');
      return;
    }

    setSaving(true);
    let succeeded = 0;
    let failed = 0;
    try {
      for (const menuItemId of selectedIds) {
        const item = menuItems.find((i) => i.id === menuItemId);
        if (!item) continue;

        const targetBranchIds = bulkTargetBranch === 'all' ? branches.map((b) => b.id) : [bulkTargetBranch];
        const entries: BranchPriceEntry[] = branches.map((branch) => {
          const cell = getCell(menuItemId, branch.id, item);
          if (targetBranchIds.includes(branch.id)) {
            return {
              ...cell,
              branchId: branch.id,
              branchName: branch.branchName,
              price: bulkPrice, // '' = inherit, otherwise the new price
              isOverridden: bulkPrice !== '',
            };
          }
          return {
            ...cell,
            branchId: branch.id,
            branchName: branch.branchName,
          };
        });

        try {
          await saveBranchPrices(menuItemId, entries, item.availabilityMode);
          succeeded++;
        } catch {
          failed++;
        }
      }

      // Clear edits for saved items
      setEdits({});
      showSuccessToast('Bulk update complete', `${succeeded} item(s) updated${failed > 0 ? `, ${failed} failed` : ''}.`);
      await onRefresh();
    } catch (e: any) {
      showErrorToast('Bulk update failed', e.message);
    } finally {
      setSaving(false);
      setConfirmBulkApply(false);
    }
  }

  // Copy prices from one branch to another
  async function copyPrices() {
    if (!copyFromBranch || !copyToBranch || copyFromBranch === copyToBranch) {
      showWarningToast('Invalid selection', 'Choose two different branches.');
      return;
    }
    if (selectedIds.size === 0) {
      showWarningToast('No selection', 'Select items first.');
      return;
    }

    setSaving(true);
    let succeeded = 0;
    let failed = 0;
    try {
      for (const menuItemId of selectedIds) {
        const item = menuItems.find((i) => i.id === menuItemId);
        if (!item) continue;

        const fromAssignment = item.branchAssignments?.find((a) => a.branchId === copyFromBranch);
        const fromPrice = fromAssignment ? priceToInputValue(fromAssignment.price) : '';

        const entries: BranchPriceEntry[] = branches.map((branch) => {
          const cell = getCell(menuItemId, branch.id, item);
          if (branch.id === copyToBranch) {
            return {
              ...cell,
              branchId: branch.id,
              branchName: branch.branchName,
              price: fromPrice,
              isOverridden: fromPrice !== '',
            };
          }
          return { ...cell, branchId: branch.id, branchName: branch.branchName };
        });

        try {
          await saveBranchPrices(menuItemId, entries, item.availabilityMode);
          succeeded++;
        } catch {
          failed++;
        }
      }

      setEdits({});
      showSuccessToast('Copy complete', `Copied prices from "${branches.find((b) => b.id === copyFromBranch)?.branchName}" to "${branches.find((b) => b.id === copyToBranch)?.branchName}" for ${succeeded} item(s)${failed > 0 ? `, ${failed} failed` : ''}.`);
      await onRefresh();
    } catch (e: any) {
      showErrorToast('Copy failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  const totalPendingEdits = Object.keys(edits).length;

  if (branches.length === 0) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-12 text-center">
          <Building2Icon />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No branches configured</h3>
          <p className="mt-2 text-sm text-slate-500">Add branches first to manage branch-specific pricing.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Selection toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={selectAll}>Select all</Button>
          <Button size="sm" variant="ghost" onClick={selectNone}>Clear</Button>
          <Badge variant="secondary">{selectedIds.size} selected</Badge>
          {totalPendingEdits > 0 && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
              {totalPendingEdits} unsaved edit{totalPendingEdits !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          {/* Bulk apply price */}
          <Input
            type="number"
            placeholder="Price"
            value={bulkPrice}
            onChange={(e) => setBulkPrice(e.target.value)}
            className="w-24"
            disabled={saving}
          />
          <Select value={bulkTargetBranch} onValueChange={setBulkTargetBranch} disabled={saving}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.branchName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => setConfirmBulkApply(true)}
            disabled={saving || selectedIds.size === 0}
          >
            <DollarSign className="h-4 w-4 mr-1" />
            Apply
          </Button>

          <div className="h-6 w-px bg-slate-300 mx-1" />

          {/* Copy prices */}
          <Select value={copyFromBranch} onValueChange={setCopyFromBranch} disabled={saving}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="From branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.branchName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Copy className="h-4 w-4 text-slate-400" />
          <Select value={copyToBranch} onValueChange={setCopyToBranch} disabled={saving}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="To branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.branchName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={copyPrices}
            disabled={saving || selectedIds.size === 0 || !copyFromBranch || !copyToBranch}
          >
            <Copy className="h-4 w-4 mr-1" />
            Copy
          </Button>
        </div>
      </div>

      {/* Matrix */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-10 px-3 py-3 text-left">
                  <Checkbox
                    checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                    onCheckedChange={(v) => v ? selectAll() : selectNone()}
                  />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700">Item</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700">Global Price</th>
                {branches.map((b) => (
                  <th key={b.id} className="px-3 py-3 text-left font-semibold text-slate-700 min-w-[140px]">
                    {b.branchName}
                  </th>
                ))}
                <th className="px-3 py-3 text-left font-semibold text-slate-700">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={branches.length + 4} className="px-3 py-12 text-center text-slate-500">
                    {searchTerm || categoryFilter !== 'all'
                      ? 'No items match the current filters.'
                      : 'No menu items yet. Create one first.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const pendingEdits = getItemPendingEdits(item.id);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-500">{item.category}</div>
                        {item.availabilityMode === 'EXPLICIT' && (
                          <Badge variant="outline" className="mt-1 text-xs">Branch-specific</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono font-medium text-slate-900">
                          {item.price.toFixed(2)}
                        </span>
                        <span className="text-xs text-slate-500 ml-1">EGP</span>
                      </td>
                      {branches.map((branch) => {
                        const cell = getCell(item.id, branch.id, item);
                        return (
                          <td key={branch.id} className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                step="0.01"
                                placeholder={cell.isInherited ? item.price.toFixed(2) : ''}
                                value={cell.price}
                                onChange={(e) => updateCell(item.id, branch.id, { price: e.target.value })}
                                disabled={saving || !cell.isActive}
                                className={`h-8 w-24 font-mono text-xs ${
                                  cell.isOverridden
                                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                                    : 'bg-slate-50 text-slate-500'
                                }`}
                              />
                              <Checkbox
                                checked={cell.isActive}
                                onCheckedChange={(v) => updateCell(item.id, branch.id, { isActive: !!v })}
                                disabled={saving}
                                title={cell.isActive ? 'Available' : 'Disabled'}
                              />
                            </div>
                            {cell.isInherited && cell.isActive && (
                              <div className="text-[10px] text-slate-400 mt-0.5">inherits global</div>
                            )}
                            {!cell.isActive && (
                              <div className="text-[10px] text-red-500 mt-0.5">disabled</div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2">
                        {pendingEdits > 0 ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => saveItem(item.id)}
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                            Save ({pendingEdits})
                          </Button>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-amber-50 border border-amber-300 rounded" />
          <span>Explicit price override</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-slate-50 border border-slate-200 rounded" />
          <span>Inherits global price</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox checked={false} disabled className="h-3 w-3" />
          <span>Disabled in this branch</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          <span>Saved (no pending edits)</span>
        </div>
      </div>

      {/* Bulk apply confirmation */}
      <AlertDialog open={confirmBulkApply} onOpenChange={setConfirmBulkApply}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk price update</AlertDialogTitle>
            <AlertDialogDescription>
              Apply price <strong>{bulkPrice || '(inherit)'}</strong> to{' '}
              <strong>
                {bulkTargetBranch === 'all' ? 'all branches' : branches.find((b) => b.id === bulkTargetBranch)?.branchName}
              </strong>{' '}
              for <strong>{selectedIds.size}</strong> selected item(s)?
              <br />
              <br />
              This will overwrite existing branch prices for the selected items. Existing orders will keep their original prices.
              New orders will use the new prices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={applyBulkPrice}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm & Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Building2Icon() {
  return (
    <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
      <DollarSign className="h-6 w-6 text-slate-400" />
    </div>
  );
}
