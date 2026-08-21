'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  MapPin, Plus, Edit, Trash2, DollarSign, X, Search,
  CheckCircle, XCircle
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
  branchId: string;
  branchName?: string;
  _count?: {
    orders: number;
  };
  createdAt: string;
  updatedAt: string;
}

export function MobileDeliveryAreas() {
  const { currency, t } = useI18n();
  const { user } = useAuth();
  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<DeliveryArea | null>(null);
  const [deletingArea, setDeletingArea] = useState<DeliveryArea | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    fee: '',
    isActive: true,
  });

  // Fetch areas on mount
  useEffect(() => {
    fetchAreas();
  }, []);

  const fetchAreas = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('currentUserRole', user?.role || '');
      params.append('currentUserBranchId', user?.branchId || '');

      const response = await fetch(`/api/delivery-areas?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        setAreas(data.areas || []);
      } else {
        showErrorToast(t('error'), data.error || t('delivery.areas.fetch.failed'));
      }
    } catch (error) {
      console.error('Failed to fetch delivery areas:', error);
      showErrorToast(t('error'), t('delivery.areas.fetch.failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const method = editingArea ? 'PATCH' : 'POST';
      const url = editingArea ? `/api/delivery-areas/${editingArea.id}` : '/api/delivery-areas';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          fee: parseFloat(formData.fee),
          isActive: formData.isActive,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        showSuccessToast(t('success'), editingArea ? t('delivery.areas.update.success') : t('delivery.areas.create.success'));
        setDialogOpen(false);
        resetForm();
        fetchAreas();
      } else {
        showErrorToast(t('error'), data.error || t('delivery.areas.save.failed'));
      }
    } catch (error) {
      console.error('Failed to save delivery area:', error);
      showErrorToast(t('error'), t('delivery.areas.save.failed'));
    }
  };

  const handleEdit = (area: DeliveryArea) => {
    setEditingArea(area);
    setFormData({
      name: area.name,
      fee: area.fee.toString(),
      isActive: area.isActive,
    });
    setDialogOpen(true);
  };

  const handleDelete = (area: DeliveryArea) => {
    setDeletingArea(area);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingArea) return;

    try {
      const response = await fetch(`/api/delivery-areas/${deletingArea.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        showSuccessToast(t('success'), t('delivery.areas.delete.success'));
        setDeleteDialogOpen(false);
        setDeletingArea(null);
        fetchAreas();
      } else {
        showErrorToast(t('error'), data.error || t('delivery.areas.delete.failed'));
      }
    } catch (error) {
      console.error('Failed to delete delivery area:', error);
      showErrorToast(t('error'), t('delivery.areas.delete.failed'));
    }
  };

  const handleToggleStatus = async (area: DeliveryArea) => {
    try {
      const response = await fetch(`/api/delivery-areas/${area.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !area.isActive }),
      });

      const data = await response.json();

      if (response.ok) {
        showSuccessToast(t('success'), t('delivery.areas.toggle.success', { action: !area.isActive ? t('activated') : t('deactivated') }));
        fetchAreas();
      } else {
        showErrorToast(t('error'), data.error || t('delivery.areas.status.update.failed'));
      }
    } catch (error) {
      console.error('Failed to toggle delivery area status:', error);
      showErrorToast(t('error'), t('delivery.areas.status.update.failed'));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      fee: '',
      isActive: true,
    });
    setEditingArea(null);
  };

  const filteredAreas = searchQuery
    ? areas.filter(area =>
        area.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        area.branchName?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : areas;

  const activeCount = areas.filter(a => a.isActive).length;
  const totalOrders = areas.reduce((sum, a) => sum + (a._count?.orders || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-600 to-orange-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <MapPin className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{t('delivery.areas.title')}</h1>
            <p className="text-orange-100 text-sm">{t('delivery.areas.description')}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-orange-100 text-xs">{t('delivery.areas.stats.total')}</p>
              <p className="text-lg font-bold">{areas.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-orange-100 text-xs">{t('delivery.areas.stats.active')}</p>
              <p className="text-lg font-bold">{activeCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-orange-100 text-xs">{t('delivery.areas.stats.orders')}</p>
              <p className="text-lg font-bold">{totalOrders}</p>
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
            placeholder={t('delivery.areas.search.placeholder')}
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

        {/* Add Button */}
        <Button
          onClick={() => { resetForm(); setDialogOpen(true); }}
          className="w-full h-14 text-lg bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('delivery.areas.add')}
        </Button>

        {/* Areas List */}
        <ScrollArea className="h-[calc(100vh-420px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full mb-3" />
              <p>{t('delivery.areas.loading')}</p>
            </div>
          ) : filteredAreas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <MapPin className="w-16 h-16 mb-4 text-slate-300" />
              <p className="font-medium">{t('delivery.areas.not.found')}</p>
              <p className="text-sm">{t('delivery.areas.add.first')}</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {filteredAreas.map((area) => (
                <Card key={area.id} className={`hover:shadow-md transition-shadow ${!area.isActive ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4">
                    {/* Header with name and status */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h3 className="font-semibold text-slate-900 text-base">{area.name}</h3>
                          {area.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-700 text-xs gap-1 h-6">
                              <CheckCircle className="h-3 w-3" />
                              {t('active')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs gap-1 h-6">
                              <XCircle className="h-3 w-3" />
                              {t('inactive')}
                            </Badge>
                          )}
                        </div>
                        {area.branchName && (
                          <p className="text-sm text-slate-600">{area.branchName}</p>
                        )}
                      </div>
                    </div>

                    {/* Fee Display */}
                    <div className="bg-orange-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 text-orange-900">
                        <DollarSign className="h-4 w-4" />
                        <span className="font-semibold text-lg">
                          {currency} {area.fee.toFixed(2)}
                        </span>
                        <span className="text-sm text-orange-700">{t('delivery.areas.fee')}</span>
                      </div>
                    </div>

                    {/* Order Statistics */}
                    {area._count?.orders !== undefined && (
                      <div className="bg-slate-50 rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <MapPin className="h-4 w-4 text-orange-600" />
                          <span className="font-medium">
                            {area._count.orders} {t('delivery.areas.orders.delivered')}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(area)}
                        className="flex-1 h-10"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        {t('edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStatus(area)}
                        className={`flex-1 h-10 ${area.isActive ? 'text-orange-600 border-orange-300 hover:bg-orange-50' : 'text-green-600 border-green-300 hover:bg-green-50'}`}
                      >
                        {area.isActive ? (
                          <>
                            <XCircle className="w-4 h-4 mr-2" />
                            {t('deactivate')}
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {t('activate')}
                          </>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(area)}
                        className="h-10 px-3"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingArea ? t('delivery.areas.dialog.edit.title') : t('delivery.areas.dialog.add.title')}
            </DialogTitle>
            <DialogDescription>
              {editingArea ? t('delivery.areas.dialog.edit.description') : t('delivery.areas.dialog.add.description')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('delivery.areas.form.name')} *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('delivery.areas.form.name.placeholder')}
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fee">{t('delivery.areas.form.fee')} ({currency}) *</Label>
                <Input
                  id="fee"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fee}
                  onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
                  placeholder="0.00"
                  required
                  className="h-11"
                />
              </div>

              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-5 w-5 rounded border-gray-300 focus:ring-primary"
                />
                <Label htmlFor="isActive" className="text-sm cursor-pointer">{t('delivery.areas.form.active')}</Label>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setDialogOpen(false); resetForm(); }}
                className="w-full sm:w-auto h-11"
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto h-11 bg-orange-600 hover:bg-orange-700"
              >
                {editingArea ? t('update') : t('create')} {t('delivery.areas.area')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('delivery.areas.delete.title')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-700">
              {t('delivery.areas.delete.confirm', { name: deletingArea?.name })}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              {t('delivery.areas.delete.warning')}
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => { setDeleteDialogOpen(false); setDeletingArea(null); }}
              className="w-full sm:w-auto h-11"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="w-full sm:w-auto h-11"
            >
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
