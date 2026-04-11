'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth-context';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';
import { Clock, LogOut, LogIn, CheckCircle2, AlertCircle } from 'lucide-react';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';

interface ClockInOutButtonProps {
  branchId: string;
  onClockIn?: () => void;
  onClockOut?: () => void;
}

export default function ClockInOutButton({ branchId, onClockIn, onClockOut }: ClockInOutButtonProps) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showClockInDialog, setShowClockInDialog] = useState(false);
  const [showClockOutDialog, setShowClockOutDialog] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [staffList, setStaffList] = useState<any[]>([]);

  const storage = getIndexedDBStorage();

  // Check online status
  useEffect(() => {
    const checkOnline = () => {
      setIsOnline(navigator.onLine);
    };
    checkOnline();
    window.addEventListener('online', checkOnline);
    window.addEventListener('offline', checkOnline);
    return () => {
      window.removeEventListener('online', checkOnline);
      window.removeEventListener('offline', checkOnline);
    };
  }, []);

  // Load staff list
  useEffect(() => {
    const loadStaff = async () => {
      try {
        const response = await fetch(`/api/users?branchId=${branchId}`);
        if (response.ok) {
          const data = await response.json();
          setStaffList(data.users || []);
        }
      } catch (error) {
        console.error('Error loading staff:', error);
      }
    };
    loadStaff();
  }, [branchId]);

  // Check today's attendance
  useEffect(() => {
    const checkTodayAttendance = async () => {
      try {
        await storage.init();

        // Check offline first
        const offlineAttendance = await storage.getTodayAttendance(user.id, branchId);
        if (offlineAttendance) {
          setTodayAttendance(offlineAttendance);
          return;
        }

        // Check online
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const params = new URLSearchParams({
          userId: user.id,
          branchId,
          startDate: today.toISOString(),
          endDate: tomorrow.toISOString(),
          currentUserId: user.id,
        });

        const response = await fetch(`/api/attendance?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          if (data.attendances && data.attendances.length > 0) {
            setTodayAttendance(data.attendances[0]);
            // Cache in IndexedDB
            await storage.saveAttendance(data.attendances[0]);
          } else {
            setTodayAttendance(null);
          }
        }
      } catch (error) {
        console.error('Error checking today attendance:', error);
      }
    };

    if (user.id && branchId) {
      checkTodayAttendance();
    }
  }, [user.id, branchId]);

  // Clock in
  const handleClockIn = async () => {
    try {
      setLoading(true);

      const attendanceData = {
        userId: selectedStaffId || user.id,
        branchId,
        notes: notes || null,
        currentUserId: user.id,
        clockIn: new Date().toISOString(),
        status: 'PRESENT',
        isPaid: false,
      };

      if (isOnline) {
        const response = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(attendanceData),
        });

        if (response.ok) {
          const data = await response.json();
          setTodayAttendance(data.attendance);
          await storage.saveAttendance(data.attendance);

          // Queue sync operation
          await storage.addOperation({
            type: 'CLOCK_IN',
            data: attendanceData,
            branchId,
          });

          showSuccessToast('Clocked In', `Welcome ${data.attendance.user.name || 'back'}!`);
          setShowClockInDialog(false);
          setNotes('');
          setSelectedStaffId('');
          onClockIn?.();
        } else {
          const error = await response.json();
          showErrorToast('Failed', error.error || 'Failed to clock in');
        }
      } else {
        // Offline: Create temporary attendance record
        const tempId = `temp-attendance-${Date.now()}`;
        const tempAttendance = {
          ...attendanceData,
          id: tempId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          user: staffList.find((s: any) => s.id === (selectedStaffId || user.id)) || user,
          branch: { id: branchId, branchName: 'Current Branch' },
        };

        await storage.saveAttendance(tempAttendance);
        setTodayAttendance(tempAttendance);

        // Queue for sync
        await storage.addOperation({
          type: 'CLOCK_IN',
          data: attendanceData,
          branchId,
        });

        showSuccessToast('Clocked In (Offline)', `Attendance recorded. Will sync when online.`);
        setShowClockInDialog(false);
        setNotes('');
        setSelectedStaffId('');
        onClockIn?.();
      }
    } catch (error) {
      console.error('Error clocking in:', error);
      showErrorToast('Error', 'Failed to clock in');
    } finally {
      setLoading(false);
    }
  };

  // Clock out
  const handleClockOut = async () => {
    if (!todayAttendance) return;

    try {
      setLoading(true);

      if (isOnline) {
        const response = await fetch('/api/attendance/clock-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attendanceId: todayAttendance.id,
            notes: notes || undefined,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setTodayAttendance(data.attendance);

          // Update cached record
          await storage.saveAttendance(data.attendance);

          // Queue sync operation
          await storage.addOperation({
            type: 'CLOCK_OUT',
            data: {
              attendanceId: todayAttendance.id,
              clockOut: new Date().toISOString(),
              notes: notes || undefined,
            },
            branchId,
          });

          showSuccessToast('Clocked Out', 'See you tomorrow!');
          setShowClockOutDialog(false);
          setNotes('');
          onClockOut?.();
        } else {
          const error = await response.json();
          showErrorToast('Failed', error.error || 'Failed to clock out');
        }
      } else {
        // Offline: Update cached attendance record
        const updatedAttendance = {
          ...todayAttendance,
          clockOut: new Date().toISOString(),
          notes: notes || todayAttendance.notes,
        };

        await storage.saveAttendance(updatedAttendance);
        setTodayAttendance(updatedAttendance);

        // Queue for sync
        await storage.addOperation({
          type: 'CLOCK_OUT',
          data: {
            attendanceId: todayAttendance.id,
            clockOut: new Date().toISOString(),
            notes: notes || undefined,
          },
          branchId,
        });

        showSuccessToast('Clocked Out (Offline)', 'Recorded. Will sync when online.');
        setShowClockOutDialog(false);
        setNotes('');
        onClockOut?.();
      }
    } catch (error) {
      console.error('Error clocking out:', error);
      showErrorToast('Error', 'Failed to clock out');
    } finally {
      setLoading(false);
    }
  };

  // Can other users clock in (for managers)?
  const canClockInOthers = user.role === 'ADMIN' || user.role === 'BRANCH_MANAGER';

  if (!todayAttendance) {
    // Show Clock In button
    return (
      <>
        <Button
          onClick={() => setShowClockInDialog(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
          disabled={loading}
        >
          <LogIn className="h-4 w-4 mr-2" />
          Clock In
        </Button>

        <Dialog open={showClockInDialog} onOpenChange={setShowClockInDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5" />
                Clock In
              </DialogTitle>
              <DialogDescription>
                {canClockInOthers
                  ? 'Select a staff member to clock in or clock in yourself.'
                  : 'Clock in to start your shift.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {canClockInOthers && staffList.length > 0 && (
                <div>
                  <Label htmlFor="staff">Staff Member</Label>
                  <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                    <SelectTrigger id="staff">
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={user.id}>
                        {user.name || user.username} (You)
                      </SelectItem>
                      {staffList
                        .filter((s: any) => s.id !== user.id)
                        .map((staff: any) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.name || staff.username}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any notes about today..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowClockInDialog(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleClockIn} className="bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                {loading ? 'Clocking In...' : 'Clock In'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (!todayAttendance.clockOut) {
    // Show Clock Out button (currently clocked in)
    const clockInTime = new Date(todayAttendance.clockIn);
    const workDuration = Date.now() - clockInTime.getTime();
    const hours = Math.floor(workDuration / (1000 * 60 * 60));
    const minutes = Math.floor((workDuration % (1000 * 60 * 60)) / (1000 * 60));

    return (
      <>
        <Button
          onClick={() => setShowClockOutDialog(true)}
          variant="outline"
          className="border-amber-600 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
          disabled={loading}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Clock Out
          <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
            {hours}h {minutes}m
          </span>
        </Button>

        <Dialog open={showClockOutDialog} onOpenChange={setShowClockOutDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LogOut className="h-5 w-5" />
                Clock Out
              </DialogTitle>
              <DialogDescription>
                Clock out to end your shift. You've been working for {hours}h {minutes}m today.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <Clock className="h-5 w-5" />
                  <span className="font-semibold">Clocked in at: {clockInTime.toLocaleTimeString()}</span>
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any notes about your shift..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowClockOutDialog(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleClockOut} className="bg-amber-600 hover:bg-amber-700" disabled={loading}>
                {loading ? 'Clocking Out...' : 'Clock Out'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Already clocked out
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-400">
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      <span>Shift completed</span>
    </div>
  );
}
