'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  UserCog, Plus, Edit, Trash2, Phone, Mail, Search, X,
  CheckCircle, XCircle, Package, Motorcycle, RefreshCw
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface Courier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  vehicleInfo?: string | null;
  branchId: string;
  branchName?: string;
  isActive: boolean;
  _count?: {
    orders: number;
  };
  totalRevenue?: number;
  createdAt: string;
}

interface Branch {
  id: string;
  branchName: string;
}

export function MobileCouriers() {
  const { currency } = useI18n();
  const { user } = useAuth();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null);
  const [deletingCourier, setDeletingCourier] = useState<Courier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    vehicleInfo: '',
    branchId: user?.role === 'BRANCH_MANAGER' ? user.branchId || '' : '',
    isActive: true,
  });

  // Fetch branches on mount
  useEffect(() => {
    fetchBranches();
  }, []);

  // Fetch couriers on mount
  useEffect(() => {
    fetchCouriers();
  }, []);

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

  const fetchCouriers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('currentUserRole', user?.role || '');
      params.append('currentUserBranchId', user?.branchId || '');
      params.append('includeStats', 'true');

      const response = await fetch(`/api/couriers?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        setCouriers(data.couriers || []);
      } else {
        showErrorToast('Error', data.error || 'Failed to fetch couriers');
      }
    } catch (error) {
      console.error('Failed to fetch couriers:', error);
      showErrorToast('Error', 'Failed to fetch couriers');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const method = editingCourier ? 'PUT' : 'POST';
      const url = editingCourier ? `/api/couriers/${editingCourier.id}` : '/api/couriers';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        showSuccessToast('Success', editingCourier ? 'Courier updated successfully!' : 'Courier added successfully!');
        setDialogOpen(false);
        resetForm();
        fetchCouriers();
      } else {
        showErrorToast('Error', data.error || 'Failed to save courier');
      }
    } catch (error) {
      console.error('Failed to save courier:', error);
      showErrorToast('Error', 'Failed to save courier');
    }
  };

  const handleEdit = (courier: Courier) => {
    setEditingCourier(courier);
    setFormData({
      name: courier.name,
      phone: courier.phone || '',
      email: courier.email || '',
      vehicleInfo: courier.vehicleInfo || '',
      branchId: courier.branchId,
      isActive: courier.isActive,
    });
    setDialogOpen(true);
  };

  const handleDelete = (courier: Courier) => {
    setDeletingCourier(courier);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingCourier) return;

    try {
      const response = await fetch(`/api/couriers/${deletingCourier.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        showSuccessToast('Success', 'Courier deleted successfully!');
        setDeleteDialogOpen(false);
        setDeletingCourier(null);
        fetchCouriers();
      } else {
        showErrorToast('Error', data.error || 'Failed to delete courier');
      }
    } catch (error) {
      console.error('Failed to delete courier:', error);
      showErrorToast('Error', 'Failed to delete courier');
    }
  };

  const handleToggleStatus = async (courier: Courier) => {
    try {
      const response = await fetch(`/api/couriers/${courier.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !courier.isActive }),
      });

      const data = await response.json();

      if (response.ok) {
        showSuccessToast('Success', `Courier ${!courier.isActive ? 'activated' : 'deactivated'} successfully!`);
        fetchCouriers();
      } else {
        showErrorToast('Error', data.error || 'Failed to update courier status');
      }
    } catch (error) {
      console.error('Failed to toggle courier status:', error);
      showErrorToast('Error', 'Failed to update courier status');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      vehicleInfo: '',
      branchId: user?.role === 'BRANCH_MANAGER' ? user.branchId || '' : '',
      isActive: true,
    });
    setEditingCourier(null);
  };

  const handleCall = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  const handleEmail = (email: string) => {
    window.location.href = `mailto:${email}`;
  };

  const filteredCouriers = searchQuery
    ? couriers.filter(courier =>
        courier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        courier.phone?.includes(searchQuery) ||
        courier.branchName?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : couriers;

  const activeCount = couriers.filter(c => c.isActive).length;
  const totalOrders = couriers.reduce((sum, c) => sum + (c._count?.orders || 0), 0);
  const totalRevenue = couriers.reduce((sum, c) => sum + (c.totalRevenue || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-600 to-purple-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <UserCog className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Couriers</h1>
            <p className="text-purple-100 text-sm">Manage delivery team</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-purple-100 text-xs">Active</p>
              <p className="text-lg font-bold">{activeCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-purple-100 text-xs">Orders</p>
              <p className="text-lg font-bold">{totalOrders}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-purple-100 text-xs">Revenue</p>
              <p className="text-lg font-bold">{currency} {totalRevenue.toFixed(0)}</p>
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
            placeholder="Search couriers..."
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
          className="w-full h-14 text-lg bg-purple-600 hover:bg-purple-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Courier
        </Button>

        {/* Couriers List */}
        <ScrollArea className="h-[calc(100vh-420px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full mb-3" />
              <p>Loading couriers...</p>
            </div>
          ) : filteredCouriers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <UserCog className="w-16 h-16 mb-4 text-slate-300" />
              <p className="font-medium">No couriers found</p>
              <p className="text-sm">Add your first courier to get started</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {filteredCouriers.map((courier) => (
                <Card key={courier.id} className={`hover:shadow-md transition-shadow ${!courier.isActive ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4">
                    {/* Header with name and status */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h3 className="font-semibold text-slate-900 text-base">{courier.name}</h3>
                          {courier.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-700 text-xs gap-1 h-6">
                              <CheckCircle className="h-3 w-3" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs gap-1 h-6">
                              <XCircle className="h-3 w-3" />
                              Inactive
                            </Badge>
                          )}
                        </div>
                        {courier.branchName && (
                          <p className="text-sm text-slate-600">{courier.branchName}</p>
                        )}
                      </div>
                    </div>

                    {/* Contact Information */}
                    <div className="space-y-2 mb-3">
                      {courier.phone && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Phone className="h-4 w-4 flex-shrink-0" />
                          <span className="break-all">{courier.phone}</span>
                        </div>
                      )}
                      {courier.email && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Mail className="h-4 w-4 flex-shrink-0" />
                          <span className="break-all">{courier.email}</span>
                        </div>
                      )}
                      {courier.vehicleInfo && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Motorcycle className="h-4 w-4 flex-shrink-0" />
                          <span>{courier.vehicleInfo}</span>
                        </div>
                      )}
                    </div>

                    {/* Statistics */}
                    <div className="bg-purple-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-purple-900">
                          <Package className="h-4 w-4" />
                          <span className="font-medium">
                            {courier._count?.orders || 0} orders
                          </span>
                        </div>
                        {courier.totalRevenue !== undefined && (
                          <div className="text-sm text-purple-900 font-semibold">
                            {currency} {courier.totalRevenue.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Contact Buttons */}
                    {courier.phone && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCall(courier.phone!)}
                          className="h-10 text-green-700 border-green-300 hover:bg-green-50"
                        >
                          <Phone className="w-4 h-4 mr-2" />
                          Call
                        </Button>
                        {courier.email && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEmail(courier.email!)}
                            className="h-10 text-blue-700 border-blue-300 hover:bg-blue-50"
                          >
                            <Mail className="w-4 h-4 mr-2" />
                            Email
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(courier)}
                        className="flex-1 h-10"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStatus(courier)}
                        className={`flex-1 h-10 ${courier.isActive ? 'text-orange-600 border-orange-300 hover:bg-orange-50' : 'text-green-600 border-green-300 hover:bg-green-50'}`}
                      >
                        {courier.isActive ? (
                          <>
                            <XCircle className="w-4 h-4 mr-2" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Activate
                          </>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(courier)}
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
              {editingCourier ? 'Edit Courier' : 'Add New Courier'}
            </DialogTitle>
            <DialogDescription>
              {editingCourier ? 'Update courier information' : 'Enter details for the new courier'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter courier name"
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g., 01012345678"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g., courier@example.com"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vehicleInfo">Vehicle Information (Optional)</Label>
                <Input
                  id="vehicleInfo"
                  value={formData.vehicleInfo}
                  onChange={(e) => setFormData({ ...formData, vehicleInfo: e.target.value })}
                  placeholder="e.g., Honda Wave, License: ABC123"
                  className="h-11"
                />
              </div>

              {user?.role === 'ADMIN' && (
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch *</Label>
                  <Select
                    value={formData.branchId}
                    onValueChange={(value) => setFormData({ ...formData, branchId: value })}
                    required
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.branchName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="h-5 w-5 rounded border-gray-300 focus:ring-primary"
                />
                <Label htmlFor="isActive" className="text-sm cursor-pointer">Active (can receive orders)</Label>
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
                className="w-full sm:w-auto h-11 bg-purple-600 hover:bg-purple-700"
              >
                {editingCourier ? 'Update' : 'Add'} Courier
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Courier</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-700">
              Are you sure you want to delete "{deletingCourier?.name}"? This action cannot be undone.
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Any active orders assigned to this courier will need to be reassigned.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => { setDeleteDialogOpen(false); setDeletingCourier(null); }}
              className="w-full sm:w-auto h-11"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="w-full sm:w-auto h-11"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
