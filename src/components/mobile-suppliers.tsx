'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Building, 
  Phone, 
  Mail, 
  Plus, 
  Search, 
  X, 
  Package, 
  DollarSign,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone: string;
  address?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  _count?: {
    purchaseOrders: number;
  };
  totalSpent?: number;
  lastOrderDate?: string;
}

export function MobileSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
  });

  useEffect(() => {
    fetchSuppliers();
  }, [search]);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);

      const response = await fetch(`/api/suppliers?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        const suppliersWithStats = await Promise.all(
          data.suppliers.map(async (supplier: Supplier) => {
            try {
              const analyticsRes = await fetch(`/api/suppliers/${supplier.id}/analytics`);
              if (analyticsRes.ok) {
                const analyticsData = await analyticsRes.json();
                return {
                  ...supplier,
                  totalSpent: analyticsData.analytics.summary.totalSpent,
                  lastOrderDate: analyticsData.analytics.summary.lastOrderDate,
                };
              }
            } catch (error) {
              console.error('Failed to fetch supplier analytics:', error);
            }
            return supplier;
          })
        );
        setSuppliers(suppliersWithStats);
      }
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
      showErrorToast('Error', 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const method = editingSupplier ? 'PATCH' : 'POST';
      const url = editingSupplier ? `/api/suppliers/${editingSupplier.id}` : '/api/suppliers';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        showSuccessToast('Success', `Supplier ${editingSupplier ? 'updated' : 'created'} successfully`);
        fetchSuppliers();
        setIsDialogOpen(false);
        resetForm();
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || 'Failed to save supplier');
      }
    } catch (error) {
      console.error('Failed to save supplier:', error);
      showErrorToast('Error', 'Failed to save supplier');
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contactPerson: supplier.contactPerson || '',
      email: supplier.email || '',
      phone: supplier.phone,
      address: supplier.address || '',
      notes: supplier.notes || '',
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
    });
    setEditingSupplier(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (selectedSupplier) {
    return (
      <div className="h-full flex flex-col bg-slate-50">
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setSelectedSupplier(null)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold truncate">{selectedSupplier.name}</h1>
            <p className="text-emerald-100 text-sm">Supplier Details</p>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {/* Status Badge */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Status</span>
                  <Badge className={selectedSupplier.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                    {selectedSupplier.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building className="h-5 w-5 text-emerald-600" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedSupplier.contactPerson && (
                  <div className="flex items-start gap-3">
                    <Building className="h-5 w-5 text-slate-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-600">Contact Person</p>
                      <p className="font-medium">{selectedSupplier.contactPerson}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-slate-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">Phone</p>
                    <p className="font-medium">{selectedSupplier.phone}</p>
                  </div>
                </div>
                {selectedSupplier.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-slate-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-600">Email</p>
                      <p className="font-medium">{selectedSupplier.email}</p>
                    </div>
                  </div>
                )}
                {selectedSupplier.address && (
                  <div className="flex items-start gap-3">
                    <Building className="h-5 w-5 text-slate-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-600">Address</p>
                      <p className="font-medium">{selectedSupplier.address}</p>
                    </div>
                  </div>
                )}
                {selectedSupplier.notes && (
                  <div className="flex items-start gap-3">
                    <div className="h-5 w-5 flex items-center justify-center text-slate-400 mt-0.5">
                      📝
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-600">Notes</p>
                      <p className="font-medium">{selectedSupplier.notes}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <Package className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Total Orders</p>
                      <p className="font-bold text-lg">{selectedSupplier._count?.purchaseOrders || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-600">Total Spent</p>
                      <p className="font-bold text-lg">{formatCurrency(selectedSupplier.totalSpent || 0)}</p>
                    </div>
                  </div>
                </div>
                {selectedSupplier.lastOrderDate && (
                  <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Package className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-600">Last Order</p>
                        <p className="font-bold text-lg">{formatDate(selectedSupplier.lastOrderDate)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Button
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleEdit(selectedSupplier)}
            >
              Edit Supplier
            </Button>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">Suppliers</h1>
          <Button
            variant="secondary"
            size="icon"
            className="bg-white/20 hover:bg-white/30 text-white"
            onClick={fetchSuppliers}
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
          <Input
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white/20 border-white/30 text-white placeholder:text-white/60"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white/60 hover:text-white"
              onClick={() => setSearch('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Supplier List */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
          </div>
        ) : suppliers.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Building className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-4">No suppliers found</p>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setIsDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Supplier
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {suppliers.map((supplier) => (
              <Card
                key={supplier.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedSupplier(supplier)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate">{supplier.name}</h3>
                      {supplier.contactPerson && (
                        <p className="text-sm text-slate-600 truncate">{supplier.contactPerson}</p>
                      )}
                    </div>
                    <Badge className={supplier.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                      {supplier.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <div className="flex items-center gap-1">
                      <Package className="h-4 w-4" />
                      <span>{supplier._count?.purchaseOrders || 0} orders</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4" />
                      <span>{formatCurrency(supplier.totalSpent || 0)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Add Supplier Button */}
      <div className="p-4 bg-white border-t">
        <Button
          className="w-full h-14 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Supplier
        </Button>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</DialogTitle>
            <DialogDescription>
              {editingSupplier ? 'Update supplier information' : 'Enter details for the new supplier'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Supplier Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="h-12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contactPerson">Contact Person</Label>
                <Input
                  id="contactPerson"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  className="h-12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  className="h-12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="h-12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="h-12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="h-12"
                />
              </div>
            </div>
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => { setIsDialogOpen(false); resetForm(); }} 
                className="w-full sm:w-auto h-12"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto h-12"
              >
                {editingSupplier ? 'Update' : 'Create'} Supplier
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
