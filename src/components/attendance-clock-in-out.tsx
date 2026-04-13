'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth-context';
import { offlineManager } from '@/lib/offline/offline-manager';
import { getIndexedDBStorage, OperationType } from '@/lib/storage/indexeddb-storage';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/hooks/use-toast';
import { Clock, UserCheck, UserX } from 'lucide-react';
import StaffAttendanceDialog from './staff-attendance-dialog';

interface TodayAttendance {
  id: string;
  clockIn: string;
  clockOut: string | null;
  status: string;
}

export default function AttendanceClockInOut({ branchId }: { branchId: string }) {
  const { user } = useAuth();
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClockInDialog, setShowClockInDialog] = useState(false);
  const [showClockOutDialog, setShowClockOutDialog] = useState(false);
  const [showStaffAttendanceDialog, setShowStaffAttendanceDialog] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; username: string }>>([]);

  const storage = getIndexedDBStorage();

  // Fetch today's attendance for current user
  useEffect(() => {
    if (!user?.id || !branchId) return;

    const fetchTodayAttendance = async () => {
      try {
        setLoading(true);
        
        // Try to get from IndexedDB first (offline)
        const offlineAttendance = await storage.getTodayAttendance(user.id, branchId);
        if (offlineAttendance) {
          setTodayAttendance(offlineAttendance);
        }

        // If online, fetch from API
        if (offlineManager.isCurrentlyOnline()) {
          const response = await fetch(`/api/attendance?userId=${user.id}&branchId=${branchId}&currentUserId=${user.id}`);
          if (response.ok) {
            const data = await response.json();
            const attendances = data.attendances || [];
            if (attendances.length > 0) {
              setTodayAttendance(attendances[0]);
            } else {
              setTodayAttendance(null);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching today attendance:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTodayAttendance();
  }, [user?.id, branchId]);

  // Handle clock in
  const handleClockIn = async () => {
    if (!selectedStaffId) {
      showErrorToast('Error', 'Please select a staff member');
      return;
    }

    try {
      const attendanceData = {
        userId: selectedStaffId,
        branchId,
        clockIn: new Date().toISOString(),
        status: 'PRESENT',
      };

      // Queue for offline sync
      await storage.addOperation({
        type: OperationType.CLOCK_IN,
        data: attendanceData,
        branchId,
      });

      // Save to IndexedDB immediately
      const tempId = `temp-attendance-${Date.now()}`;
      const localAttendance = {
        ...attendanceData,
        id: tempId,
        clockOut: null,
        isPaid: false,
        paidAt: null,
        paidBy: null,
        dailyRate: null,
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await storage.saveAttendance(localAttendance);
      setTodayAttendance(localAttendance);

      // Sync if online
      if (offlineManager.isCurrentlyOnline()) {
        await offlineManager.forceSync();
      }

      showSuccessToast('Success', 'Clocked in successfully!');
      setShowClockInDialog(false);
      setSelectedStaffId('');
    } catch (error) {
      console.error('Error clocking in:', error);
      showErrorToast('Error', 'Failed to clock in');
    }
  };

  // Handle clock out
  const handleClockOut = async () => {
    if (!todayAttendance) return;

    try {
      const clockOutData = {
        attendanceId: todayAttendance.id,
        userId: todayAttendance.userId,
        clockIn: todayAttendance.clockIn,
        clockOut: new Date().toISOString(),
        notes: clockOutNotes || null,
      };

      // Queue for offline sync
      await storage.addOperation({
        type: OperationType.CLOCK_OUT,
        data: clockOutData,
        branchId,
      });

      // Update local attendance
      const updatedAttendance = {
        ...todayAttendance,
        clockOut: new Date().toISOString(),
        notes: clockOutNotes || todayAttendance.notes,
      };
      await storage.saveAttendance(updatedAttendance);
      setTodayAttendance(updatedAttendance);

      // Sync if online
      if (offlineManager.isCurrentlyOnline()) {
        await offlineManager.forceSync();
      }

      showSuccessToast('Success', 'Clocked out successfully!');
      setShowClockOutDialog(false);
      setClockOutNotes('');
    } catch (error) {
      console.error('Error clocking out:', error);
      showErrorToast('Error', 'Failed to clock out');
    }
  };

  // Fetch staff list for clock in dialog
  useEffect(() => {
    const fetchStaffList = async () => {
      try {
        // Try to get from IndexedDB first
        const offlineUsers = await storage.getAllUsers();
        if (offlineUsers && offlineUsers.length > 0) {
          setStaffList(offlineUsers.map((u: any) => ({
            id: u.id,
            name: u.name || u.username,
            username: u.username,
          })));
        }

        // If online, fetch from API
        if (offlineManager.isCurrentlyOnline()) {
          const response = await fetch(`/api/users?currentUserRole=${user.role}&currentUserBranchId=${user.branchId || ''}`);
          if (response.ok) {
            const data = await response.json();
            if (data.users && Array.isArray(data.users)) {
              setStaffList(data.users.map((u: any) => ({
                id: u.id,
                name: u.name || u.username,
                username: u.username,
              })));
            }
          }
        }
      } catch (error) {
        console.error('Error fetching staff list:', error);
      }
    };

    fetchStaffList();
  }, [user?.role, user?.branchId]);

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Clock className="h-4 w-4 mr-2" />
        Loading...
      </Button>
    );
  }

  const isClockedIn = todayAttendance && !todayAttendance.clockOut;

  return (
    <>
      {isClockedIn ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // For cashiers, open the staff attendance dialog (clock-out mode)
            // For admins/managers, open the simple clock-out dialog
            if (user.role === 'CASHIER') {
              setShowStaffAttendanceDialog(true);
            } else {
              setShowClockOutDialog(true);
            }
          }}
          className="text-emerald-600 border-emerald-600 hover:bg-emerald-50"
        >
          <UserCheck className="h-4 w-4 mr-2" />
          Clocked In
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // For cashiers, open the staff attendance dialog
            // For admins/managers, open the single staff selection dialog
            if (user.role === 'CASHIER') {
              setShowStaffAttendanceDialog(true);
            } else {
              setShowClockInDialog(true);
            }
          }}
          className="text-amber-600 border-amber-600 hover:bg-amber-50"
        >
          <UserX className="h-4 w-4 mr-2" />
          {todayAttendance ? 'Clocked Out' : 'Clock In'}
        </Button>
      )}

      {/* Staff Attendance Dialog (for cashiers - mark multiple staff as present) */}
      <StaffAttendanceDialog
        open={showStaffAttendanceDialog}
        onOpenChange={setShowStaffAttendanceDialog}
        branchId={branchId}
        onSuccess={() => {
          // Refresh current user's attendance after marking staff
          const fetchTodayAttendance = async () => {
            try {
              const offlineAttendance = await storage.getTodayAttendance(user.id, branchId);
              if (offlineAttendance) {
                setTodayAttendance(offlineAttendance);
              }

              if (offlineManager.isCurrentlyOnline()) {
                const response = await fetch(`/api/attendance?userId=${user.id}&branchId=${branchId}&currentUserId=${user.id}`);
                if (response.ok) {
                  const data = await response.json();
                  const attendances = data.attendances || [];
                  if (attendances.length > 0) {
                    setTodayAttendance(attendances[0]);
                  } else {
                    setTodayAttendance(null);
                  }
                }
              }
            } catch (error) {
              console.error('Error refreshing attendance:', error);
            }
          };
          fetchTodayAttendance();
        }}
      />

      {/* Clock In Dialog (for managers/admins) */}
      <Dialog open={showClockInDialog} onOpenChange={setShowClockInDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clock In Staff</DialogTitle>
            <DialogDescription>
              Select a staff member to clock in for today.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="staffSelect">Staff Member *</Label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger id="staffSelect">
                  <SelectValue placeholder="Select staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map(staff => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.name} ({staff.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClockInDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleClockIn} disabled={!selectedStaffId}>
              Clock In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clock Out Dialog */}
      <Dialog open={showClockOutDialog} onOpenChange={setShowClockOutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clock Out</DialogTitle>
            <DialogDescription>
              Clock out for {user?.name || user?.username} and add optional notes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="clockOutNotes">Notes (Optional)</Label>
              <textarea
                id="clockOutNotes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Add any notes about today's work..."
                value={clockOutNotes}
                onChange={(e) => setClockOutNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClockOutDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleClockOut}>
              Clock Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
