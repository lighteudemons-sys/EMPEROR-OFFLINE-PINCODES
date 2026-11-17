'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, Pencil, Trash2, Eye, Coffee, DollarSign, Building2, Filter, ArrowUpDown, Loader2 } from 'lucide-react';
import { type MenuItem, type Category, type Branch, formatPrice, deleteMenuItem } from './menu-shared';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface MenuItemsTableProps {
  menuItems: MenuItem[];
  categories: Category[];
  branches: Branch[];
  onAddItem: () => void;
  onEditItem: (item: MenuItem) => void;
  onViewItem: (item: MenuItem) => void;
  onRefresh: () => Promise<void>;
}

type SortField = 'name' | 'price' | 'category' | 'sortOrder' | 'updatedAt';
type SortDir = 'asc' | 'desc';

export function MenuItemsTable({
  menuItems,
  categories,
  branches,
  onAddItem,
  onEditItem,
  onViewItem,
  onRefresh,
}: MenuItemsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredItems = useMemo(() => {
    let items = [...menuItems];

    // Status filter
    if (statusFilter === 'active') {
      items = items.filter((i) => i.isActive && !i.deletedAt);
    } else if (statusFilter === 'inactive') {
      items = items.filter((i) => !i.isActive && !i.deletedAt);
    } else if (statusFilter === 'archived') {
      items = items.filter((i) => i.deletedAt);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      items = items.filter((i) => i.categoryId === categoryFilter);
    }

    // Branch filter
    if (branchFilter !== 'all') {
      items = items.filter((i) => {
        if (i.availabilityMode === 'EXPLICIT') {
          return i.branchAssignments?.some((a) => a.branchId === branchFilter && a.isActive);
        }
        const assignment = i.branchAssignments?.find((a) => a.branchId === branchFilter);
        return !assignment || assignment.isActive;
      });
    }

    // Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
    }

    // Sort
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'price': cmp = a.price - b.price; break;
        case 'category': cmp = a.category.localeCompare(b.category); break;
        case 'sortOrder': cmp = (a.sortOrder || 0) - (b.sortOrder || 0); break;
        case 'updatedAt': cmp = 0; break; // not available without join
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return items;
  }, [menuItems, searchTerm, categoryFilter, branchFilter, statusFilter, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteMenuItem(deleteTarget.id);
      showSuccessToast('Archived', `"${deleteTarget.name}" has been archived. Historical orders are preserved.`);
      setDeleteTarget(null);
      await onRefresh();
    } catch (e: any) {
      showErrorToast('Archive failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  function getBranchAvailability(item: MenuItem): { available: number; total: number; disabled: string[] } {
    const total = branches.length;
    const available = branches.filter((b) => {
      if (item.availabilityMode === 'GLOBAL') {
        const a = item.branchAssignments?.find((ba) => ba.branchId === b.id);
        return !a || a.isActive;
      } else {
        const a = item.branchAssignments?.find((ba) => ba.branchId === b.id);
        return !!a && a.isActive;
      }
    }).length;
    const disabled = branches
      .filter((b) => {
        const a = item.branchAssignments?.find((ba) => ba.branchId === b.id);
        return a && !a.isActive;
      })
      .map((b) => b.branchName);
    return { available, total, disabled };
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search items by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={onAddItem} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-10" />
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}>
                <div className="flex items-center gap-1">
                  Item <ArrowUpDown className="h-3 w-3 text-slate-400" />
                </div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('category')}>
                <div className="flex items-center gap-1">
                  Category <ArrowUpDown className="h-3 w-3 text-slate-400" />
                </div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('price')}>
                <div className="flex items-center gap-1">
                  Global Price <ArrowUpDown className="h-3 w-3 text-slate-400" />
                </div>
              </TableHead>
              <TableHead>Branch Availability</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Coffee className="h-8 w-8 text-slate-300 mx-auto" />
                  <p className="mt-2 text-sm text-slate-500">
                    {searchTerm || categoryFilter !== 'all' || branchFilter !== 'all' || statusFilter !== 'all'
                      ? 'No items match the current filters.'
                      : 'No menu items yet. Click "Add Item" to create your first one.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const { available, total, disabled } = getBranchAvailability(item);
                const hasOverrides = item.branchAssignments?.some((a) => a.price !== null && a.price !== undefined);
                return (
                  <TableRow key={item.id} className="hover:bg-slate-50/50">
                    <TableCell>
                      {item.imagePath ? (
                        <img src={item.imagePath} alt={item.name} className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center">
                          <Coffee className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{item.name}</div>
                      {hasOverrides && (
                        <Badge variant="outline" className="text-xs mt-1 text-amber-700 border-amber-300 bg-amber-50">
                          <DollarSign className="h-3 w-3 mr-0.5" />
                          branch pricing
                        </Badge>
                      )}
                      {item.availabilityMode === 'EXPLICIT' && (
                        <Badge variant="outline" className="text-xs ml-1 text-purple-700 border-purple-300 bg-purple-50">
                          explicit
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">{item.category}</TableCell>
                    <TableCell className="font-mono font-medium">
                      {item.price.toFixed(2)} <span className="text-xs text-slate-400">EGP</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3 w-3 text-slate-400" />
                        <span className={available < total ? 'text-amber-700 font-medium' : 'text-slate-700'}>
                          {available}/{total}
                        </span>
                      </div>
                      {disabled.length > 0 && (
                        <div className="text-xs text-red-500 mt-0.5">
                          disabled: {disabled.join(', ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.hasVariants ? (
                        <Badge variant="secondary">{item._count?.variants || 0} variants</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.deletedAt ? (
                        <Badge variant="outline" className="text-slate-600 border-slate-300">archived</Badge>
                      ) : item.isActive ? (
                        <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => onViewItem(item)} title="View">
                          <Eye className="h-4 w-4 text-slate-600" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => onEditItem(item)} title="Edit" disabled={!!item.deletedAt}>
                          <Pencil className="h-4 w-4 text-slate-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteTarget(item)}
                          title="Archive"
                          disabled={!!item.deletedAt}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing {filteredItems.length} of {menuItems.length} item{menuItems.length !== 1 ? 's' : ''}
        </span>
        {(searchTerm || categoryFilter !== 'all' || branchFilter !== 'all' || statusFilter !== 'all') && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearchTerm('');
              setCategoryFilter('all');
              setBranchFilter('all');
              setStatusFilter('all');
            }}
          >
            <Filter className="h-3 w-3 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Archive confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the item (soft-delete). It will no longer appear in the menu or POS.
              Historical orders ({deleteTarget?._count?.orderItems || 0} reference{((deleteTarget?._count?.orderItems || 0) !== 1) ? 's' : ''}) will be preserved.
              You can restore the item later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
