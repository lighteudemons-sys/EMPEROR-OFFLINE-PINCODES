import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/attendance/mark-paid - Mark attendance as paid (bulk or single)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { attendanceIds, paidBy, markAsPaid = true } = body;

    if (!attendanceIds || !Array.isArray(attendanceIds) || attendanceIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: attendanceIds (array)' },
        { status: 400 }
      );
    }

    if (!paidBy) {
      return NextResponse.json(
        { error: 'Missing required field: paidBy' },
        { status: 400 }
      );
    }

    // Verify the payer exists
    const payer = await db.user.findUnique({
      where: { id: paidBy },
    });

    if (!payer) {
      return NextResponse.json(
        { error: 'Payer user not found' },
        { status: 404 }
      );
    }

    // Update all attendance records
    const updatedAttendances = await db.attendance.updateMany({
      where: {
        id: {
          in: attendanceIds,
        },
      },
      data: {
        isPaid: markAsPaid,
        paidAt: markAsPaid ? new Date() : null,
        paidBy: markAsPaid ? paidBy : null,
      },
    });

    // Fetch updated records with full details
    const attendances = await db.attendance.findMany({
      where: {
        id: {
          in: attendanceIds,
        },
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
        payer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      count: updatedAttendances.count,
      attendances,
    });
  } catch (error) {
    console.error('Error marking attendance as paid:', error);
    return NextResponse.json(
      { error: 'Failed to mark attendance as paid' },
      { status: 500 }
    );
  }
}
