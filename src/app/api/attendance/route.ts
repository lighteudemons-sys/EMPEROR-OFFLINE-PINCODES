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
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
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

// POST /api/attendance - Clock in (create attendance record)
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

    // Verify the user exists
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

    // Check if already clocked in today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingAttendance = await db.attendance.findFirst({
      where: {
        userId,
        branchId,
        clockIn: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    if (existingAttendance) {
      return NextResponse.json(
        { error: 'Already clocked in today', attendance: existingAttendance },
        { status: 400 }
      );
    }

    // Create attendance record
    const attendance = await db.attendance.create({
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

    return NextResponse.json({ success: true, attendance }, { status: 201 });
  } catch (error) {
    console.error('Error clocking in:', error);
    return NextResponse.json(
      { error: 'Failed to clock in' },
      { status: 500 }
    );
  }
}
