'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/hooks/use-toast';
import {
  Calendar,
  Clock,
  User,
  DollarSign,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  Filter,
  RefreshCw,
  FileText,
  TrendingUp,
  Wallet,
  Users,
  MapPin,
  Building,
} from 'lucide-react';

interface AttendanceRecord {
  id: string;
  userId: string;
  branchId: string;
  clockIn: string;
  clockOut: string | null;
  status: string;
  notes: string | null;
  isPaid: boolean;
  paidAt: string | null;
  paidBy: string | null;
  dailyRate: number | null;
  user: {
    id: string;
    name: string | null;
    username: string;
    role: string;
    dailyRate: number | null;
  };
  branch: {
    id: string;
    branchName: string;
  };
  payer?: {
    id: string;
    name: string | null;
  };
}

interface SalarySummary {
  userId: string;
  userName: string;
  totalDays: number;
  paidDays: number;
  unpaidDays: number;
  totalOwed: number;
  totalPaid: number;
}

export default function AttendanceManagement() {
  const { user } = useAuth();
  const { currency, t } = useI18n();

  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [salarySummaries, setSalarySummaries] = useState<SalarySummary[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterStaff, setFilterStaff] = useState<string>('all');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Dialog states
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState<string[]>([]);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceNotes, setAttendanceNotes] = useState('');

  // Staff list for filter
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; username: string }>>([]);

  // Fetch attendance records
  const fetchAttendances = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams({
        currentUserId: user.id,
      });

      if (filterStaff !== 'all') {
        params.append('userId', filterStaff);
      }
      if (filterPayment !== 'all') {
        params.append('isPaid', filterPayment);
      }
      if (filterStatus !== 'all') {
        params.append('status', filterStatus);
      }
      if (dateFrom) {
        params.append('startDate', dateFrom);
      }
      if (dateTo) {
        params.append('endDate', dateTo);
      }

      const response = await fetch(`/api/attendance?${params.toString()}`);

      if (response.ok) {
        const data = await response.json();
        setAttendances(data.attendances || []);

        // Build staff list from attendances
        const uniqueStaff = Array.from(
          new Map(data.attendances.map((a: AttendanceRecord) => [a.userId, a.user])).values()
        );
        setStaffList(uniqueStaff);

        // Fetch salary summary
        await fetchSalarySummary();
      } else {
        const error = await response.json();
        showErrorToast('Failed to load attendance', error.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error fetching attendances:', error);
      showErrorToast('Error', 'Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch salary summary
  const fetchSalarySummary = async () => {
    try {
      const params = new URLSearchParams({
        currentUserId: user.id,
      });

      if (filterStaff !== 'all') {
        params.append('userId', filterStaff);
      }
      if (dateFrom) {
        params.append('startDate', dateFrom);
      }
      if (dateTo) {
        params.append('endDate', dateTo);
      }

      const response = await fetch(`/api/attendance/salary-summary?${params.toString()}`);

      if (response.ok) {
        const data = await response.json();
        setSalarySummaries(data.summaries || []);
        setTotals(data.totals || {});
      }
    } catch (error) {
      console.error('Error fetching salary summary:', error);
    }
  };

  // Mark attendance as paid
  const handleMarkAsPaid = async () => {
    try {
      const response = await fetch('/api/attendance/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceIds: selectedAttendanceIds,
          paidBy: user.id,
          markAsPaid: true,
        }),
      });

      if (response.ok) {
        showSuccessToast('Success', `${selectedAttendanceIds.length} attendance record(s) marked as paid`);
        setShowMarkPaidDialog(false);
        setSelectedAttendanceIds([]);
        await fetchAttendances();
      } else {
        const error = await response.json();
        showErrorToast('Failed', error.error || 'Failed to mark as paid');
      }
    } catch (error) {
      console.error('Error marking as paid:', error);
      showErrorToast('Error', 'Failed to mark as paid');
    }
  };

  // Mark attendance as unpaid
  const handleMarkAsUnpaid = async (attendanceIds: string[]) => {
    try {
      const response = await fetch('/api/attendance/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceIds,
          paidBy: user.id,
          markAsPaid: false,
        }),
      });

      if (response.ok) {
        showSuccessToast('Success', `${attendanceIds.length} attendance record(s) marked as unpaid`);
        await fetchAttendances();
      } else {
        const error = await response.json();
        showErrorToast('Failed', error.error || 'Failed to mark as unpaid');
      }
    } catch (error) {
      console.error('Error marking as unpaid:', error);
      showErrorToast('Error', 'Failed to mark as unpaid');
    }
  };

  // Save notes
  const handleSaveNotes = async () => {
    if (!selectedAttendance) return;

    try {
      // Clock out if not already clocked out (using notes as clock out trigger)
      if (!selectedAttendance.clockOut) {
        const response = await fetch('/api/attendance/clock-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attendanceId: selectedAttendance.id,
            notes: attendanceNotes,
          }),
        });

        if (response.ok) {
          showSuccessToast('Success', 'Clock out recorded with notes');
        } else {
          const error = await response.json();
          showErrorToast('Failed', error.error || 'Failed to clock out');
          return;
        }
      }

      setShowNotesDialog(false);
      setAttendanceNotes('');
      setSelectedAttendance(null);
      await fetchAttendances();
    } catch (error) {
      console.error('Error saving notes:', error);
      showErrorToast('Error', 'Failed to save notes');
    }
  };

  // Export to CSV
  const handleExport = () => {
    const headers = ['Date', 'Staff Name', 'Username', 'Branch', 'Clock In', 'Clock Out', 'Status', 'Daily Rate', 'Payment Status', 'Paid At', 'Paid By', 'Notes'];
    const rows = attendances.map(a => [
      new Date(a.clockIn).toLocaleDateString(),
      a.user.name || a.user.username,
      a.user.username,
      a.branch.branchName,
      new Date(a.clockIn).toLocaleTimeString(),
      a.clockOut ? new Date(a.clockOut).toLocaleTimeString() : 'Active',
      a.status,
      a.dailyRate || a.user.dailyRate || 0,
      a.isPaid ? 'Paid' : 'Unpaid',
      a.paidAt ? new Date(a.paidAt).toLocaleString() : 'N/A',
      a.payer?.name || 'N/A',
      a.notes || '',
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Calculate work duration
  const calculateDuration = (clockIn: string, clockOut: string | null) => {
    if (!clockOut) return 'Active';
    const start = new Date(clockIn);
    const end = new Date(clockOut);
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      PRESENT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
      LATE: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      EARLY_LEAVE: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      ABSENT: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      ON_LEAVE: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
      SICK: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      OVERTIME: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    };

    return (
      <Badge className={statusColors[status] || 'bg-slate-100 text-slate-800'}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  // Filter attendances
  const filteredAttendances = attendances.filter(a => {
    if (filterStaff !== 'all' && a.userId !== filterStaff) return false;
    if (filterPayment !== 'all') {
      if (filterPayment === 'paid' && !a.isPaid) return false;
      if (filterPayment === 'unpaid' && a.isPaid) return false;
    }
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return true;
  });

  // Load attendances on mount
  useEffect(() => {
    fetchAttendances();
  }, [filterStaff, filterPayment, filterStatus, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Staff Attendance</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Track staff attendance and manage daily salary payments
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRefreshing(true);
              fetchAttendances().finally(() => setRefreshing(false));
            }}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Staff
            </CardDescription>
            <CardTitle className="text-2xl">{totals.totalStaff || 0}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Total Days
            </CardDescription>
            <CardTitle className="text-2xl">{totals.totalDays || 0}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Paid Days
            </CardDescription>
            <CardTitle className="text-2xl text-emerald-600">{totals.totalPaidDays || 0}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-4 w-4" />
              Unpaid Days
            </CardDescription>
            <CardTitle className="text-2xl text-amber-600">{totals.totalUnpaidDays || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Salary Summary */}
      {salarySummaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Salary Summary
            </CardTitle>
            <CardDescription>Daily wage tracking by staff member</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 px-4 font-semibold text-sm text-slate-700 dark:text-slate-300">
                      Staff Member
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-sm text-slate-700 dark:text-slate-300">
                      Total Days
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-sm text-emerald-600">
                      Paid Days
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-sm text-amber-600">
                      Unpaid Days
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-sm text-emerald-600">
                      Total Paid
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-sm text-amber-600">
                      Total Owed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {salarySummaries.map((summary) => (
                    <tr
                      key={summary.userId}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-sm font-semibold">
                            {summary.userName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">{summary.userName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-medium">{summary.totalDays}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                          {summary.paidDays}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          {summary.unpaidDays}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-emerald-600">
                        {formatCurrency(summary.totalPaid, currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-amber-600">
                        {formatCurrency(summary.totalOwed, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Staff Member</Label>
              <Select value={filterStaff} onValueChange={setFilterStaff}>
                <SelectTrigger>
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {staffList.map(staff => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.name || staff.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Payment Status</Label>
              <Select value={filterPayment} onValueChange={setFilterPayment}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Attendance Records</CardTitle>
            <CardDescription>
              {filteredAttendances.length} record{filteredAttendances.length !== 1 ? 's' : ''} found
            </CardDescription>
          </div>
          {filterPayment === 'unpaid' && filteredAttendances.some(a => !a.isPaid) && (
            <Button
              onClick={() => {
                setSelectedAttendanceIds(filteredAttendances.filter(a => !a.isPaid).map(a => a.id));
                setShowMarkPaidDialog(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark All as Paid
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : filteredAttendances.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">No attendance records found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAttendances.map((attendance) => (
                <div
                  key={attendance.id}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-semibold">
                      {(attendance.user.name || attendance.user.username).charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {attendance.user.name || attendance.user.username}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {attendance.user.role}
                        </Badge>
                        {getStatusBadge(attendance.status)}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(attendance.clockIn).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(attendance.clockIn).toLocaleTimeString()} - {attendance.clockOut ? new Date(attendance.clockOut).toLocaleTimeString() : 'Active'}
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {calculateDuration(attendance.clockIn, attendance.clockOut)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(attendance.dailyRate || attendance.user.dailyRate || 0, currency)}
                      </div>
                      <div className={`text-xs ${attendance.isPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {attendance.isPaid ? `Paid on ${new Date(attendance.paidAt!).toLocaleDateString()}` : 'Unpaid'}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {attendance.isPaid ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkAsUnpaid([attendance.id])}
                          className="text-amber-600 border-amber-600 hover:bg-amber-50 hover:text-amber-700"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Unmark
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAttendanceIds([attendance.id]);
                            setShowMarkPaidDialog(true);
                          }}
                          className="text-emerald-600 border-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Mark Paid
                        </Button>
                      )}
                      {!attendance.clockOut && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedAttendance(attendance);
                            setAttendanceNotes(attendance.notes || '');
                            setShowNotesDialog(true);
                          }}
                        >
                          Clock Out
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mark as Paid Dialog */}
      <Dialog open={showMarkPaidDialog} onOpenChange={setShowMarkPaidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Attendance as Paid</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark {selectedAttendanceIds.length} attendance record(s) as paid?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkPaidDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkAsPaid} className="bg-emerald-600 hover:bg-emerald-700">
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes / Clock Out Dialog */}
      <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clock Out & Add Notes</DialogTitle>
            <DialogDescription>
              Clock out for {selectedAttendance?.user.name || selectedAttendance?.user.username} and add optional notes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any notes about today's work..."
                value={attendanceNotes}
                onChange={(e) => setAttendanceNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotesDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNotes} className="bg-emerald-600 hover:bg-emerald-700">
              Clock Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
