'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  Lock,
  Key,
  Power,
  PowerOff,
  ChevronLeft,
  Shield,
  Building2,
  Mail,
  User as UserIcon,
  Calendar,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface User {
  id: string;
  username: string;
  email: string;
  name?: string;
  role: 'ADMIN' | 'BRANCH_MANAGER' | 'CASHIER';
  branchId?: string;
  branchName?: string;
  userCode?: string;
  hasPin?: boolean;
  isActive: boolean;
  createdAt: string;
}

interface UserFormData {
  username: string;
  email: string;
  name?: string;
  password?: string;
  role: 'ADMIN' | 'BRANCH_MANAGER' | 'CASHIER';
  branchId?: string;
}

export function MobileUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordTargetUser, setPasswordTargetUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    email: '',
    name: '',
    password: '',
    role: 'CASHIER',
    branchId: currentUser?.branchId || '',
  });
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    fetchBranches();
    fetchUsers();
  }, []);

  const fetchBranches = async () => {
    try {
      const response = await fetch('/api/branches');
      const data = await response.json();
      if (response.ok && data.branches) {
        setBranches(data.branches.map((b: any) => ({ id: b.id, name: b.branchName })));
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentUser?.role === 'BRANCH_MANAGER' && currentUser?.branchId) {
        params.append('currentUserBranchId', currentUser.branchId);
        params.append('currentUserRole', 'BRANCH_MANAGER');
      }

      const response = await fetch(`/api/users?${params.toString()}`);
      const data = await response.json();

      if (response.ok && data.success) {
        setUsers(data.users);
      } else {
        showErrorToast('Error', data.error || 'Failed to fetch users');
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      showErrorToast('Error', 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      (user.username?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (user.name?.toLowerCase() || '').includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <Badge className="bg-emerald-600">HQ Admin</Badge>;
      case 'BRANCH_MANAGER':
        return <Badge className="bg-blue-600">Branch Manager</Badge>;
      case 'CASHIER':
        return <Badge className="bg-slate-600">Cashier</Badge>;
      default:
        return <Badge>{role}</Badge>;
    }
  };

  const canCreateUser = () => {
    return currentUser?.role === 'ADMIN' || currentUser?.role === 'BRANCH_MANAGER';
  };

  const canEditUser = (user: User) => {
    if (!currentUser) return false;
    if (currentUser.role === 'ADMIN') {
      return currentUser.id !== user.id;
    }
    if (currentUser.role === 'BRANCH_MANAGER') {
      return user.role === 'CASHIER' && user.branchId === currentUser.branchId;
    }
    return false;
  };

  const canDeleteUser = (user: User) => {
    if (!currentUser) return false;
    if (currentUser.role === 'ADMIN') {
      return currentUser.id !== user.id;
    }
    if (currentUser.role === 'BRANCH_MANAGER') {
      return user.role === 'CASHIER' && user.branchId === currentUser.branchId;
    }
    return false;
  };

  const canChangeStatus = (user: User) => {
    if (!currentUser) return false;
    if (currentUser.id === user.id) return false;
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.role === 'BRANCH_MANAGER') {
      return user.role === 'CASHIER' && user.branchId === currentUser.branchId;
    }
    return false;
  };

  const canChangePassword = (user: User) => {
    if (!currentUser) return false;
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.role === 'BRANCH_MANAGER') {
      return currentUser.id === user.id || (user.role === 'CASHIER' && user.branchId === currentUser.branchId);
    }
    if (currentUser.role === 'CASHIER') {
      return currentUser.id === user.id;
    }
    return false;
  };

  const handlePasswordChange = async () => {
    if (!passwordTargetUser || !currentUser) return;

    if (passwordData.newPassword.length < 8) {
      showErrorToast('Error', 'Password must be at least 8 characters long');
      return;
    }
    if (!/[A-Z]/.test(passwordData.newPassword)) {
      showErrorToast('Error', 'Password must contain at least one uppercase letter');
      return;
    }
    if (!/[a-z0-9]/.test(passwordData.newPassword)) {
      showErrorToast('Error', 'Password must contain at least one lowercase letter or number');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showErrorToast('Error', 'Passwords do not match');
      return;
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: passwordTargetUser.id,
          newPassword: passwordData.newPassword,
          requesterUserId: currentUser.id,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showErrorToast('Error', data.error || 'Failed to change password');
        return;
      }

      showSuccessToast('Success', 'Password changed successfully!');
      setIsPasswordDialogOpen(false);
      setPasswordData({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      console.error('Password change error:', error);
      showErrorToast('Error', 'Failed to change password');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentUser?.role === 'BRANCH_MANAGER') {
      if (formData.role !== 'CASHIER') {
        showErrorToast('Error', 'Branch Managers can only create Cashier accounts');
        return;
      }
      if (formData.branchId !== currentUser.branchId) {
        showErrorToast('Error', 'Branch Managers can only create users for their branch');
        return;
      }
    }

    if (!editingUser && !formData.password) {
      showErrorToast('Error', 'Password is required for new users');
      return;
    }

    try {
      const submissionData: any = {
        username: formData.username,
        email: formData.email,
        name: formData.name,
        role: formData.role,
        createdBy: currentUser?.id,
        branchId: formData.role === 'ADMIN' ? undefined : formData.branchId,
      };

      if (editingUser) {
        const response = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...submissionData,
            requesterId: currentUser?.id,
            requesterRole: currentUser?.role,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          showErrorToast('Error', data.error || 'Failed to update user');
          return;
        }

        showSuccessToast('Success', 'User updated successfully');
      } else {
        submissionData.password = formData.password;

        const response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submissionData),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          showErrorToast('Error', data.error || 'Failed to create user');
          return;
        }

        showSuccessToast('Success', 'User created successfully');
      }

      fetchUsers();
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save user:', error);
      showErrorToast('Error', 'Failed to save user');
    }
  };

  const handleEdit = (user: User) => {
    if (!canEditUser(user)) {
      showErrorToast('Error', 'You do not have permission to edit this user');
      return;
    }

    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      name: user.name,
      password: '',
      role: user.role,
      branchId: user.branchId || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (user: User) => {
    if (!canDeleteUser(user)) {
      showErrorToast('Error', 'You do not have permission to delete this user');
      return;
    }

    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const response = await fetch(
        `/api/users/${user.id}?requesterId=${currentUser?.id}&requesterRole=${currentUser?.role}`,
        { method: 'DELETE' }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        showErrorToast('Error', data.error || 'Failed to delete user');
        return;
      }

      showSuccessToast('Success', 'User deleted successfully');
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      showErrorToast('Error', 'Failed to delete user');
    }
  };

  const handleToggleStatus = async (user: User) => {
    const action = user.isActive ? 'deactivate' : 'activate';

    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
      const response = await fetch(`/api/users/${user.id}?requesterId=${currentUser?.id}&requesterRole=${currentUser?.role}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...user,
          isActive: !user.isActive,
          requesterId: currentUser?.id,
          requesterRole: currentUser?.role,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showErrorToast('Error', data.error || `Failed to ${action} user`);
        return;
      }

      showSuccessToast('Success', `User ${action}d successfully`);
      fetchUsers();
    } catch (error) {
      console.error(`Failed to ${action} user:`, error);
      showErrorToast('Error', `Failed to ${action} user`);
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      name: '',
      password: '',
      role: 'CASHIER',
      branchId: currentUser?.branchId || '',
    });
    setEditingUser(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (selectedUser) {
    return (
      <div className="h-full flex flex-col bg-slate-50">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setSelectedUser(null)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold truncate">{selectedUser.username}</h1>
            <p className="text-blue-100 text-sm">User Details</p>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {/* Status */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Status</span>
                  <Badge variant={selectedUser.isActive ? 'default' : 'secondary'}>
                    {selectedUser.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Role */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                  Role
                </CardTitle>
              </CardHeader>
              <CardContent>
                {getRoleBadge(selectedUser.role)}
              </CardContent>
            </Card>

            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserIcon className="h-5 w-5 text-blue-600" />
                  Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Username</span>
                  <span className="font-medium">{selectedUser.username}</span>
                </div>
                {selectedUser.name && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Full Name</span>
                    <span className="font-medium">{selectedUser.name}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Email</span>
                  <span className="font-medium text-xs truncate max-w-[200px]">{selectedUser.email}</span>
                </div>
                {selectedUser.userCode && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">User Code</span>
                    <Badge variant="outline" className="font-mono">{selectedUser.userCode}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Branch */}
            {selectedUser.branchName && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    Branch
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{selectedUser.branchName}</p>
                </CardContent>
              </Card>
            )}

            {/* Created Date */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  Created
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{formatDate(selectedUser.createdAt)}</p>
              </CardContent>
            </Card>

            {/* Actions */}
            {canEditUser(selectedUser) && (
              <Button
                className="w-full h-14 bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  setSelectedUser(null);
                  handleEdit(selectedUser);
                }}
              >
                <Pencil className="h-5 w-5 mr-2" />
                Edit User
              </Button>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">Users</h1>
          <Button
            variant="secondary"
            size="icon"
            className="bg-white/20 hover:bg-white/30 text-white"
            onClick={fetchUsers}
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white/20 border-white/30 text-white placeholder:text-white/60 h-12"
          />
        </div>

        {/* Role Filter */}
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="bg-white/20 border-white/30 text-white">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="ADMIN">HQ Admin</SelectItem>
            <SelectItem value="BRANCH_MANAGER">Branch Manager</SelectItem>
            <SelectItem value="CASHIER">Cashier</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* User List */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-4">No users found</p>
              {canCreateUser() && (
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => setIsDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredUsers.map((user) => (
              <Card
                key={user.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedUser(user)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg">{user.username}</h3>
                        {user.userCode && (
                          <Badge variant="outline" className="font-mono text-xs">{user.userCode}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 truncate">{user.email}</p>
                      {user.name && (
                        <p className="text-sm text-slate-600">{user.name}</p>
                      )}
                    </div>
                    {getRoleBadge(user.role)}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={user.isActive ? 'default' : 'secondary'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {user.branchName && (
                        <span className="text-slate-500">{user.branchName}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {canChangePassword(user) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPasswordTargetUser(user);
                            setIsPasswordDialogOpen(true);
                          }}
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                      )}
                      {canChangeStatus(user) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${user.isActive ? 'hover:text-orange-600' : 'hover:text-green-600'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStatus(user);
                          }}
                        >
                          {user.isActive ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Add User Button */}
      {canCreateUser() && (
        <div className="p-4 bg-white border-t">
          <Button
            className="w-full h-14 bg-blue-600 hover:bg-blue-700"
            onClick={() => setIsDialogOpen(true)}
          >
            <Plus className="h-5 w-5 mr-2" />
            Add User
          </Button>
        </div>
      )}

      {/* Add/Edit User Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Update user information' : 'Create a new user account'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Enter username"
                  required
                  disabled={!!editingUser}
                  className="h-12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@example.com"
                  required
                  className="h-12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Doe"
                  className="h-12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: any) => setFormData({ ...formData, role: value })}
                  disabled={currentUser?.role === 'BRANCH_MANAGER'}
                >
                  <SelectTrigger id="role" className="h-12">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentUser?.role === 'ADMIN' && (
                      <>
                        <SelectItem value="ADMIN">HQ Admin - Full control</SelectItem>
                        <SelectItem value="BRANCH_MANAGER">Branch Manager - Manage branch</SelectItem>
                      </>
                    )}
                    <SelectItem value="CASHIER">Cashier - Process sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.role !== 'ADMIN' && (
                <div className="grid gap-2">
                  <Label htmlFor="branch">Branch *</Label>
                  <Select
                    value={formData.branchId}
                    onValueChange={(value: any) => setFormData({ ...formData, branchId: value })}
                    disabled={currentUser?.role === 'BRANCH_MANAGER'}
                  >
                    <SelectTrigger id="branch" className="h-12">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!editingUser && (
                <div className="grid gap-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className="h-12"
                  />
                  <p className="text-xs text-slate-500">
                    Min 8 chars, uppercase + lowercase/number
                  </p>
                </div>
              )}
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
                className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto h-12"
              >
                {editingUser ? 'Update' : 'Create'} User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-blue-600" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              Change password for: <strong>{passwordTargetUser?.username}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="newPassword">New Password *</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                placeholder="Enter new password"
                minLength={8}
                className="h-12"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                placeholder="Confirm new password"
                minLength={8}
                className="h-12"
              />
            </div>
            <p className="text-xs text-slate-500">
              Min 8 chars, uppercase + lowercase/number
            </p>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsPasswordDialogOpen(false);
                setPasswordData({ newPassword: '', confirmPassword: '' });
              }}
              className="w-full sm:w-auto h-12"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePasswordChange}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto h-12"
            >
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
