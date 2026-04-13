import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { UserRole } from '@prisma/client';

// DELETE /api/attendance/[id] - Delete an attendance record (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: attendanceId } = await params;
    const body = await request.json();
    const { currentUserId } = body;

    if (!currentUserId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Get current user to verify permissions
    const currentUser = await db.user.findUnique({
      where: { id: currentUserId },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Only ADMIN can delete attendance records
    if (currentUser.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: 'Only admins can delete attendance records' },
        { status: 403 }
      );
    }

    // Check if attendance exists
    const attendance = await db.attendance.findUnique({
      where: { id: attendanceId },
    });

    if (!attendance) {
      return NextResponse.json(
        { error: 'Attendance record not found' },
        { status: 404 }
      );
    }

    // Delete the attendance record
    await db.attendance.delete({
      where: { id: attendanceId },
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance record deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    return NextResponse.json(
      { error: 'Failed to delete attendance record' },
      { status: 500 }
    );
  }
}
