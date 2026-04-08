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
  Building2,
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  Key,
  Phone,
  MapPin,
  Clock,
  AlertTriangle,
  Shield,
  ChevronLeft,
  LayoutDashboard,
} from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';

interface Branch {
  id: string;
  branchName: string;
  licenseKey: string;
  licenseExpiresAt: string;
  isActive: boolean;
  isRevoked?: boolean;
  phone?: string;
  address?: string;
  lastSyncAt?: string;
  menuVersion: number;
  createdAt: string;
}

interface BranchFormData {
  branchName: string;
  licenseKey: string;
  expirationDays: string;
  phone: string;
  address: string;
}

export function MobileBranches() {
  const { user: currentUser } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState<BranchFormData>({
    branchName: '',
    licenseKey: '',
    expirationDays: '365',
    phone: '',
    address: '',
  });

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/branches');
      const data = await response.json();

      if (response.ok && data.branches) {
        setBranches(data.branches);
      } else {
        showErrorToast('Error', data.error || 'Failed to fetch branches');
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
      showErrorToast('Error', 'Failed to fetch branches');
    } finally {
      setLoading(false);
    }
  };

  const formatLicenseKey = (key: string) => {
    if (!key || key.length < 8) return key;
    const start = key.substring(0, 4);
    const end = key.substring(key.length - 4);
    return `${start}••••••••${end}`;
  };

  const filteredBranches = branches.filter((branch) =>
    branch.branchName.toLowerCase().includes(search.toLowerCase()) ||
    branch.licenseKey.toLowerCase().includes(search.toLowerCase())
  );

  const getLicenseStatus = (branch: Branch) => {
    if (branch.isRevoked) {
      return { status: 'revoked', color: 'bg-red-600', text: 'Revoked' };
    }

    const daysUntilExpiry = Math.ceil(
      (new Date(branch.licenseExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry < 0) return { status: 'expired', color: 'bg-red-500', text: 'Expired' };
    if (daysUntilExpiry < 30) return { status: 'warning', color: 'bg-amber-500', text: `${daysUntilExpiry} days left` };
    return { status: 'valid', color: 'bg-green-500', text: `Valid until ${new Date(branch.licenseExpiresAt).toLocaleDateString()}` };
  };

  const getSyncStatus = (branch: Branch) => {
    if (!branch.lastSyncAt) return { status: 'never', color: 'bg-slate-500' };

    const minutesSinceSync = (Date.now() - new Date(branch.lastSyncAt).getTime()) / (1000 * 60);

    if (minutesSinceSync < 10) return { status: 'recent', color: 'bg-green-500' };
    if (minutesSinceSync < 60) return { status: 'ok', color: 'bg-blue-500' };
    if (minutesSinceSync < 1440) return { status: 'delayed', color: 'bg-amber-500' };
    return { status: 'offline', color: 'bg-red-500' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Only admins can manage branches
    if (currentUser?.role !== 'ADMIN') {
      showErrorToast('Error', 'Only admins can manage branches');
      return;
    }

    try {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + parseInt(formData.expirationDays));

      if (editingBranch) {
        const response = await fetch('/api/branches', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingBranch.id,
            branchName: formData.branchName,
            licenseKey: formData.licenseKey,
            licenseExpiresAt: expirationDate.toISOString(),
            phone: formData.phone,
            address: formData.address,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to update branch');
        }

        showSuccessToast('Success', 'Branch updated successfully');
      } else {
        const response = await fetch('/api/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchName: formData.branchName,
            licenseKey: formData.licenseKey,
            licenseExpiresAt: expirationDate.toISOString(),
            phone: formData.phone,
            address: formData.address,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create branch');
        }

        showSuccessToast('Success', 'Branch created successfully');
      }

      fetchBranches();
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save branch:', error);
      showErrorToast('Error', error instanceof Error ? error.message : 'Failed to save branch');
    }
  };

  const handleEdit = (branch: Branch) => {
    if (currentUser?.role !== 'ADMIN') {
      showErrorToast('Error', 'Only admins can edit branches');
      return;
    }

    setEditingBranch(branch);
    const daysUntilExpiry = Math.ceil(
      (new Date(branch.licenseExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    setFormData({
      branchName: branch.branchName,
      licenseKey: branch.licenseKey,
      expirationDays: daysUntilExpiry.toString(),
      phone: branch.phone || '',
      address: branch.address || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (branch: Branch) => {
    if (currentUser?.role !== 'ADMIN') {
      showErrorToast('Error', 'Only admins can delete branches');
      return;
    }

    if (!confirm('Are you sure you want to delete this branch? This will revoke the license.')) return;

    try {
      const response = await fetch(`/api/branches?id=${branch.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete branch');
      }

      showSuccessToast('Success', 'Branch deleted successfully');
      fetchBranches();
    } catch (error) {
      console.error('Failed to delete branch:', error);
      showErrorToast('Error', error instanceof Error ? error.message : 'Failed to delete branch');
    }
  };

  const toggleBranchStatus = async (branch: Branch) => {
    if (currentUser?.role !== 'ADMIN') {
      showErrorToast('Error', 'Only admins can change branch status');
      return;
    }

    const action = branch.isActive ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this branch?`)) return;

    try {
      const response = await fetch('/api/branches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: branch.id,
          isActive: !branch.isActive,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update branch status');
      }

      showSuccessToast('Success', `Branch ${action}d successfully`);
      fetchBranches();
    } catch (error) {
      console.error('Failed to toggle branch status:', error);
      showErrorToast('Error', error instanceof Error ? error.message : 'Failed to update branch status');
    }
  };

  const resetForm = () => {
    setEditingBranch(null);
    setFormData({
      branchName: '',
      licenseKey: '',
      expirationDays: '365',
      phone: '',
      address: '',
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (selectedBranch) {
    const licenseStatus = getLicenseStatus(selectedBranch);
    const syncStatus = getSyncStatus(selectedBranch);

    return (
      <div className="h-full flex flex-col bg-slate-50">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-600 to-slate-700 text-white px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setSelectedBranch(null)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold truncate">{selectedBranch.branchName}</h1>
            <p className="text-slate-100 text-sm">Branch Details</p>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {/* Status */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Status</span>
                  <Badge variant={selectedBranch.isActive ? 'default' : 'secondary'}>
                    {selectedBranch.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* License Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-slate-600" />
                  License Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${licenseStatus.color}`} />
                  <span className="font-medium">{licenseStatus.text}</span>
                  {licenseStatus.status === 'warning' && (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  {licenseStatus.status === 'revoked' && (
                    <Shield className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className="p-2 bg-slate-100 rounded-lg">
                  <code className="text-xs font-mono">{formatLicenseKey(selectedBranch.licenseKey)}</code>
                </div>
                <p className="text-sm text-slate-600">
                  Expires: {formatDate(selectedBranch.licenseExpiresAt)}
                </p>
              </CardContent>
            </Card>

            {/* Sync Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-slate-600" />
                  Sync Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${syncStatus.color}`} />
                    <span className="font-medium capitalize">{syncStatus.status}</span>
                  </div>
                  <span className="text-sm text-slate-600">v{selectedBranch.menuVersion}</span>
                </div>
                {selectedBranch.lastSyncAt && (
                  <p className="text-xs text-slate-500">
                    Last sync: {Math.floor((Date.now() - new Date(selectedBranch.lastSyncAt).getTime()) / 60000)} minutes ago
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Contact Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-slate-600" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedBranch.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-slate-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-600">Phone</p>
                      <p className="font-medium">{selectedBranch.phone}</p>
                    </div>
                  </div>
                )}
                {selectedBranch.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-slate-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-600">Address</p>
                      <p className="font-medium">{selectedBranch.address}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Created Date */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Created</span>
                  <span className="font-medium">{formatDate(selectedBranch.createdAt)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Actions - Admin Only */}
            {currentUser?.role === 'ADMIN' && (
              <>
                <Button
                  className="w-full h-14 bg-slate-600 hover:bg-slate-700"
                  onClick={() => {
                    setSelectedBranch(null);
                    handleEdit(selectedBranch);
                  }}
                >
                  <Pencil className="h-5 w-5 mr-2" />
                  Edit Branch
                </Button>
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-600 to-slate-700 text-white px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">Branches</h1>
          <Button
            variant="secondary"
            size="icon"
            className="bg-white/20 hover:bg-white/30 text-white"
            onClick={fetchBranches}
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
          <Input
            placeholder="Search branches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white/20 border-white/30 text-white placeholder:text-white/60 h-12"
          />
        </div>
      </div>

      {/* Branch List */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-slate-500 border-t-transparent rounded-full"></div>
          </div>
        ) : filteredBranches.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-4">No branches found</p>
              {currentUser?.role === 'ADMIN' && (
                <Button
                  className="bg-slate-600 hover:bg-slate-700"
                  onClick={() => setIsDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Branch
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredBranches.map((branch) => {
              const licenseStatus = getLicenseStatus(branch);
              const syncStatus = getSyncStatus(branch);

              return (
                <Card
                  key={branch.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedBranch(branch)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg truncate">{branch.branchName}</h3>
                        <p className="text-sm text-slate-600 font-mono truncate">
                          {formatLicenseKey(branch.licenseKey)}
                        </p>
                      </div>
                      <Badge variant={branch.isActive ? 'default' : 'secondary'}>
                        {branch.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm mb-2">
                      <div className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${licenseStatus.color}`} />
                        <span className="text-xs text-slate-600 truncate">{licenseStatus.text}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${syncStatus.color}`} />
                        <span className="text-xs text-slate-600 capitalize">{syncStatus.status}</span>
                      </div>
                    </div>
                    {currentUser?.role === 'ADMIN' && (
                      <div className="flex gap-2 mt-3 pt-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 h-10"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBranchStatus(branch);
                          }}
                        >
                          {branch.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(branch);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-red-600 hover:text-red-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(branch);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Add Branch Button - Admin Only */}
      {currentUser?.role === 'ADMIN' && (
        <div className="p-4 bg-white border-t">
          <Button
            className="w-full h-14 bg-slate-600 hover:bg-slate-700"
            onClick={() => setIsDialogOpen(true)}
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Branch
          </Button>
        </div>
      )}

      {/* Add/Edit Branch Dialog - Admin Only */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBranch ? 'Edit Branch' : 'Add New Branch'}</DialogTitle>
            <DialogDescription>
              {editingBranch ? 'Update branch information' : 'Create a new branch with license'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="branchName">Branch Name *</Label>
                <Input
                  id="branchName"
                  value={formData.branchName}
                  onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                  placeholder="e.g., Downtown"
                  required
                  className="h-12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="licenseKey">License Key *</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="licenseKey"
                    value={formData.licenseKey}
                    onChange={(e) => setFormData({ ...formData, licenseKey: e.target.value })}
                    placeholder="LIC-XXXX-YYYY-ZZZZ"
                    className="pl-10 font-mono h-12"
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g., +20 123 456 7890"
                    className="pl-10 h-12"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="e.g., 123 Main Street"
                    className="pl-10 h-12"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expirationDays">License Duration (days) *</Label>
                <Input
                  id="expirationDays"
                  type="number"
                  min="1"
                  value={formData.expirationDays}
                  onChange={(e) => setFormData({ ...formData, expirationDays: e.target.value })}
                  placeholder="365"
                  required
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
                className="bg-slate-600 hover:bg-slate-700 w-full sm:w-auto h-12"
              >
                {editingBranch ? 'Update' : 'Create'} Branch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
