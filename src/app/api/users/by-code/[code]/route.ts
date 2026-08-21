import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const { code } = params;

    // Validate code is 4 digits
    if (!/^\d{4}$/.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid user code format' },
        { status: 400 }
      );
    }

    // Find user by userCode
    const user = await db.user.findUnique({
      where: { userCode: code },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        userCode: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { success: false, error: 'User account is inactive' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        userCode: user.userCode,
      },
    });
  } catch (error: any) {
    console.error('User lookup error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        debugMessage: error?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
