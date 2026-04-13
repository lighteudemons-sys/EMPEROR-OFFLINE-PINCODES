'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { offlineManager } from '@/lib/offline/offline-manager';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';
import { UserCheck, UserX } from 'lucide-react';
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
  const [showStaffAttendanceDialog, setShowStaffAttendanceDialog] = useState(false);
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

  // Fetch staff list for clock in dialog (only CASHIERS)
  useEffect(() => {
    const fetchStaffList = async () => {
      try {
        let allUsers: any[] = [];

        // Try to get from IndexedDB first
        const offlineUsers = await storage.getAllUsers();
        if (offlineUsers && offlineUsers.length > 0) {
          allUsers = offlineUsers;
        }

        // If online, fetch from API
        if (offlineManager.isCurrentlyOnline()) {
          const response = await fetch(`/api/users?currentUserRole=${user.role}&currentUserBranchId=${user.branchId || ''}`);
          if (response.ok) {
            const data = await response.json();
            if (data.users && Array.isArray(data.users)) {
              allUsers = data.users;
            }
          }
        }

        // Filter to only include CASHIERS
        const cashiersOnly = allUsers.filter((u: any) => u.role === 'CASHIER');
        setStaffList(cashiersOnly.map((u: any) => ({
          id: u.id,
          name: u.name || u.username,
          username: u.username,
        })));
      } catch (error) {
        console.error('Error fetching staff list:', error);
      }
    };

    fetchStaffList();
  }, [user?.role, user?.branchId]);

  if (loading) {
    return (
      <>
        <Button variant="outline" size="sm" disabled>
          Loading...
        </Button>
        {/* Always render the dialog */}
        <StaffAttendanceDialog
          open={showStaffAttendanceDialog}
          onOpenChange={setShowStaffAttendanceDialog}
          branchId={branchId}
          onSuccess={() => {
            // Refresh current user's attendance after marking staff (for cashiers)
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
      </>
    );
  }

  const isClockedIn = todayAttendance && !todayAttendance.clockOut;

  // For branch managers and admins: show "Manage Staff Attendance" button only
  // For cashiers: show their personal clock in/out button
  const button =
    user.role === 'BRANCH_MANAGER' || user.role === 'ADMIN' ? (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowStaffAttendanceDialog(true)}
        className="text-amber-600 border-amber-600 hover:bg-amber-50"
      >
        <UserX className="h-4 w-4 mr-2" />
        Manage Staff Attendance
      </Button>
    ) : isClockedIn ? (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowStaffAttendanceDialog(true)}
        className="text-emerald-600 border-emerald-600 hover:bg-emerald-50"
      >
        <UserCheck className="h-4 w-4 mr-2" />
        Clocked In
      </Button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowStaffAttendanceDialog(true)}
        className="text-amber-600 border-amber-600 hover:bg-amber-50"
      >
        <UserX className="h-4 w-4 mr-2" />
        Clock In
      </Button>
    );

  return (
    <>
      {button}

      {/* Staff Attendance Dialog (for all users - manage cashier attendance) */}
      <StaffAttendanceDialog
        open={showStaffAttendanceDialog}
        onOpenChange={setShowStaffAttendanceDialog}
        branchId={branchId}
        onSuccess={() => {
          // Refresh current user's attendance after marking staff (for cashiers)
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
    </>
  );
}
