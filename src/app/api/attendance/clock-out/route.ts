import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AttendanceStatus } from '@prisma/client';

// POST /api/attendance/clock-out - Clock out for the day
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { attendanceId, userId, branchId, notes } = body;

    // Support both old (attendanceId) and new (userId + branchId) approaches
    let attendance;

    if (attendanceId) {
      // Old approach: Find by ID
      attendance = await db.attendance.findUnique({
        where: { id: attendanceId },
      });
    } else if (userId && branchId) {
      // New approach: Find today's most recent active attendance
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      attendance = await db.attendance.findFirst({
        where: {
          userId,
          branchId,
          clockIn: {
            gte: today,
            lt: tomorrow,
          },
          clockOut: null, // Only active (not clocked out) attendance
        },
        orderBy: {
          clockIn: 'desc', // Get most recent one
        },
      });
    }

    if (!attendance) {
      return NextResponse.json(
        { error: 'No active attendance found to clock out. Please clock in first.' },
        { status: 404 }
      );
    }

    if (attendance.clockOut) {
      return NextResponse.json(
        { error: 'Already clocked out', attendance },
        { status: 400 }
      );
    }

    // Update attendance with clock out time
    const updatedAttendance = await db.attendance.update({
      where: { id: attendance.id },
      data: {
        clockOut: new Date(),
        notes: notes || attendance.notes,
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

    return NextResponse.json({ success: true, attendance: updatedAttendance });
  } catch (error) {
    console.error('Error clocking out:', error);
    return NextResponse.json(
      { error: 'Failed to clock out' },
      { status: 500 }
    );
  }
}
