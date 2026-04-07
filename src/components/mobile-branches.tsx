'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { 
  Store, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Phone, 
  MapPin, 
  Key, 
  CheckCircle, 
  Clock, 
  RefreshCw,
  AlertTriangle,
  Shield,
  Lock
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface Branch {
  id: string;
  branchName: string;
  licenseKey: string;
  licenseExpiresAt: Date;
  isActive: boolean;
  isRevoked?: boolean;
  phone?: string;
  address?: string;
  lastSyncAt?: Date;
  menuVersion: number;
  createdAt: Date;
}

interface BranchFormData {
  branchName: string;
  licenseKey: string;
  expirationDays: string;
  phone: string;
  address: string;
}

export function MobileBranches() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState<BranchFormData>({
    branchName: '',
    licenseKey: '',
    expirationDays: '365',
    phone: '',
    address: '',
  });
  const [loading, setLoading] = useState(false);

  // Fetch branches from database
  const fetchBranches = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/branches');
      const data = await response.json();

      if (response.ok && data.branches) {
        const branchesList = data.branches.map((branch: any) => ({
          id: branch.id,
          branchName: branch.branchName,
          licenseKey: branch.licenseKey,
          licenseExpiresAt: new Date(branch.licenseExpiresAt),
          isActive: branch.isActive,
          isRevoked: branch.licenses?.[0]?.isRevoked || false,
          phone: branch.phone || undefined,
          address: branch.address || undefined,
          lastSyncAt: branch.lastSyncAt ? new Date(branch.lastSyncAt) : undefined,
          menuVersion: branch.menuVersion || 1,
          createdAt: new Date(branch.createdAt),
        }));
        setBranches(branchesList);
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
      showErrorToast('Error', 'Failed to fetch branches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  // Format license key for display (truncate with dots in middle)
  const formatLicenseKey = (key: string) => {
    if (!key || key.length < 8) return key;
    const start = key.substring(0, 4);
    const end = key.substring(key.length - 4);
    return `${start}••••••••${end}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + parseInt(formData.expirationDays));

      if (editingBranch) {
        // Update existing branch
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

        showSuccessToast('Success', 'Branch updated successfully!');
        await fetchBranches(); // Refresh the list
      } else {
        // Create new branch
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

        showSuccessToast('Success', 'Branch created successfully!');
        await fetchBranches(); // Refresh the list
      }

      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save branch:', error);
      showErrorToast('Error', error instanceof Error ? error.message : 'Failed to save branch');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    const daysUntilExpiry = Math.ceil(
      (branch.licenseExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    setFormData({
      branchName: branch.branchName,
      licenseKey: branch.licenseKey,
      expirationDays: daysUntilExpiry.toString(),
      phone: branch.phone || '',
      address: branch.address || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (branchId: string) => {
    if (!confirm('Are you sure you want to delete this branch? This will revoke the license.')) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/branches?id=${branchId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete branch');
      }

      showSuccessToast('Success', 'Branch deleted successfully!');
      await fetchBranches(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete branch:', error);
      showErrorToast('Error', error instanceof Error ? error.message : 'Failed to delete branch');
    } finally {
      setLoading(false);
    }
  };

  const toggleBranchStatus = async (branchId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this branch?`)) return;
    setLoading(true);
    try {
      const response = await fetch('/api/branches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: branchId,
          isActive: !currentStatus,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update branch status');
      }

      showSuccessToast('Success', `Branch ${action}d successfully!`);
      await fetchBranches(); // Refresh the list
    } catch (error) {
      console.error('Failed to toggle branch status:', error);
      showErrorToast('Error', error instanceof Error ? error.message : 'Failed to update branch status');
    } finally {
      setLoading(false);
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

  const getSyncStatus = (branch: Branch) => {
    if (!branch.lastSyncAt) return { status: 'Never', color: 'bg-slate-500' };

    const minutesSinceSync = (Date.now() - branch.lastSyncAt.getTime()) / (1000 * 60);

    if (minutesSinceSync < 10) return { status: 'Recent', color: 'bg-green-500' };
    if (minutesSinceSync < 60) return { status: 'OK', color: 'bg-blue-500' };
    if (minutesSinceSync < 1440) return { status: 'Delayed', color: 'bg-amber-500' };
    return { status: 'Offline', color: 'bg-red-500' };
  };

  const getLicenseStatus = (branch: Branch) => {
    // Check if license is revoked first
    if (branch.isRevoked) {
      return { status: 'Revoked', color: 'bg-red-600', badgeColor: 'bg-red-100 text-red-700' };
    }

    const daysUntilExpiry = Math.ceil(
      (branch.licenseExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry < 0) return { status: 'Expired', color: 'bg-red-500', badgeColor: 'bg-red-100 text-red-700' };
    if (daysUntilExpiry < 30) return { status: `${daysUntilExpiry} days left`, color: 'bg-amber-500', badgeColor: 'bg-amber-100 text-amber-700' };
    return { status: 'Valid', color: 'bg-green-500', badgeColor: 'bg-green-100 text-green-700' };
  };

  const filteredBranches = branches.filter((branch) =>
    branch.branchName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    branch.licenseKey.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Only Admins can manage branches
  const canManageBranches = user?.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <Store className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Branches</h1>
            <p className="text-indigo-100 text-sm">Manage branch licenses</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-indigo-100 text-xs">Total</p>
              <p className="text-lg font-bold">{branches.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-indigo-100 text-xs">Active</p>
              <p className="text-lg font-bold">{branches.filter(b => b.isActive).length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-indigo-100 text-xs">Inactive</p>
              <p className="text-lg font-bold">{branches.filter(b => !b.isActive).length}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Search branches..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-12 bg-white"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Add Branch Button (Admin Only) */}
        {canManageBranches && (
          <Button
            onClick={() => { resetForm(); setDialogOpen(true); }}
            className="w-full h-14 text-lg bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Branch
          </Button>
        )}

        {/* Branches List */}
        <ScrollArea className="h-[calc(100vh-420px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full mb-3" />
              <p>Loading branches...</p>
            </div>
          ) : filteredBranches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Store className="w-16 h-16 mb-4 text-slate-300" />
              <p className="font-medium">No branches found</p>
              <p className="text-sm">
                {searchTerm ? 'Try a different search term' : 'Add your first branch to get started'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {filteredBranches.map((branch) => {
                const syncStatus = getSyncStatus(branch);
                const licenseStatus = getLicenseStatus(branch);
                return (
                  <Card key={branch.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      {/* Branch Header */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Store className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-semibold text-slate-900">{branch.branchName}</h3>
                            <Badge className={`${licenseStatus.badgeColor} text-xs`}>
                              {licenseStatus.status === 'Valid' ? <CheckCircle className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                              {licenseStatus.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-slate-600 mb-1">
                            <Key className="h-3.5 w-3.5 flex-shrink-0" />
                            <code className="text-xs bg-slate-100 px-2 py-0.5 rounded truncate">
                              {formatLicenseKey(branch.licenseKey)}
                            </code>
                          </div>
                        </div>
                      </div>

                      {/* Branch Details */}
                      <div className="space-y-2 mb-3">
                        {branch.phone && (
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Phone className="h-4 w-4 flex-shrink-0 text-slate-400" />
                            <span className="break-all">{branch.phone}</span>
                          </div>
                        )}
                        {branch.address && (
                          <div className="flex items-start gap-2 text-sm text-slate-600">
                            <MapPin className="h-4 w-4 flex-shrink-0 text-slate-400 mt-0.5" />
                            <span className="break-all">{branch.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <div className={`w-2 h-2 rounded-full ${syncStatus.color} flex-shrink-0`} />
                          <span className="capitalize">{syncStatus.status}</span>
                          <span className="text-slate-400">•</span>
                          <span>Menu v{branch.menuVersion}</span>
                        </div>
                        {branch.lastSyncAt && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>
                              {Math.floor((Date.now() - branch.lastSyncAt.getTime()) / 60000)} minutes ago
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Status Toggle */}
                      <div className="flex items-center justify-between py-2 border-t border-slate-200 mb-3">
                        <div className="flex items-center gap-2">
                          {branch.isActive ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : (
                            <Lock className="h-5 w-5 text-slate-400" />
                          )}
                          <span className="text-sm font-medium text-slate-700">
                            {branch.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {canManageBranches && (
                          <Switch
                            checked={branch.isActive}
                            onCheckedChange={() => toggleBranchStatus(branch.id, branch.isActive)}
                          />
                        )}
                      </div>

                      {/* Actions */}
                      {canManageBranches && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(branch)}
                            className="flex-1 h-11"
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(branch.id)}
                            className="h-11 px-4"
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
      </div>

      {/* Add/Edit Branch Dialog (Admin Only) */}
      {canManageBranches && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingBranch ? 'Edit Branch' : 'Add New Branch'}</DialogTitle>
              <DialogDescription>
                {editingBranch 
                  ? 'Update branch information and license details' 
                  : 'Enter branch details and license information to add a new branch'
                }
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
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
                <div className="space-y-2">
                  <Label htmlFor="licenseKey">License Key *</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      id="licenseKey"
                      value={formData.licenseKey}
                      onChange={(e) => setFormData({ ...formData, licenseKey: e.target.value })}
                      placeholder="LIC-XXXX-YYYY-ZZZZ"
                      className="pl-10 h-12 font-mono"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
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
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="e.g., 123 Main Street, Cairo, Egypt"
                      className="pl-10 h-12"
                    />
                  </div>
                </div>
                <div className="space-y-2">
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
                  <p className="text-xs text-slate-500">
                    License will expire {formData.expirationDays} days from creation
                  </p>
                </div>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => { setDialogOpen(false); resetForm(); }} 
                  className="w-full sm:w-auto h-12"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="w-full sm:w-auto h-12 bg-indigo-600 hover:bg-indigo-700"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : (editingBranch ? 'Update Branch' : 'Add Branch')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
