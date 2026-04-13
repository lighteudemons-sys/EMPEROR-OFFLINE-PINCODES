'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-context';
import { offlineManager } from '@/lib/offline/offline-manager';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/hooks/use-toast';
import { Users, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

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

export default function StaffAttendanceDialog({
  open,
  onOpenChange,
  branchId,
  onSuccess,
}: StaffAttendanceDialogProps) {
  const { user } = useAuth();
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Record<string, TodayAttendance>>({});
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [processingStaff, setProcessingStaff] = useState<Set<string>>(new Set());

  const storage = getIndexedDBStorage();

  // Fetch staff list and today's attendance
  useEffect(() => {
    const fetchData = async () => {
      if (!open || !branchId) return;

      try {
        setLoading(true);

        // Fetch staff list
        let staffMembers: StaffMember[] = [];

        // Try IndexedDB first
        try {
          const offlineUsers = await storage.getAllUsers();
          if (offlineUsers && offlineUsers.length > 0) {
            staffMembers = offlineUsers
              .filter((u: any) => u.branchId === branchId && u.isActive)
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
                  .filter((u: any) => u.branchId === branchId && u.isActive)
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

        // Pre-select staff who are already clocked in and not clocked out
        const alreadyClockedIn = staffMembers
          .filter((staff) => attendanceMap[staff.id] && !attendanceMap[staff.id].clockOut)
          .map((staff) => staff.id);
        setSelectedStaffIds(new Set(alreadyClockedIn));
      } catch (error) {
        console.error('Error fetching data:', error);
        showErrorToast('Error', 'Failed to load staff data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, branchId, user.id, user.role, user.branchId]);

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

      // Sync if online
      if (offlineManager.isCurrentlyOnline()) {
        await offlineManager.forceSync();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Staff Attendance - Mark Present
          </DialogTitle>
          <DialogDescription>
            Select all staff members who are present and working today. This will clock them in.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <span className="ml-2 text-slate-600">Loading staff...</span>
            </div>
          ) : staffList.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">No staff members found for this branch</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">
                  {staffList.length} staff member(s)
                </span>
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
              </div>

              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {staffList.map((staff) => {
                    const status = getAttendanceStatus(staff);
                    const isProcessing = processingStaff.has(staff.id);
                    const isClockedIn = status === 'clocked-in';

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
                            {isClockedIn && todayAttendance[staff.id] && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <Clock className="h-3 w-3" />
                                  {new Date(todayAttendance[staff.id].clockIn).toLocaleTimeString([], {
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
            onClick={handleClockInSelected}
            disabled={submitting || selectedStaffIds.size === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Clock In Selected ({selectedStaffIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
