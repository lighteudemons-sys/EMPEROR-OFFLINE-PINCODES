import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { UserRole } from '@prisma/client';

// GET /api/attendance/active-staff - Get currently clocked-in staff
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const currentUserId = searchParams.get('currentUserId');

    if (!branchId) {
      return NextResponse.json(
        { error: 'Branch ID is required' },
        { status: 400 }
      );
    }

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

    // Check if user has permission to view attendance for this branch
    if (currentUser.role === UserRole.BRANCH_MANAGER && currentUser.branchId !== branchId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Get today's date (midnight)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find active staff (clocked in today, not clocked out)
    const activeStaff = await db.attendance.findMany({
      where: {
        branchId,
        clockIn: {
          gte: today,
          lt: tomorrow, // Only today's records
        },
        clockOut: null, // Must not have clocked out
        user: {
          role: UserRole.CASHIER, // Only CASHIER role
          isActive: true, // Only active users
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
          },
        },
      },
      orderBy: {
        clockIn: 'desc',
      },
    });

    console.log('[Active Staff API] Found', activeStaff.length, 'active staff members');

    return NextResponse.json({
      activeStaff: activeStaff.map(a => ({
        id: a.id,
        userId: a.userId,
        userName: a.user.name || a.user.username,
        clockIn: a.clockIn,
      })),
    });
  } catch (error) {
    console.error('[Active Staff API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch active staff' },
      { status: 500 }
    );
  }
}
