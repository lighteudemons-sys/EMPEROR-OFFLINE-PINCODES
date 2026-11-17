'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Layers, ChevronDown, ChevronRight, Loader2, Settings2 } from 'lucide-react';
import {
  type VariantType,
  type VariantOption,
  fetchVariantTypes,
  createVariantType,
  updateVariantType,
  deleteVariantType,
  createVariantOption,
  updateVariantOption,
  deleteVariantOption,
} from './menu-shared';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface MenuVariantsProps {
  onRefresh?: () => Promise<void>;
}

export function MenuVariants({ onRefresh }: MenuVariantsProps) {
  const [variantTypes, setVariantTypes] = useState<VariantType[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<VariantType | null>(null);
  const [optionDialogOpen, setOptionDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<VariantOption | null>(null);
  const [optionParentTypeId, setOptionParentTypeId] = useState<string>('');
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<VariantType | null>(null);
  const [deleteOptionTarget, setDeleteOptionTarget] = useState<{ option: VariantOption; typeId: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [typeForm, setTypeForm] = useState({
    name: '',
    description: '',
    isActive: true,
    isCustomInput: false,
  });

  const [optionForm, setOptionForm] = useState({
    name: '',
    description: '',
    sortOrder: '0',
    isActive: true,
  });

  const refresh = useCallback(async () => {
    try {
      const vts = await fetchVariantTypes();
      setVariantTypes(vts);
    } catch (e: any) {
      showErrorToast('Failed to load variants', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openCreateType() {
    setEditingType(null);
    setTypeForm({ name: '', description: '', isActive: true, isCustomInput: false });
    setTypeDialogOpen(true);
  }

  function openEditType(vt: VariantType) {
    setEditingType(vt);
    setTypeForm({
      name: vt.name,
      description: vt.description || '',
      isActive: vt.isActive,
      isCustomInput: vt.isCustomInput,
    });
    setTypeDialogOpen(true);
  }

  async function handleSaveType() {
    if (!typeForm.name.trim()) {
      showErrorToast('Validation error', 'Variant type name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: typeForm.name.trim(),
        description: typeForm.description.trim() || null,
        isActive: typeForm.isActive,
        isCustomInput: typeForm.isCustomInput,
      };
      if (editingType) {
        await updateVariantType(editingType.id, payload);
        showSuccessToast('Updated', `Variant type "${payload.name}" updated.`);
      } else {
        await createVariantType(payload);
        showSuccessToast('Created', `Variant type "${payload.name}" created.`);
      }
      setTypeDialogOpen(false);
      await refresh();
      onRefresh?.();
    } catch (e: any) {
      showErrorToast('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteType() {
    if (!deleteTypeTarget) return;
    setSaving(true);
    try {
      await deleteVariantType(deleteTypeTarget.id);
      showSuccessToast('Deleted', `Variant type "${deleteTypeTarget.name}" deleted.`);
      setDeleteTypeTarget(null);
      await refresh();
      onRefresh?.();
    } catch (e: any) {
      showErrorToast('Delete failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  function openCreateOption(typeId: string) {
    setOptionParentTypeId(typeId);
    setEditingOption(null);
    setOptionForm({ name: '', description: '', sortOrder: '0', isActive: true });
    setOptionDialogOpen(true);
  }

  function openEditOption(option: VariantOption, typeId: string) {
    setOptionParentTypeId(typeId);
    setEditingOption(option);
    setOptionForm({
      name: option.name,
      description: option.description || '',
      sortOrder: String(option.sortOrder),
      isActive: option.isActive,
    });
    setOptionDialogOpen(true);
  }

  async function handleSaveOption() {
    if (!optionForm.name.trim()) {
      showErrorToast('Validation error', 'Option name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        variantTypeId: optionParentTypeId,
        name: optionForm.name.trim(),
        description: optionForm.description.trim() || null,
        sortOrder: parseInt(optionForm.sortOrder) || 0,
        isActive: optionForm.isActive,
      };
      if (editingOption) {
        await updateVariantOption(editingOption.id, payload);
        showSuccessToast('Updated', `Option "${payload.name}" updated.`);
      } else {
        await createVariantOption(payload);
        showSuccessToast('Created', `Option "${payload.name}" created.`);
      }
      setOptionDialogOpen(false);
      await refresh();
      onRefresh?.();
    } catch (e: any) {
      showErrorToast('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteOption() {
    if (!deleteOptionTarget) return;
    setSaving(true);
    try {
      await deleteVariantOption(deleteOptionTarget.option.id);
      showSuccessToast('Deleted', `Option "${deleteOptionTarget.option.name}" deleted.`);
      setDeleteOptionTarget(null);
      await refresh();
      onRefresh?.();
    } catch (e: any) {
      showErrorToast('Delete failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        <span className="ml-2 text-sm text-slate-500">Loading variants...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Variant Types & Options</h3>
          <p className="text-xs text-slate-500">
            Define variant types (Size, Weight) and their options (Small, Medium, Large).
            Items reference these when "Has Variants" is enabled.
          </p>
        </div>
        <Button onClick={openCreateType} className="bg-emerald-600 hover:bg-emerald-700 h-9">
          <Plus className="h-4 w-4 mr-2" />
          Add Variant Type
        </Button>
      </div>

      {variantTypes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <Layers className="h-10 w-10 text-slate-300 mx-auto" />
            <h3 className="mt-3 text-sm font-semibold text-slate-900">No variant types yet</h3>
            <p className="mt-1 text-xs text-slate-500">
              Create your first variant type (e.g. Size) to start offering size/weight options on menu items.
            </p>
            <Button onClick={openCreateType} variant="outline" className="mt-4 h-9">
              <Plus className="h-4 w-4 mr-2" />
              Add Variant Type
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {variantTypes.map((vt) => {
            const isExpanded = expandedId === vt.id;
            const options = vt.options || [];
            return (
              <Card key={vt.id} className={`border-slate-200 ${!vt.isActive ? 'opacity-60' : ''}`}>
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-center gap-3">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setExpandedId(isExpanded ? null : vt.id)}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : vt.id)}>
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-amber-500" />
                        <span className="font-medium text-slate-900">{vt.name}</span>
                        <Badge variant="secondary" className="text-xs">{options.length} option{options.length !== 1 ? 's' : ''}</Badge>
                        {!vt.isActive && <Badge variant="outline" className="text-xs text-red-600 border-red-300">inactive</Badge>}
                        {vt.isCustomInput && <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">custom input</Badge>}
                      </div>
                      {vt.description && <p className="text-xs text-slate-500 mt-0.5">{vt.description}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditType(vt)} disabled={saving} className="h-8 w-8">
                        <Pencil className="h-4 w-4 text-slate-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTypeTarget(vt)}
                        disabled={saving}
                        className="h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="p-3 pt-0 ml-12">
                    <div className="border-l-2 border-slate-100 pl-4 space-y-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Options</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCreateOption(vt.id)}
                          className="h-7 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Option
                        </Button>
                      </div>
                      {options.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">No options yet. Add Small/Medium/Large etc.</p>
                      ) : (
                        options.map((option) => (
                          <div key={option.id} className="flex items-center gap-2 text-sm py-1 hover:bg-slate-50 -mx-2 px-2 rounded">
                            <Settings2 className="h-3 w-3 text-slate-400" />
                            <span className="text-slate-700 flex-1">{option.name}</span>
                            <span className="text-xs text-slate-400">order: {option.sortOrder}</span>
                            {!option.isActive && <Badge variant="outline" className="text-xs text-red-600 border-red-300">inactive</Badge>}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditOption(option, vt.id)}
                              className="h-6 w-6"
                            >
                              <Pencil className="h-3 w-3 text-slate-500" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteOptionTarget({ option, typeId: vt.id })}
                              className="h-6 w-6"
                            >
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Variant Type Dialog */}
      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingType ? 'Edit Variant Type' : 'New Variant Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="vt-name">Name *</Label>
              <Input
                id="vt-name"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                placeholder="e.g. Size, Weight, Material"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vt-desc">Description</Label>
              <Input
                id="vt-desc"
                value={typeForm.description}
                onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={typeForm.isActive}
                  onCheckedChange={(v) => setTypeForm({ ...typeForm, isActive: v })}
                />
                <Label className="text-sm">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={typeForm.isCustomInput}
                  onCheckedChange={(v) => setTypeForm({ ...typeForm, isCustomInput: v })}
                />
                <Label className="text-sm">Custom Input (weight/quantity)</Label>
              </div>
            </div>
            {typeForm.isCustomInput && (
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                Custom Input variants let the cashier enter a weight/multiplier at checkout
                (e.g. 0.250 kg of coffee). The final price = base price × multiplier.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveType} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingType ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variant Option Dialog */}
      <Dialog open={optionDialogOpen} onOpenChange={setOptionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingOption ? 'Edit Option' : 'New Option'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="opt-name">Name *</Label>
              <Input
                id="opt-name"
                value={optionForm.name}
                onChange={(e) => setOptionForm({ ...optionForm, name: e.target.value })}
                placeholder="e.g. Small, Medium, Large"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="opt-desc">Description</Label>
              <Input
                id="opt-desc"
                value={optionForm.description}
                onChange={(e) => setOptionForm({ ...optionForm, description: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="opt-sort">Sort Order</Label>
                <Input
                  id="opt-sort"
                  type="number"
                  value={optionForm.sortOrder}
                  onChange={(e) => setOptionForm({ ...optionForm, sortOrder: e.target.value })}
                />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch
                  checked={optionForm.isActive}
                  onCheckedChange={(v) => setOptionForm({ ...optionForm, isActive: v })}
                />
                <Label className="text-sm">Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOptionDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveOption} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingOption ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete type confirmation */}
      <AlertDialog open={!!deleteTypeTarget} onOpenChange={(v) => !v && setDeleteTypeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete variant type "{deleteTypeTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the variant type and all its options.
              Menu items using this variant type will lose their variant configurations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteType}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete option confirmation */}
      <AlertDialog open={!!deleteOptionTarget} onOpenChange={(v) => !v && setDeleteOptionTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete option "{deleteOptionTarget?.option.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Menu items using this option will lose this variant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOption}
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
