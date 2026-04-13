import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AttendanceStatus } from '@prisma/client';

// POST /api/attendance/clock-out - Clock out for the day
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { attendanceId, notes } = body;

    if (!attendanceId) {
      return NextResponse.json(
        { error: 'Missing required field: attendanceId' },
        { status: 400 }
      );
    }

    // Check if attendance exists and is not already clocked out
    const attendance = await db.attendance.findUnique({
      where: { id: attendanceId },
    });

    if (!attendance) {
      return NextResponse.json(
        { error: 'Attendance record not found' },
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
      where: { id: attendanceId },
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
