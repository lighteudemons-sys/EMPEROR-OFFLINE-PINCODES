'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileText,
  Search,
  RefreshCw,
  Clock,
  User,
  Download,
  Filter,
  Calendar,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
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

export function MobileAuditLogs() {
  const { user: currentUser } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filter state
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [offset, setOffset] = useState(0);
  const limit = 20;

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

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [selectedUser, selectedAction, startDate, endDate, offset]);

  const fetchUsers = async () => {
    try {
      const params = new URLSearchParams();

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

      if (currentUser?.role === 'BRANCH_MANAGER' && currentUser.branchId) {
        params.append('branchId', currentUser.branchId);
      }

      if (selectedUser !== 'all') params.append('userId', selectedUser);
      if (selectedAction !== 'all') params.append('actionType', selectedAction);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/audit-logs?${params.toString()}`);
      const data = await response.json();

      if (response.ok && data.logs) {
        setLogs(data.logs);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      showErrorToast('Error', 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

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

  const getActionBadge = (actionType: string) => {
    const colorMap: { [key: string]: string } = {
      login: 'bg-green-100 text-green-800',
      logout: 'bg-gray-100 text-gray-800',
      order_created: 'bg-blue-100 text-blue-800',
      order_refunded: 'bg-red-100 text-red-800',
      item_voided: 'bg-orange-100 text-orange-800',
      shift_opened: 'bg-emerald-100 text-emerald-800',
      shift_closed: 'bg-orange-100 text-orange-800',
      day_opened: 'bg-teal-100 text-teal-800',
      day_closed: 'bg-amber-100 text-amber-800',
      inventory_adjusted: 'bg-purple-100 text-purple-800',
      menu_updated: 'bg-indigo-100 text-indigo-800',
      user_created: 'bg-cyan-100 text-cyan-800',
      user_updated: 'bg-sky-100 text-sky-800',
      user_deleted: 'bg-rose-100 text-rose-800',
      branch_created: 'bg-lime-100 text-lime-800',
      branch_updated: 'bg-fuchsia-100 text-fuchsia-800',
      customer_created: 'bg-pink-100 text-pink-800',
      customer_updated: 'bg-violet-100 text-violet-800',
      promo_code_applied: 'bg-yellow-100 text-yellow-800',
      waste_logged: 'bg-stone-100 text-stone-800',
    };

    return colorMap[actionType] || 'bg-slate-100 text-slate-800';
  };

  const formatActionType = (actionType: string) => {
    return actionType
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

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
    showSuccessToast('Success', 'Audit logs exported successfully');
  };

  const resetFilters = () => {
    setSelectedUser('all');
    setSelectedAction('all');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setOffset(0);
  };

  if (selectedLog) {
    return (
      <div className="h-full flex flex-col bg-slate-50">
        {/* Header */}
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 text-white px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setSelectedLog(null)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold truncate">Log Details</h1>
            <p className="text-purple-100 text-sm">Audit Log Entry</p>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {/* Action */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Badge className={getActionBadge(selectedLog.actionType)}>
                    {formatActionType(selectedLog.actionType)}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* User Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-purple-600" />
                  User
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Name</span>
                  <span className="font-medium">{selectedLog.user.name || selectedLog.user.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Username</span>
                  <span className="font-medium">{selectedLog.user.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Role</span>
                  <Badge variant="outline">{selectedLog.user.role}</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Timestamp */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-purple-600" />
                  Timestamp
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{format(new Date(selectedLog.timestamp), 'PPp')}</p>
              </CardContent>
            </Card>

            {/* Entity */}
            {selectedLog.entityType && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Entity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Type</span>
                    <span className="font-medium">{selectedLog.entityType}</span>
                  </div>
                  {selectedLog.entityId && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">ID</span>
                      <span className="font-medium text-xs">{selectedLog.entityId}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Changes */}
            {(selectedLog.oldValue || selectedLog.newValue) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Changes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedLog.oldValue && (
                    <div className="p-3 bg-red-50 rounded-lg">
                      <p className="text-xs text-red-600 mb-1 font-medium">Old Value</p>
                      <p className="text-sm text-slate-700 break-words">{selectedLog.oldValue}</p>
                    </div>
                  )}
                  {selectedLog.newValue && (
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-600 mb-1 font-medium">New Value</p>
                      <p className="text-sm text-slate-700 break-words">{selectedLog.newValue}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* IP Address */}
            {selectedLog.ipAddress && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">IP Address</span>
                    <span className="font-medium">{selectedLog.ipAddress}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-600 to-purple-700 text-white px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">Audit Logs</h1>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="icon"
              className="bg-white/20 hover:bg-white/30 text-white"
              onClick={exportToCSV}
            >
              <Download className="h-5 w-5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="bg-white/20 hover:bg-white/30 text-white"
              onClick={fetchLogs}
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white/20 border-white/30 text-white placeholder:text-white/60 h-12"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name || user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedAction} onValueChange={setSelectedAction}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {actionTypes.map((action) => (
                <SelectItem key={action} value={action}>
                  {formatActionType(action)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-11"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-11"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resetFilters}
          className="w-full h-11"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset Filters
        </Button>
      </div>

      {/* Log List */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No logs found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log) => (
              <Card
                key={log.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedLog(log)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <Badge className={getActionBadge(log.actionType)}>
                      {formatActionType(log.actionType)}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {format(new Date(log.timestamp), 'PPp')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 text-slate-400" />
                    <span className="font-medium">{log.user.name || log.user.username}</span>
                    <span className="text-xs text-slate-500">({log.user.role})</span>
                  </div>
                  {log.entityType && (
                    <p className="text-sm text-slate-600">Entity: {log.entityType}</p>
                  )}
                  {(log.oldValue || log.newValue) && (
                    <div className="mt-2 text-xs">
                      {log.oldValue && (
                        <p className="text-red-600 truncate">- {log.oldValue.slice(0, 50)}...</p>
                      )}
                      {log.newValue && (
                        <p className="text-green-600 truncate">+ {log.newValue.slice(0, 50)}...</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      {total > limit && (
        <div className="bg-white border-t p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">
              {offset + 1} - {Math.min(offset + limit, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
