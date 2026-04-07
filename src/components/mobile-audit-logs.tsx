'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileText, Search, Filter, RefreshCw, X, Clock, User,
  Download, ChevronLeft, ChevronRight, Shield, Store, UserCircle
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { format } from 'date-fns';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  actionType: string;
  entityType?: string | null;
  entityId?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  ipAddress?: string | null;
  previousHash?: string | null;
  currentHash: string;
  user: {
    id: string;
    username: string;
    name?: string | null;
    role: string;
  };
}

interface User {
  id: string;
  username: string;
  name?: string | null;
  role: string;
}

export default function MobileAuditLogs() {
  const { t, language } = useI18n();
  const { user: currentUser } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filter state
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [selectedEntity, setSelectedEntity] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Action types based on user role
  const getActionTypes = () => {
    if (currentUser?.role === 'ADMIN') {
      return [
        'login',
        'logout',
        'order_created',
        'order_refunded',
        'item_voided',
        'shift_opened',
        'shift_closed',
        'day_opened',
        'day_closed',
        'inventory_adjusted',
        'menu_updated',
        'user_created',
        'user_updated',
        'user_deleted',
        'branch_created',
        'branch_updated',
        'customer_created',
        'customer_updated',
        'promo_code_applied',
        'waste_logged',
      ];
    } else {
      // Branch Manager and Cashier - only see relevant actions
      return [
        'login',
        'logout',
        'order_created',
        'order_refunded',
        'item_voided',
        'shift_opened',
        'shift_closed',
        'day_opened',
        'day_closed',
        'inventory_adjusted',
        'customer_created',
        'customer_updated',
        'promo_code_applied',
        'waste_logged',
      ];
    }
  };

  const actionTypes = getActionTypes();

  // Entity types
  const entityTypes = [
    'Order',
    'Shift',
    'BusinessDay',
    'InventoryTransaction',
    'MenuItem',
    'User',
    'Branch',
    'Customer',
    'PromotionCode',
    'WasteLog',
  ];

  // Fetch users for filter
  useEffect(() => {
    fetchUsers();
  }, []);

  // Fetch logs when filters change
  useEffect(() => {
    fetchLogs();
  }, [selectedUser, selectedAction, selectedEntity, startDate, endDate, offset]);

  const fetchUsers = async () => {
    try {
      const params = new URLSearchParams();
      
      // For Branch Manager, only fetch users from their branch
      if (currentUser?.role === 'BRANCH_MANAGER' && currentUser.branchId) {
        params.append('branchId', currentUser.branchId);
      }
      
      const response = await fetch(`/api/users?${params.toString()}`);
      const data = await response.json();
      if (response.ok && data.users) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      // For Branch Manager, only fetch logs from their branch
      if (currentUser?.role === 'BRANCH_MANAGER' && currentUser.branchId) {
        params.append('branchId', currentUser.branchId);
      }

      if (selectedUser !== 'all') params.append('userId', selectedUser);
      if (selectedAction !== 'all') params.append('actionType', selectedAction);
      if (selectedEntity !== 'all') params.append('entityType', selectedEntity);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/audit-logs?${params.toString()}`);
      const data = await response.json();

      if (response.ok && data.logs) {
        setLogs(data.logs);
        setTotal(data.pagination.total);
      } else {
        showErrorToast('Error', data.error || 'Failed to fetch audit logs');
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      showErrorToast('Error', 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  // Filter logs by search query
  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    const searchText = `
      ${log.user.username}
      ${log.user.name || ''}
      ${log.actionType}
      ${log.entityType || ''}
      ${log.oldValue || ''}
      ${log.newValue || ''}
      ${log.ipAddress || ''}
    `.toLowerCase();

    return searchText.includes(query);
  });

  // Get action type badge color
  const getActionBadge = (actionType: string) => {
    const colorMap: { [key: string]: { bg: string; text: string; icon: any } } = {
      login: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200', icon: null },
      logout: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-300', icon: null },
      order_created: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-800 dark:text-blue-200', icon: null },
      order_refunded: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200', icon: null },
      item_voided: { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-800 dark:text-orange-200', icon: null },
      shift_opened: { bg: 'bg-emerald-100 dark:bg-emerald-900', text: 'text-emerald-800 dark:text-emerald-200', icon: null },
      shift_closed: { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-800 dark:text-orange-200', icon: null },
      day_opened: { bg: 'bg-teal-100 dark:bg-teal-900', text: 'text-teal-800 dark:text-teal-200', icon: null },
      day_closed: { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-800 dark:text-amber-200', icon: null },
      inventory_adjusted: { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-800 dark:text-purple-200', icon: null },
      menu_updated: { bg: 'bg-indigo-100 dark:bg-indigo-900', text: 'text-indigo-800 dark:text-indigo-200', icon: null },
      user_created: { bg: 'bg-cyan-100 dark:bg-cyan-900', text: 'text-cyan-800 dark:text-cyan-200', icon: UserCircle },
      user_updated: { bg: 'bg-sky-100 dark:bg-sky-900', text: 'text-sky-800 dark:text-sky-200', icon: null },
      user_deleted: { bg: 'bg-rose-100 dark:bg-rose-900', text: 'text-rose-800 dark:text-rose-200', icon: null },
      branch_created: { bg: 'bg-lime-100 dark:bg-lime-900', text: 'text-lime-800 dark:text-lime-200', icon: Store },
      branch_updated: { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900', text: 'text-fuchsia-800 dark:text-fuchsia-200', icon: null },
      customer_created: { bg: 'bg-pink-100 dark:bg-pink-900', text: 'text-pink-800 dark:text-pink-200', icon: null },
      customer_updated: { bg: 'bg-violet-100 dark:bg-violet-900', text: 'text-violet-800 dark:text-violet-200', icon: null },
      promo_code_applied: { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200', icon: null },
      waste_logged: { bg: 'bg-stone-100 dark:bg-stone-900', text: 'text-stone-800 dark:text-stone-200', icon: null },
    };

    return colorMap[actionType] || { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-800 dark:text-slate-300', icon: null };
  };

  // Get role icon
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <Shield className="h-4 w-4 text-emerald-600" />;
      case 'BRANCH_MANAGER':
        return <Store className="h-4 w-4 text-blue-600" />;
      default:
        return <UserCircle className="h-4 w-4 text-slate-600" />;
    }
  };

  // Format action type for display
  const formatActionType = (actionType: string) => {
    return actionType
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Export logs to CSV
  const exportToCSV = () => {
    const headers = ['Timestamp', 'User', 'Role', 'Action', 'Entity', 'Entity ID', 'Old Value', 'New Value', 'IP Address'];
    const rows = filteredLogs.map((log) => [
      log.timestamp,
      log.user.name || log.user.username,
      log.user.role,
      formatActionType(log.actionType),
      log.entityType || '',
      log.entityId || '',
      log.oldValue || '',
      log.newValue || '',
      log.ipAddress || '',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showSuccessToast('Success', 'Export started');
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#0F3A2E] to-[#0B2B22] text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <FileText className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">
              {language === 'ar' ? 'سجل الأنشطة' : 'Audit Logs'}
            </h1>
            <p className="text-emerald-100 text-sm">
              {language === 'ar' ? 'تتبع جميع إجراءات المستخدمين' : 'Track all user actions'}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/10 border border-white/20 rounded-lg p-3">
            <p className="text-emerald-100 text-xs mb-1">
              {language === 'ar' ? 'إجمالي السجلات' : 'Total Logs'}
            </p>
            <p className="text-lg font-bold">{total}</p>
          </div>
          <div className="bg-white/10 border border-white/20 rounded-lg p-3">
            <p className="text-emerald-100 text-xs mb-1">
              {language === 'ar' ? 'العرض الحالي' : 'Showing'}
            </p>
            <p className="text-lg font-bold">{filteredLogs.length}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder={language === 'ar' ? 'ابحث في السجلات...' : 'Search logs...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              {language === 'ar' ? 'فلاتر البحث' : 'Filters'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* User Filter */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {language === 'ar' ? 'المستخدم' : 'User'}
              </Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={language === 'ar' ? 'الكل' : 'All Users'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'الكل' : 'All Users'}</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name || user.username} ({user.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Type Filter */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {language === 'ar' ? 'نوع الإجراء' : 'Action Type'}
              </Label>
              <Select value={selectedAction} onValueChange={setSelectedAction}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={language === 'ar' ? 'الكل' : 'All Actions'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'الكل' : 'All Actions'}</SelectItem>
                  {actionTypes.map((action) => (
                    <SelectItem key={action} value={action}>
                      {formatActionType(action)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Entity Type Filter */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {language === 'ar' ? 'نوع الكيان' : 'Entity Type'}
              </Label>
              <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={language === 'ar' ? 'الكل' : 'All Entities'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'الكل' : 'All Entities'}</SelectItem>
                  {entityTypes.map((entity) => (
                    <SelectItem key={entity} value={entity}>
                      {entity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  {language === 'ar' ? 'من تاريخ' : 'From'}
                </Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  {language === 'ar' ? 'إلى تاريخ' : 'To'}
                </Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>

            {/* Reset Filters Button */}
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => {
                setSelectedUser('all');
                setSelectedAction('all');
                setSelectedEntity('all');
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
                setOffset(0);
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {language === 'ar' ? 'إعادة تعيين' : 'Reset Filters'}
            </Button>
          </CardContent>
        </Card>

        {/* Export Button */}
        <Button
          variant="outline"
          className="w-full h-14"
          onClick={exportToCSV}
        >
          <Download className="h-5 w-5 mr-2" />
          {language === 'ar' ? 'تصدير CSV' : 'Export CSV'}
        </Button>

        {/* Logs List */}
        <ScrollArea className="h-[calc(100vh-550px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <div className="animate-spin h-10 w-10 border-4 border-[#C7A35A] border-t-transparent rounded-full mb-3" />
              <p>{language === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <FileText className="w-16 h-16 mb-4 text-slate-300" />
              <p className="font-medium">
                {language === 'ar' ? 'لا توجد سجلات' : 'No logs found'}
              </p>
              <p className="text-sm">
                {language === 'ar' ? 'حاول تغيير الفلاتر' : 'Try adjusting filters'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {filteredLogs.map((log) => {
                const badgeStyle = getActionBadge(log.actionType);
                return (
                  <Card key={log.id} className="shadow-sm">
                    <CardContent className="p-4">
                      {/* Header: Timestamp and User */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-slate-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-slate-900 text-sm truncate">
                                {log.user.name || log.user.username}
                              </p>
                              {getRoleIcon(log.user.role)}
                            </div>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(new Date(log.timestamp), 'PPp')}
                            </p>
                          </div>
                        </div>
                        <Badge className={`${badgeStyle.bg} ${badgeStyle.text} flex-shrink-0 h-8 flex items-center gap-1`}>
                          {badgeStyle.icon && <badgeStyle.icon className="h-3 w-3" />}
                          {formatActionType(log.actionType)}
                        </Badge>
                      </div>

                      {/* Entity Information */}
                      {log.entityType && (
                        <div className="mb-3 p-2 bg-slate-50 rounded-lg">
                          <p className="text-xs font-medium text-slate-700 mb-1">
                            {log.entityType}
                          </p>
                          {log.entityId && (
                            <p className="text-xs text-slate-500 font-mono">
                              #{log.entityId.slice(0, 8)}...
                            </p>
                          )}
                        </div>
                      )}

                      {/* Changes (Old/New Values) */}
                      {(log.oldValue || log.newValue) && (
                        <div className="mb-3 space-y-1">
                          {log.oldValue && (
                            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                              <span className="font-medium">-</span>{' '}
                              {log.oldValue.length > 100
                                ? log.oldValue.slice(0, 100) + '...'
                                : log.oldValue}
                            </div>
                          )}
                          {log.newValue && (
                            <div className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-2 rounded">
                              <span className="font-medium">+</span>{' '}
                              {log.newValue.length > 100
                                ? log.newValue.slice(0, 100) + '...'
                                : log.newValue}
                            </div>
                          )}
                        </div>
                      )}

                      {/* IP Address */}
                      {log.ipAddress && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Shield className="w-3 h-3" />
                          IP: {log.ipAddress}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between gap-2 p-3 bg-white border border-slate-200 rounded-lg">
            <span className="text-xs text-slate-600">
              {language === 'ar' ? 'عرض' : 'Showing'} {offset + 1} - {Math.min(offset + limit, total)} {language === 'ar' ? 'من' : 'of'} {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="h-10 px-3"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="h-10 px-3"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
