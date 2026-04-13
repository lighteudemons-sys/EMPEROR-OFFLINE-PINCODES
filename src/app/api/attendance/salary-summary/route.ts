import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { UserRole } from '@prisma/client';

// GET /api/attendance/salary-summary - Get salary summary for branch or all
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
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

    if (startDate || endDate) {
      where.clockIn = {}; // Filter by clockIn date, not createdAt
      if (startDate) {
        where.clockIn.gte = new Date(startDate);
      }
      if (endDate) {
        where.clockIn.lte = new Date(endDate);
      }
    }

    console.log('[Salary Summary] Where clause:', where);

    // Get all attendance records matching criteria
    const attendances = await db.attendance.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            dailyRate: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log('[Salary Summary] Found attendances:', attendances.length);
    attendances.forEach((a, i) => {
      console.log(`[Salary Summary]   ${i+1}. User: ${a.user?.username}, Branch: ${a.branchId}, ClockIn: ${a.clockIn}`);
    });

    // Calculate summary by user
    const userSummaries = new Map();

    attendances.forEach((attendance) => {
      const userId = attendance.user.id;
      const userName = attendance.user.name || attendance.user.username;
      const dailyRate = attendance.dailyRate || attendance.user.dailyRate || 0;

      if (!userSummaries.has(userId)) {
        userSummaries.set(userId, {
          userId,
          userName,
          totalDays: 0,
          paidDays: 0,
          unpaidDays: 0,
          totalOwed: 0,
          totalPaid: 0,
          attendances: [],
        });
      }

      const summary = userSummaries.get(userId);
      summary.totalDays += 1;

      if (attendance.isPaid) {
        summary.paidDays += 1;
        summary.totalPaid += dailyRate;
      } else {
        summary.unpaidDays += 1;
        summary.totalOwed += dailyRate;
      }

      summary.attendances.push(attendance);
    });

    // Convert map to array
    const summaries = Array.from(userSummaries.values());

    // Calculate totals
    const totals = {
      totalStaff: summaries.length,
      totalDays: summaries.reduce((sum, s) => sum + s.totalDays, 0),
      totalPaidDays: summaries.reduce((sum, s) => sum + s.paidDays, 0),
      totalUnpaidDays: summaries.reduce((sum, s) => sum + s.unpaidDays, 0),
      totalOwed: summaries.reduce((sum, s) => sum + s.totalOwed, 0),
      totalPaid: summaries.reduce((sum, s) => sum + s.totalPaid, 0),
    };

    console.log('[Salary Summary] Totals:', totals);
    console.log('[Salary Summary] Summaries:', summaries);

    return NextResponse.json({
      summaries,
      totals,
    });
  } catch (error) {
    console.error('Error fetching salary summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch salary summary' },
      { status: 500 }
    );
  }
}
