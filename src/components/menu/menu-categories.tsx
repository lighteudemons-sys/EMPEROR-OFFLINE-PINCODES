'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, GripVertical, Folder, FolderOpen, ChevronRight, ChevronDown, Coffee, Loader2 } from 'lucide-react';
import {
  type Category,
  type MenuItem,
  createCategory,
  updateCategory,
  deleteCategory,
} from './menu-shared';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface MenuCategoriesProps {
  categories: Category[];
  menuItems: MenuItem[];
  onRefresh: () => Promise<void>;
}

export function MenuCategories({ categories, menuItems, onRefresh }: MenuCategoriesProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sortOrder: '0',
    isActive: true,
    requiresCaptainReceipt: false,
  });

  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  function openCreate() {
    setEditingCategory(null);
    setFormData({
      name: '',
      description: '',
      sortOrder: String(categories.length + 1),
      isActive: true,
      requiresCaptainReceipt: false,
    });
    setDialogOpen(true);
  }

  function openEdit(cat: Category) {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      description: cat.description || '',
      sortOrder: String(cat.sortOrder),
      isActive: cat.isActive,
      requiresCaptainReceipt: cat.requiresCaptainReceipt,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      showErrorToast('Validation error', 'Category name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        sortOrder: parseInt(formData.sortOrder) || 0,
        isActive: formData.isActive,
        requiresCaptainReceipt: formData.requiresCaptainReceipt,
      };
      if (editingCategory) {
        await updateCategory(editingCategory.id, payload);
        showSuccessToast('Updated', `Category "${payload.name}" updated.`);
      } else {
        await createCategory(payload);
        showSuccessToast('Created', `Category "${payload.name}" created.`);
      }
      setDialogOpen(false);
      await onRefresh();
    } catch (e: any) {
      showErrorToast('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteCategory(deleteTarget.id);
      showSuccessToast('Deleted', `Category "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      await onRefresh();
    } catch (e: any) {
      showErrorToast('Delete failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function moveCategory(id: string, direction: 'up' | 'down') {
    const idx = sortedCategories.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedCategories.length) return;

    const cat = sortedCategories[idx];
    const swapCat = sortedCategories[swapIdx];

    setSaving(true);
    try {
      await Promise.all([
        updateCategory(cat.id, { sortOrder: swapCat.sortOrder }),
        updateCategory(swapCat.id, { sortOrder: cat.sortOrder }),
      ]);
      await onRefresh();
    } catch (e: any) {
      showErrorToast('Reorder failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
        </p>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </div>

      <div className="space-y-2">
        {sortedCategories.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Folder className="h-10 w-10 text-slate-300 mx-auto" />
              <h3 className="mt-3 text-sm font-semibold text-slate-900">No categories yet</h3>
              <p className="mt-1 text-sm text-slate-500">Create your first category to organize menu items.</p>
              <Button onClick={openCreate} variant="outline" className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </CardContent>
          </Card>
        ) : (
          sortedCategories.map((cat, idx) => {
            const itemCount = menuItems.filter((i) => i.categoryId === cat.id && !i.deletedAt).length;
            const isExpanded = expandedId === cat.id;
            const itemsInCategory = menuItems.filter((i) => i.categoryId === cat.id && !i.deletedAt);
            return (
              <Card key={cat.id} className={`border-slate-200 transition-shadow hover:shadow-sm ${!cat.isActive ? 'opacity-60' : ''}`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => moveCategory(cat.id, 'up')}
                        disabled={saving || idx === 0}
                        title="Move up"
                      >
                        <ChevronRight className="h-3 w-3 rotate-[-90deg]" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => moveCategory(cat.id, 'down')}
                        disabled={saving || idx === sortedCategories.length - 1}
                        title="Move down"
                      >
                        <ChevronRight className="h-3 w-3 rotate-90" />
                      </Button>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setExpandedId(isExpanded ? null : cat.id)}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>

                    <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : cat.id)}>
                      <div className="flex items-center gap-2">
                        {isExpanded ? <FolderOpen className="h-4 w-4 text-amber-500" /> : <Folder className="h-4 w-4 text-amber-500" />}
                        <span className="font-medium text-slate-900">{cat.name}</span>
                        <Badge variant="secondary" className="text-xs">{itemCount} item{itemCount !== 1 ? 's' : ''}</Badge>
                        {!cat.isActive && <Badge variant="outline" className="text-xs text-red-600 border-red-300">inactive</Badge>}
                        {cat.requiresCaptainReceipt && <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">captain receipt</Badge>}
                      </div>
                      {cat.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400 mr-2">order: {cat.sortOrder}</span>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(cat)} disabled={saving}>
                        <Pencil className="h-4 w-4 text-slate-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(cat)}
                        disabled={saving || itemCount > 0}
                        title={itemCount > 0 ? 'Cannot delete: category has items' : 'Delete'}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 ml-12 space-y-1 border-l-2 border-slate-100 pl-4">
                      {itemsInCategory.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">No items in this category.</p>
                      ) : (
                        itemsInCategory.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 text-sm py-1">
                            <Coffee className="h-3 w-3 text-slate-400" />
                            <span className="text-slate-700">{item.name}</span>
                            <span className="text-xs text-slate-400 font-mono">{item.price.toFixed(2)} EGP</span>
                            {!item.isActive && <Badge variant="outline" className="text-xs">inactive</Badge>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'New Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name *</Label>
              <Input
                id="cat-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Hot Coffee"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cat-sort">Sort Order</Label>
                <Input
                  id="cat-sort"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                />
              </div>
              <div className="flex items-end gap-4 pb-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
                  />
                  <Label className="text-sm">Active</Label>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t">
              <Switch
                checked={formData.requiresCaptainReceipt}
                onCheckedChange={(v) => setFormData({ ...formData, requiresCaptainReceipt: v })}
              />
              <Label className="text-sm">Requires captain receipt</Label>
              <span className="text-xs text-slate-400">(for dine-in order printing)</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingCategory ? 'Save Changes' : 'Create Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The category will be permanently removed.
              Menu items in this category must be moved to another category first.
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
