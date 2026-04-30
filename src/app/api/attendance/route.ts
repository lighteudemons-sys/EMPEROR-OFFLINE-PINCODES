import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AttendanceStatus, UserRole } from '@prisma/client';

// GET /api/attendance - List attendance records
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const branchId = searchParams.get('branchId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const isPaid = searchParams.get('isPaid');
    const currentUserId = searchParams.get('currentUserId');

    if (!currentUserId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Get current user to check permissions
    const currentUser = await db.user.findUnique({
      where: { id: currentUserId },
      include: { branch: true },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Build where clause with role-based access control
    const where: any = {};

    // Branch managers can only see their branch, admins can see all
    if (currentUser.role === UserRole.BRANCH_MANAGER && currentUser.branchId) {
      where.branchId = currentUser.branchId;
    } else if (branchId) {
      where.branchId = branchId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (status) {
      where.status = status as AttendanceStatus;
    }

    if (startDate || endDate) {
      where.clockIn = {}; // Filter by clockIn date, not createdAt
      if (startDate) {
        where.clockIn.gte = new Date(startDate);
      }
      if (endDate) {
        where.clockIn.lte = new Date(endDate);
      }
    }

    if (isPaid !== null && isPaid !== undefined) {
      where.isPaid = isPaid === 'true';
    }

    const attendances = await db.attendance.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
            dailyRate: true,
          },
        },
        branch: {
          select: {
            id: true,
            branchName: true,
          },
        },
        payer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ attendances });
  } catch (error) {
    console.error('Error fetching attendances:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attendances' },
      { status: 500 }
    );
  }
}

// POST /api/attendance - Clock in (create/update attendance record)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, branchId, notes, currentUserId } = body;

    if (!userId || !branchId || !currentUserId) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, branchId, currentUserId' },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get user's date (YYYY-MM-DD) for checking same-day attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDate = today.toISOString().split('T')[0];

    // Check if user already has an ACTIVE attendance (not clocked out)
    // This handles merging multiple clock-in attempts within the same shift
    const existingActiveAttendance = await db.attendance.findFirst({
      where: {
        userId,
        branchId,
        status: {
          in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE], // Check for active status records
        },
        clockOut: null, // Only active (not clocked out) attendance
      },
      orderBy: {
        clockIn: 'desc', // Get the most recent one
      },
    });

    let attendance;

    if (existingActiveAttendance) {
      // User has an active attendance, update it instead of creating new
      // This handles cases where cashier accidentally clicks clock in twice in the same shift
      console.log('[Attendance API] Found existing active attendance:', existingActiveAttendance);

      attendance = await db.attendance.update({
        where: { id: existingActiveAttendance.id },
        data: {
          clockIn: new Date(), // Update clock in time to current time
          status: AttendanceStatus.PRESENT,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              role: true,
              dailyRate: true,
            },
          },
        },
      });
      console.log('[Attendance API] Updated existing attendance:', attendance);
    } else {
      // No active attendance, create new record
      // This handles multiple shifts in a day (after clocking out from previous shift)
      console.log('[Attendance API] No active attendance, creating new record');

      attendance = await db.attendance.create({
        data: {
          userId,
          branchId,
          clockIn: new Date(),
          status: AttendanceStatus.PRESENT,
          notes: notes || null,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              role: true,
              dailyRate: true,
            },
          },
          branch: {
            select: {
              id: true,
              branchName: true,
            },
          },
        },
      });
    }

    return NextResponse.json({ success: true, attendance }, { status: 201 });
  } catch (error) {
    console.error('Error clocking in:', error);
    return NextResponse.json(
      { error: 'Failed to clock in' },
      { status: 500 }
    );
  }
}
