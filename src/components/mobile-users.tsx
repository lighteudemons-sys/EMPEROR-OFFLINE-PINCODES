'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users, Plus, Search, Pencil, Trash2, Lock, Key, Power, PowerOff,
  Shield, Store, Mail, UserCircle, AlertCircle, X
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
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
  createdAt: Date;
}

interface UserFormData {
  username: string;
  email: string;
  name?: string;
  password?: string;
  role: 'ADMIN' | 'BRANCH_MANAGER' | 'CASHIER';
  branchId?: string;
  userCode?: string;
}

interface ChangePasswordData {
  newPassword: string;
  confirmPassword: string;
}

export default function MobileUsers() {
  const { user: currentUser } = useAuth();
  const { t } = useI18n();

  const roles = [
    { value: 'ADMIN', label: t('users.admin'), description: 'Full control over all branches' },
    { value: 'BRANCH_MANAGER', label: t('users.manager'), description: 'Manage single branch inventory and staff' },
    { value: 'CASHIER', label: t('users.cashier'), description: 'Process sales only' },
  ];

  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordTargetUser, setPasswordTargetUser] = useState<User | null>(null);
  const [pinTargetUser, setPinTargetUser] = useState<User | null>(null);
  const [generatedUserCode, setGeneratedUserCode] = useState<string | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    email: '',
    name: '',
    password: '',
    role: 'CASHIER',
    branchId: '',
    userCode: '',
  });
  const [passwordData, setPasswordData] = useState<ChangePasswordData>({
    newPassword: '',
    confirmPassword: '',
  });
  const [pinData, setPinData] = useState<{ pin: string; confirmPin: string }>({
    pin: '',
    confirmPin: '',
  });
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);

  // Fetch branches
  useEffect(() => {
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
    fetchBranches();
  }, []);

  // Fetch users
  useEffect(() => {
    fetchUsers();
  }, []);

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

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <Badge className="bg-emerald-600 gap-1"><Shield className="h-3 w-3" />{t('users.admin')}</Badge>;
      case 'BRANCH_MANAGER':
        return <Badge className="bg-blue-600 gap-1"><Store className="h-3 w-3" />{t('users.manager')}</Badge>;
      case 'CASHIER':
        return <Badge className="bg-slate-600 gap-1"><UserCircle className="h-3 w-3" />{t('users.cashier')}</Badge>;
      default:
        return <Badge>{role}</Badge>;
    }
  };

  const getStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return (
        <Badge className="bg-green-600 gap-1 h-7">
          <Power className="h-3 w-3" />
          Active
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1 h-7">
        <PowerOff className="h-3 w-3" />
        Inactive
      </Badge>
    );
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      (user.username?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (user.name?.toLowerCase() || '').includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const canCreateUser = () => {
    return currentUser?.role === 'ADMIN' || currentUser?.role === 'BRANCH_MANAGER';
  };

  const canEditUser = (user: User) => {
    if (!currentUser) return false;

    // HQ Admin: Can edit any user except themselves
    if (currentUser.role === 'ADMIN') {
      return currentUser.id !== user.id;
    }

    // Branch Manager: Can only edit cashiers in their branch
    if (currentUser.role === 'BRANCH_MANAGER') {
      return user.role === 'CASHIER' && user.branchId === currentUser.branchId;
    }

    // Cashier: Cannot edit users
    return false;
  };

  const canDeleteUser = (user: User) => {
    if (!currentUser) return false;

    // HQ Admin: Can delete any user except themselves
    if (currentUser.role === 'ADMIN') {
      return currentUser.id !== user.id;
    }

    // Branch Manager: Can only delete cashiers in their branch
    if (currentUser.role === 'BRANCH_MANAGER') {
      return user.role === 'CASHIER' && user.branchId === currentUser.branchId;
    }

    // Cashier: Cannot delete users
    return false;
  };

  const canChangeStatus = (user: User) => {
    if (!currentUser) return false;

    // Cannot change own status
    if (currentUser.id === user.id) return false;

    // HQ Admin: Can change any user's status
    if (currentUser.role === 'ADMIN') {
      return true;
    }

    // Branch Manager: Can only change cashiers in their branch
    if (currentUser.role === 'BRANCH_MANAGER') {
      return user.role === 'CASHIER' && user.branchId === currentUser.branchId;
    }

    // Cashier: Cannot change user status
    return false;
  };

  const canChangePassword = (user: User) => {
    if (!currentUser) return false;

    // HQ Admin: Can change any password
    if (currentUser.role === 'ADMIN') {
      return true;
    }

    // Branch Manager: Can change their own password or their cashiers' passwords
    if (currentUser.role === 'BRANCH_MANAGER') {
      return currentUser.id === user.id || (user.role === 'CASHIER' && user.branchId === currentUser.branchId);
    }

    // Cashier: Can only change their own password
    if (currentUser.role === 'CASHIER') {
      return currentUser.id === user.id;
    }

    return false;
  };

  const handlePasswordChange = async () => {
    if (!passwordTargetUser || !currentUser) return;

    // Validate
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
      showErrorToast('Error', t('form.password.mismatch'));
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      setPasswordDialogOpen(false);
      setPasswordData({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      console.error('Password change error:', error);
      showErrorToast('Error', t('msg.connection.error'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const openPasswordDialog = (user: User) => {
    if (!canChangePassword(user)) {
      let errorMsg = 'Only HQ Admins can change any password. ';
      if (currentUser?.role === 'BRANCH_MANAGER') {
        errorMsg += 'Branch Managers can change their own password and their cashiers\' passwords.';
      } else if (currentUser?.role === 'CASHIER') {
        errorMsg += 'Cashiers can only change their own password.';
      }
      showErrorToast('Error', errorMsg);
      return;
    }

    setPasswordTargetUser(user);
    setPasswordData({ newPassword: '', confirmPassword: '' });
    setPasswordDialogOpen(true);
  };

  const handlePinChange = async () => {
    if (!pinTargetUser || !currentUser) return;

    // Validate PIN
    if (pinData.pin.length < 4 || pinData.pin.length > 6) {
      showErrorToast('Error', 'PIN must be 4-6 digits');
      return;
    }

    if (!/^\d+$/.test(pinData.pin)) {
      showErrorToast('Error', 'PIN must contain only digits');
      return;
    }

    if (pinData.pin !== pinData.confirmPin) {
      showErrorToast('Error', 'PINs do not match');
      return;
    }

    setPinLoading(true);

    try {
      const response = await fetch(`/api/users/${pinTargetUser.id}/set-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pin: pinData.pin,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showErrorToast('Error', data.error || 'Failed to set PIN');
        return;
      }

      showSuccessToast('Success', 'PIN set successfully!');
      setPinDialogOpen(false);
      setPinData({ pin: '', confirmPin: '' });
      await fetchUsers(); // Refresh list
    } catch (error) {
      console.error('PIN change error:', error);
      showErrorToast('Error', t('msg.connection.error'));
    } finally {
      setPinLoading(false);
    }
  };

  const openPinDialog = (user: User) => {
    // PIN can be set for CASHIER and BRANCH_MANAGER roles
    if (user.role === 'ADMIN') {
      showErrorToast('Error', 'PIN is only available for Cashiers and Branch Managers');
      return;
    }

    // Branch Manager can set PIN for themselves or their cashiers
    // Admin can set PIN for anyone except themselves (they use password)
    if (currentUser?.role === 'BRANCH_MANAGER') {
      if (user.branchId !== currentUser.branchId) {
        showErrorToast('Error', 'You can only set PIN for users in your branch');
        return;
      }
    }

    setPinTargetUser(user);
    setPinData({ pin: '', confirmPin: '' });
    setPinDialogOpen(true);
  };

  const generateRandomPin = () => {
    // Generate a random 4-digit PIN
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    setPinData({ ...pinData, pin, confirmPin: pin });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate branch manager can only create cashiers for their branch
    if (currentUser?.role === 'BRANCH_MANAGER') {
      if (formData.role !== 'CASHIER') {
        showErrorToast('Error', 'Branch Managers can only create Cashier accounts');
        return;
      }
      if (formData.branchId !== currentUser.branchId) {
        showErrorToast('Error', 'Branch Managers can only create users for their assigned branch');
        return;
      }
    }

    // Validate password for new users
    if (!editingUser && !formData.password) {
      showErrorToast('Error', 'Password is required for new users');
      return;
    }

    if (!editingUser && formData.password) {
      if (formData.password.length < 8) {
        showErrorToast('Error', 'Password must be at least 8 characters');
        return;
      }
      if (!/[A-Z]/.test(formData.password)) {
        showErrorToast('Error', 'Password must contain at least one uppercase letter');
        return;
      }
      if (!/[a-z0-9]/.test(formData.password)) {
        showErrorToast('Error', 'Password must contain at least one lowercase letter or number');
        return;
      }
    }

    setLoading(true);

    try {
      // Prepare data for submission
      const submissionData: any = {
        username: formData.username,
        email: formData.email,
        name: formData.name,
        role: formData.role,
        createdBy: currentUser?.id,
        // For ADMIN role, don't send branchId (backend will set it to null)
        branchId: formData.role === 'ADMIN' ? undefined : formData.branchId,
      };

      if (editingUser) {
        // Update user - only send userCode if it's not empty or explicitly changed
        if (formData.userCode && formData.userCode.trim()) {
          submissionData.userCode = formData.userCode;
        }

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

        await fetchUsers(); // Refresh list from database
        showSuccessToast('Success', 'User updated successfully!');
      } else {
        // Create new user - include password for new users
        submissionData.password = formData.password;

        // Only admins can set custom userCode
        if (currentUser?.role === 'ADMIN' && formData.userCode && formData.userCode.trim()) {
          submissionData.userCode = formData.userCode;
        }

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

        // Store generated user code for display
        if (data.userCode) {
          setGeneratedUserCode(data.userCode);
        }

        await fetchUsers(); // Refresh list from database
        showSuccessToast('Success', 'User created successfully!');
      }

      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save user:', error);
      showErrorToast('Error', 'Failed to save user');
    } finally {
      setLoading(false);
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
      userCode: user.userCode || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (userId: string, user: User) => {
    if (!canDeleteUser(user)) {
      showErrorToast('Error', 'You do not have permission to delete this user');
      return;
    }

    const confirmMessage = user.isActive
      ? 'Are you sure you want to delete this user?'
      : 'Are you sure you want to permanently delete this deactivated user?';

    if (!confirm(confirmMessage)) return;

    try {
      const response = await fetch(`/api/users/${userId}?requesterId=${currentUser?.id}&requesterRole=${currentUser?.role}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showErrorToast('Error', data.error || 'Failed to delete user');
        return;
      }

      await fetchUsers(); // Refresh list from database
      showSuccessToast('Success', data.message || 'User deleted successfully!');
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

      await fetchUsers(); // Refresh list
      showSuccessToast('Success', `User ${action}d successfully!`);
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
      userCode: '',
    });
    setEditingUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#0F3A2E] to-[#0B2B22] text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <Users className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Users</h1>
            <p className="text-emerald-100 text-sm">
              {currentUser?.role === 'BRANCH_MANAGER' ? 'Manage your staff' : 'Manage all users'}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-emerald-100 text-xs">Total</p>
              <p className="text-lg font-bold">{users.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-emerald-100 text-xs">Active</p>
              <p className="text-lg font-bold text-green-300">{users.filter(u => u.isActive).length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-emerald-100 text-xs">Inactive</p>
              <p className="text-lg font-bold text-amber-300">{users.filter(u => !u.isActive).length}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Show generated user code after creating a user */}
        {generatedUserCode && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-blue-800">User Created Successfully!</p>
                <p className="text-sm text-blue-700 mt-1">
                  User Code: <strong className="text-lg font-mono bg-blue-100 px-3 py-1 rounded">{generatedUserCode}</strong>
                </p>
                <p className="text-xs text-blue-600 mt-2">
                  Share this code with the user for quick login. Make sure to set a PIN for quick access.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGeneratedUserCode(null)}
                  className="mt-2"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filter */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-12 bg-white"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Role Filter Buttons */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button
              variant={roleFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoleFilter('all')}
              className={`flex-shrink-0 h-10 ${roleFilter === 'all' ? 'bg-[#0F3A2E]' : ''}`}
            >
              All Roles ({users.length})
            </Button>
            <Button
              variant={roleFilter === 'ADMIN' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoleFilter('ADMIN')}
              className={`flex-shrink-0 h-10 ${roleFilter === 'ADMIN' ? 'bg-emerald-600' : ''}`}
            >
              Admins ({users.filter(u => u.role === 'ADMIN').length})
            </Button>
            <Button
              variant={roleFilter === 'BRANCH_MANAGER' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoleFilter('BRANCH_MANAGER')}
              className={`flex-shrink-0 h-10 ${roleFilter === 'BRANCH_MANAGER' ? 'bg-blue-600' : ''}`}
            >
              Managers ({users.filter(u => u.role === 'BRANCH_MANAGER').length})
            </Button>
            <Button
              variant={roleFilter === 'CASHIER' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoleFilter('CASHIER')}
              className={`flex-shrink-0 h-10 ${roleFilter === 'CASHIER' ? 'bg-slate-600' : ''}`}
            >
              Cashiers ({users.filter(u => u.role === 'CASHIER').length})
            </Button>
          </div>
        </div>

        {/* Add Button */}
        {canCreateUser() && (
          <Button
            onClick={() => { resetForm(); setDialogOpen(true); }}
            className="w-full h-14 text-lg bg-gradient-to-r from-[#C7A35A] to-[#b88e3b] hover:from-[#b88e3b] hover:to-[#C7A35A]"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add User
          </Button>
        )}

        {/* Users List */}
        <ScrollArea className="h-[calc(100vh-400px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <div className="animate-spin h-10 w-10 border-4 border-[#C7A35A] border-t-transparent rounded-full mb-3" />
              <p>Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Users className="w-16 h-16 mb-4 text-slate-300" />
              <p className="font-medium">No users found</p>
              <p className="text-sm">
                {searchTerm ? 'Try adjusting your search' : 'Add your first user to get started'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {filteredUsers.map((user) => (
                <Card
                  key={user.id}
                  className={!user.isActive ? 'opacity-60 border-slate-300' : ''}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <UserCircle className="w-6 h-6 text-slate-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 text-base line-clamp-1">
                              {user.name || user.username}
                            </h3>
                            <p className="text-sm text-slate-600 line-clamp-1">@{user.username}</p>
                          </div>
                          {getStatusBadge(user.isActive)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {getRoleBadge(user.role)}
                          {user.userCode && (
                            <Badge variant="outline" className="font-mono text-xs">
                              {user.userCode}
                            </Badge>
                          )}
                          {user.role !== 'ADMIN' && (
                            <Badge variant="outline" className={user.hasPin ? 'border-green-300 text-green-700' : 'border-amber-300 text-amber-700'}>
                              <Lock className="h-3 w-3 mr-1" />
                              {user.hasPin ? 'PIN Set' : 'No PIN'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* User Details Grid */}
                    <div className="grid grid-cols-1 gap-2 mb-3 bg-slate-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span className="text-slate-600 truncate">{user.email}</span>
                      </div>
                      {user.branchName && (
                        <div className="flex items-center gap-2 text-sm">
                          <Store className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="text-slate-600">{user.branchName}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>Created: {new Date(user.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 flex-wrap">
                      {user.role !== 'ADMIN' && canEditUser(user) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPinDialog(user)}
                          className="flex-1 min-w-[100px] h-10 text-blue-700 border-blue-300 hover:bg-blue-50"
                        >
                          <Lock className="w-4 h-4 mr-1" />
                          {user.hasPin ? 'PIN' : 'Set PIN'}
                        </Button>
                      )}
                      {canChangePassword(user) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPasswordDialog(user)}
                          className="flex-1 min-w-[100px] h-10"
                        >
                          <Key className="w-4 h-4 mr-1" />
                          Password
                        </Button>
                      )}
                      {canEditUser(user) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(user)}
                          className="flex-1 min-w-[100px] h-10"
                        >
                          <Pencil className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      )}
                      {canChangeStatus(user) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleStatus(user)}
                          className={`flex-1 min-w-[100px] h-10 ${
                            user.isActive
                              ? 'text-orange-700 border-orange-300 hover:bg-orange-50'
                              : 'text-green-700 border-green-300 hover:bg-green-50'
                          }`}
                        >
                          {user.isActive ? <PowerOff className="w-4 h-4 mr-1" /> : <Power className="w-4 h-4 mr-1" />}
                          {user.isActive ? 'Disable' : 'Enable'}
                        </Button>
                      )}
                      {canDeleteUser(user) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(user.id, user)}
                          className="h-10 text-red-600 border-red-300 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Add/Edit User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Update user details' : 'Create a new user account'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Enter username"
                  required
                  disabled={!!editingUser}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@example.com"
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Doe"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="userCode">User Code {editingUser && '(Optional)'}</Label>
                <Input
                  id="userCode"
                  value={formData.userCode}
                  onChange={(e) => setFormData({ ...formData, userCode: e.target.value.toUpperCase() })}
                  placeholder="ABC123"
                  maxLength={10}
                  disabled={!editingUser && currentUser?.role !== 'ADMIN'}
                  className="h-11"
                />
                <p className="text-xs text-slate-500">
                  {editingUser
                    ? 'Leave empty to keep current code. Only admins can change user codes.'
                    : 'Auto-generated if empty. Only admins can set custom user codes.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: any) => setFormData({ ...formData, role: value })}
                  disabled={currentUser?.role === 'BRANCH_MANAGER'}
                >
                  <SelectTrigger id="role" className="h-11">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div>
                          <div className="font-medium">{role.label}</div>
                          <div className="text-xs text-slate-500">{role.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Branch *</Label>
                {formData.role === 'ADMIN' ? (
                  <div className="px-3 py-2 h-11 bg-slate-50 border border-slate-200 rounded-md text-slate-500 flex items-center">
                    None (HQ Admin - No branch assigned)
                  </div>
                ) : (
                  <Select
                    value={formData.branchId}
                    onValueChange={(value: any) => setFormData({ ...formData, branchId: value })}
                    disabled={formData.role === 'ADMIN'}
                  >
                    <SelectTrigger id="branch" className="h-11">
                      <SelectValue placeholder="Select Branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {currentUser?.role === 'BRANCH_MANAGER' && (
                  <p className="text-xs text-slate-500 mt-1">Creating user for your branch</p>
                )}
              </div>
              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className="h-11"
                  />
                  <p className="text-xs text-slate-500">
                    Minimum 8 characters, must include uppercase and lowercase/number
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="w-full sm:w-auto h-11"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto h-11 bg-gradient-to-r from-[#C7A35A] to-[#b88e3b] hover:from-[#b88e3b] hover:to-[#C7A35A]"
              >
                {loading ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-[#C7A35A]" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              Change password for: <strong>{passwordTargetUser?.username}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                placeholder="Enter new password"
                minLength={8}
                disabled={passwordLoading}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                placeholder="Confirm new password"
                minLength={8}
                disabled={passwordLoading}
                className="h-11"
              />
            </div>
            <p className="text-xs text-slate-500">
              Minimum 8 characters, must include uppercase and lowercase/number
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPasswordDialogOpen(false);
                setPasswordData({ newPassword: '', confirmPassword: '' });
              }}
              disabled={passwordLoading}
              className="w-full sm:w-auto h-11"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePasswordChange}
              disabled={passwordLoading}
              className="w-full sm:w-auto h-11 bg-gradient-to-r from-[#C7A35A] to-[#b88e3b] hover:from-[#b88e3b] hover:to-[#C7A35A]"
            >
              {passwordLoading ? 'Processing...' : 'Change Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set PIN Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#C7A35A]" />
              {pinTargetUser?.hasPin ? 'Change PIN' : 'Set PIN'}
            </DialogTitle>
            <DialogDescription>
              {pinTargetUser?.hasPin ? 'Change PIN for: ' : 'Set PIN for: '} <strong>{pinTargetUser?.username}</strong>
              {pinTargetUser?.userCode && (
                <>
                  {' '}(<span className="font-mono">{pinTargetUser.userCode}</span>)
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pin">PIN (4-6 digits)</Label>
              <Input
                id="pin"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pinData.pin}
                onChange={(e) => setPinData({ ...pinData, pin: e.target.value.replace(/\D/g, '') })}
                placeholder="••••"
                disabled={pinLoading}
                className="h-11 text-center text-2xl tracking-widest"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPin">Confirm PIN</Label>
              <Input
                id="confirmPin"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pinData.confirmPin}
                onChange={(e) => setPinData({ ...pinData, confirmPin: e.target.value.replace(/\D/g, '') })}
                placeholder="••••"
                disabled={pinLoading}
                className="h-11 text-center text-2xl tracking-widest"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={generateRandomPin}
              className="w-full h-11"
              disabled={pinLoading}
            >
              <Lock className="w-4 h-4 mr-2" />
              Generate Random PIN
            </Button>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPinDialogOpen(false);
                setPinData({ pin: '', confirmPin: '' });
              }}
              disabled={pinLoading}
              className="w-full sm:w-auto h-11"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePinChange}
              disabled={pinLoading}
              className="w-full sm:w-auto h-11 bg-gradient-to-r from-[#C7A35A] to-[#b88e3b] hover:from-[#b88e3b] hover:to-[#C7A35A]"
            >
              {pinLoading ? 'Processing...' : pinTargetUser?.hasPin ? 'Update PIN' : 'Set PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
