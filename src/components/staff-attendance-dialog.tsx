'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { offlineManager } from '@/lib/offline/offline-manager';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/hooks/use-toast';
import { Users, Clock, CheckCircle2, AlertCircle, Loader2, LogOut, LogIn } from 'lucide-react';

interface StaffMember {
  id: string;
  name: string | null;
  username: string;
  role: string;
  dailyRate: number | null;
}

interface StaffAttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  onSuccess?: () => void;
}

interface TodayAttendance {
  id: string;
  userId: string;
  clockIn: string;
  clockOut: string | null;
  status: string;
}

type AttendanceMode = 'clock-in' | 'clock-out';

export default function StaffAttendanceDialog({
  open,
  onOpenChange,
  branchId,
  onSuccess,
}: StaffAttendanceDialogProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<AttendanceMode>('clock-in');
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Record<string, TodayAttendance>>({});
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [processingStaff, setProcessingStaff] = useState<Set<string>>(new Set());

  const storage = getIndexedDBStorage();

  // Reset mode when dialog opens
  useEffect(() => {
    if (open) {
      setMode('clock-in');
      setSelectedStaffIds(new Set());
      setClockOutNotes('');
    }
  }, [open]);

  // Fetch staff list and today's attendance
  useEffect(() => {
    const fetchData = async () => {
      if (!open || !branchId) return;

      try {
        setLoading(true);

        // Fetch staff list - ONLY CASHIERS
        let staffMembers: StaffMember[] = [];

        // Try IndexedDB first
        try {
          const offlineUsers = await storage.getAllUsers();
          if (offlineUsers && offlineUsers.length > 0) {
            staffMembers = offlineUsers
              .filter((u: any) => u.branchId === branchId && u.isActive && u.role === 'CASHIER')
              .map((u: any) => ({
                id: u.id,
                name: u.name,
                username: u.username,
                role: u.role,
                dailyRate: u.dailyRate,
              }));
          }
        } catch (error) {
          console.error('Error fetching staff from IndexedDB:', error);
        }

        // If online, fetch from API
        if (offlineManager.isCurrentlyOnline()) {
          try {
            const response = await fetch(
              `/api/users?currentUserRole=${user.role}&currentUserBranchId=${user.branchId || ''}&branchId=${branchId}`
            );
            if (response.ok) {
              const data = await response.json();
              if (data.users && Array.isArray(data.users)) {
                staffMembers = data.users
                  .filter((u: any) => u.branchId === branchId && u.isActive && u.role === 'CASHIER')
                  .map((u: any) => ({
                    id: u.id,
                    name: u.name,
                    username: u.username,
                    role: u.role,
                    dailyRate: u.dailyRate,
                  }));
              }
            }
          } catch (error) {
            console.error('Error fetching staff from API:', error);
          }
        }

        setStaffList(staffMembers);

        // Fetch today's attendance
        const attendanceMap: Record<string, TodayAttendance> = {};

        // Try to get from IndexedDB first
        for (const staff of staffMembers) {
          try {
            const offlineAttendance = await storage.getTodayAttendance(staff.id, branchId);
            if (offlineAttendance) {
              attendanceMap[staff.id] = offlineAttendance;
            }
          } catch (error) {
            console.error(`Error fetching attendance for ${staff.id}:`, error);
          }
        }

        // If online, fetch from API
        if (offlineManager.isCurrentlyOnline()) {
          try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Fetch attendance for all staff members
            for (const staff of staffMembers) {
              const response = await fetch(
                `/api/attendance?userId=${staff.id}&branchId=${branchId}&currentUserId=${user.id}`
              );
              if (response.ok) {
                const data = await response.json();
                const attendances = data.attendances || [];
                if (attendances.length > 0) {
                  attendanceMap[staff.id] = attendances[0];
                }
              }
            }
          } catch (error) {
            console.error('Error fetching attendance from API:', error);
          }
        }

        setTodayAttendance(attendanceMap);

        // Auto-select based on mode
        if (mode === 'clock-in') {
          // Pre-select staff who are already clocked in and not clocked out
          const alreadyClockedIn = staffMembers
            .filter((staff) => attendanceMap[staff.id] && !attendanceMap[staff.id].clockOut)
            .map((staff) => staff.id);
          setSelectedStaffIds(new Set(alreadyClockedIn));
        } else {
          // In clock-out mode, select all currently clocked-in staff
          const clockedInStaff = staffMembers
            .filter((staff) => attendanceMap[staff.id] && !attendanceMap[staff.id].clockOut)
            .map((staff) => staff.id);
          setSelectedStaffIds(new Set(clockedInStaff));
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        showErrorToast('Error', 'Failed to load staff data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, branchId, user.id, user.role, user.branchId, mode]);

  // Handle checkbox toggle
  const handleToggleStaff = (staffId: string) => {
    setSelectedStaffIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(staffId)) {
        newSet.delete(staffId);
      } else {
        newSet.add(staffId);
      }
      return newSet;
    });
  };

  // Handle clock in for selected staff
  const handleClockInSelected = async () => {
    if (selectedStaffIds.size === 0) {
      showWarningToast('Warning', 'Please select at least one staff member');
      return;
    }

    try {
      setSubmitting(true);
      setProcessingStaff(new Set(selectedStaffIds));

      const results = {
        success: 0,
        failed: 0,
        skipped: 0,
      };

      const isOnline = offlineManager.isCurrentlyOnline();

      // Clock in each selected staff member
      for (const staffId of selectedStaffIds) {
        try {
          // Check if already clocked in today
          const existing = todayAttendance[staffId];
          if (existing && !existing.clockOut) {
            // Already clocked in and not clocked out
            results.skipped++;
            setProcessingStaff((prev) => {
              const newSet = new Set(prev);
              newSet.delete(staffId);
              return newSet;
            });
            continue;
          }

          if (isOnline) {
            // ONLINE: Direct API call
            const response = await fetch('/api/attendance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: staffId,
                branchId,
                clockIn: new Date().toISOString(),
                status: 'PRESENT',
                currentUserId: user.id,
              }),
            });

            if (response.ok) {
              const data = await response.json();
              const attendance = data.attendance;

              // Update local state with the server response
              setTodayAttendance((prev) => ({
                ...prev,
                [staffId]: attendance,
              }));

              results.success++;
            } else {
              const error = await response.json();
              console.error(`Error clocking in staff ${staffId}:`, error);
              results.failed++;
            }
          } else {
            // OFFLINE: Use operation queue
            const attendanceData = {
              userId: staffId,
              branchId,
              clockIn: new Date().toISOString(),
              status: 'PRESENT',
            };

            // Queue for offline sync
            await storage.addOperation({
              type: 'CLOCK_IN',
              data: attendanceData,
              branchId,
            });

            // Save to IndexedDB immediately
            const tempId = `temp-attendance-${Date.now()}-${staffId}`;
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

            // Update local state
            setTodayAttendance((prev) => ({
              ...prev,
              [staffId]: localAttendance,
            }));

            results.success++;
          }

          setProcessingStaff((prev) => {
            const newSet = new Set(prev);
            newSet.delete(staffId);
            return newSet;
          });
        } catch (error) {
          console.error(`Error clocking in staff ${staffId}:`, error);
          results.failed++;
          setProcessingStaff((prev) => {
            const newSet = new Set(prev);
            newSet.delete(staffId);
            return newSet;
          });
        }
      }

      // Show results
      if (results.success > 0) {
        showSuccessToast('Success', `${results.success} staff member(s) clocked in`);
      }
      if (results.failed > 0) {
        showErrorToast('Error', `${results.failed} staff member(s) failed to clock in`);
      }
      if (results.skipped > 0) {
        showWarningToast('Skipped', `${results.skipped} staff member(s) already clocked in`);
      }

      if (results.success > 0) {
        onSuccess?.();
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error clocking in staff:', error);
      showErrorToast('Error', 'Failed to clock in staff');
    } finally {
      setSubmitting(false);
      setProcessingStaff(new Set());
    }
  };

  // Handle clock out for selected staff
  const handleClockOutSelected = async () => {
    if (selectedStaffIds.size === 0) {
      showWarningToast('Warning', 'Please select at least one staff member');
      return;
    }

    try {
      setSubmitting(true);
      setProcessingStaff(new Set(selectedStaffIds));

      const results = {
        success: 0,
        failed: 0,
        skipped: 0,
      };

      const isOnline = offlineManager.isCurrentlyOnline();

      // Clock out each selected staff member
      for (const staffId of selectedStaffIds) {
        try {
          const existing = todayAttendance[staffId];

          // Check if already clocked out or not clocked in
          if (!existing) {
            // Not clocked in
            results.skipped++;
            setProcessingStaff((prev) => {
              const newSet = new Set(prev);
              newSet.delete(staffId);
              return newSet;
            });
            continue;
          }

          if (existing.clockOut) {
            // Already clocked out
            results.skipped++;
            setProcessingStaff((prev) => {
              const newSet = new Set(prev);
              newSet.delete(staffId);
              return newSet;
            });
            continue;
          }

          if (isOnline) {
            // ONLINE: Direct API call
            const response = await fetch('/api/attendance/clock-out', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                attendanceId: existing.id,
                clockOut: new Date().toISOString(),
                notes: clockOutNotes || null,
              }),
            });

            if (response.ok) {
              const data = await response.json();
              const attendance = data.attendance;

              // Update local state with the server response
              setTodayAttendance((prev) => ({
                ...prev,
                [staffId]: attendance,
              }));

              results.success++;
            } else {
              const error = await response.json();
              console.error(`Error clocking out staff ${staffId}:`, error);
              results.failed++;
            }
          } else {
            // OFFLINE: Use operation queue
            const clockOutData = {
              attendanceId: existing.id,
              clockOut: new Date().toISOString(),
              notes: clockOutNotes || null,
            };

            // Queue for offline sync
            await storage.addOperation({
              type: 'CLOCK_OUT',
              data: clockOutData,
              branchId,
            });

            // Update local attendance
            const updatedAttendance = {
              ...existing,
              clockOut: new Date().toISOString(),
              notes: clockOutNotes || existing.notes,
            };
            await storage.saveAttendance(updatedAttendance);

            // Update local state
            setTodayAttendance((prev) => ({
              ...prev,
              [staffId]: updatedAttendance,
            }));

            results.success++;
          }

          setProcessingStaff((prev) => {
            const newSet = new Set(prev);
            newSet.delete(staffId);
            return newSet;
          });
        } catch (error) {
          console.error(`Error clocking out staff ${staffId}:`, error);
          results.failed++;
          setProcessingStaff((prev) => {
            const newSet = new Set(prev);
            newSet.delete(staffId);
            return newSet;
          });
        }
      }

      // Show results
      if (results.success > 0) {
        showSuccessToast('Success', `${results.success} staff member(s) clocked out`);
      }
      if (results.failed > 0) {
        showErrorToast('Error', `${results.failed} staff member(s) failed to clock out`);
      }
      if (results.skipped > 0) {
        showWarningToast('Skipped', `${results.skipped} staff member(s) skipped`);
      }

      if (results.success > 0) {
        onSuccess?.();
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error clocking out staff:', error);
      showErrorToast('Error', 'Failed to clock out staff');
    } finally {
      setSubmitting(false);
      setProcessingStaff(new Set());
      setClockOutNotes('');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'BRANCH_MANAGER':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'CASHIER':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
    }
  };

  const getAttendanceStatus = (staff: StaffMember) => {
    const attendance = todayAttendance[staff.id];
    if (!attendance) return 'not-clocked-in';
    if (attendance.clockOut) return 'clocked-out';
    return 'clocked-in';
  };

  // Get filtered staff list based on mode
  const getFilteredStaff = () => {
    if (mode === 'clock-in') {
      // In clock-in mode, show all cashiers
      return staffList;
    } else {
      // In clock-out mode, only show currently clocked-in staff
      return staffList.filter((staff) => getAttendanceStatus(staff) === 'clocked-in');
    }
  };

  const filteredStaff = getFilteredStaff();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Staff Attendance
          </DialogTitle>
          <DialogDescription>
            Manage cashier attendance - clock in and clock out staff members
          </DialogDescription>
        </DialogHeader>

        {/* Mode Toggle */}
        <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <Button
            variant={mode === 'clock-in' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMode('clock-in')}
            className="flex-1 gap-2"
          >
            <LogIn className="h-4 w-4" />
            Clock In
          </Button>
          <Button
            variant={mode === 'clock-out' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMode('clock-out')}
            className="flex-1 gap-2"
          >
            <LogOut className="h-4 w-4" />
            Clock Out
          </Button>
        </div>

        <div className="flex flex-col gap-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <span className="ml-2 text-slate-600">Loading staff...</span>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">
                {mode === 'clock-out'
                  ? 'No cashiers currently clocked in'
                  : 'No cashiers found for this branch'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">
                  {mode === 'clock-in'
                    ? `${staffList.length} cashier(s) total`
                    : `${filteredStaff.length} cashier(s) currently clocked in`}
                </span>
                {mode === 'clock-in' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const clockedInStaff = staffList.filter(
                        (s) => getAttendanceStatus(s) === 'clocked-in'
                      );
                      setSelectedStaffIds(new Set(clockedInStaff.map((s) => s.id)));
                    }}
                  >
                    Select Active
                  </Button>
                )}
              </div>

              <ScrollArea className="h-[320px] pr-4">
                <div className="space-y-2">
                  {filteredStaff.map((staff) => {
                    const status = getAttendanceStatus(staff);
                    const isProcessing = processingStaff.has(staff.id);
                    const isClockedIn = status === 'clocked-in';
                    const attendance = todayAttendance[staff.id];

                    // Calculate work duration if clocked in
                    const workDuration = attendance && !attendance.clockOut
                      ? Math.floor((Date.now() - new Date(attendance.clockIn).getTime()) / (1000 * 60 * 60))
                      : null;

                    return (
                      <div
                        key={staff.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          selectedStaffIds.has(staff.id)
                            ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'
                            : 'bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700'
                        } ${isProcessing ? 'opacity-50' : ''}`}
                      >
                        <Checkbox
                          id={`staff-${staff.id}`}
                          checked={selectedStaffIds.has(staff.id)}
                          onCheckedChange={() => handleToggleStaff(staff.id)}
                          disabled={isProcessing}
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`staff-${staff.id}`}
                              className="font-medium text-slate-900 dark:text-white cursor-pointer truncate"
                            >
                              {staff.name || staff.username}
                            </label>
                            <Badge className={`text-xs ${getRoleBadgeColor(staff.role)}`}>
                              {staff.role}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-slate-600 dark:text-slate-400">
                            <span>@{staff.username}</span>
                            {isClockedIn && attendance && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <Clock className="h-3 w-3" />
                                  {new Date(attendance.clockIn).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                {workDuration !== null && (
                                  <>
                                    <span>•</span>
                                    <span className="text-slate-500">
                                      {workDuration}h worked
                                    </span>
                                  </>
                                )}
                              </>
                            )}
                            {status === 'clocked-out' && attendance && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500">
                                  {new Date(attendance.clockOut!).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isClockedIn ? (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : status === 'clocked-out' ? (
                            <Badge variant="outline">
                              Clocked Out
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-500">
                              Not Clocked In
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {mode === 'clock-out' && (
                <>
                  <Separator />
                  <div>
                    <Label htmlFor="clockOutNotes">Notes (Optional)</Label>
                    <Textarea
                      id="clockOutNotes"
                      placeholder="Add any notes about today's work..."
                      value={clockOutNotes}
                      onChange={(e) => setClockOutNotes(e.target.value)}
                      rows={2}
                      className="mt-2"
                    />
                  </div>
                </>
              )}

              <Separator />

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">
                  Selected: {selectedStaffIds.size} staff member(s)
                </span>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={mode === 'clock-in' ? handleClockInSelected : handleClockOutSelected}
            disabled={submitting || selectedStaffIds.size === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === 'clock-in' ? 'Clock In' : 'Clock Out'} Selected ({selectedStaffIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
