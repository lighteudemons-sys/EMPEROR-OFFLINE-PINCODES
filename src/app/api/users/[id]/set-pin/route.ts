import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // In Next.js 16, params is a Promise and must be awaited
    const { id } = await params;
    const body = await request.json();
    const { pin } = body;

    // Validate PIN format (4-6 digits)
    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'PIN must be 4-6 digits' },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = await db.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Hash PIN
    const pinHash = await bcrypt.hash(pin, 10);

    // Update user's PIN
    await db.user.update({
      where: { id },
      data: { pin: pinHash },
    });

    return NextResponse.json({
      success: true,
      message: 'PIN set successfully',
    });
  } catch (error: any) {
    console.error('Set PIN error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set PIN' },
      { status: 500 }
    );
  }
}
