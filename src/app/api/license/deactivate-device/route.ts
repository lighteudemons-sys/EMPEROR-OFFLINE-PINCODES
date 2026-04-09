// Deactivate device (clear activation cookie)
// POST /api/license/deactivate-device

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Clear the activation cookie
    return NextResponse.json({
      success: true,
      message: 'Device deactivated successfully'
    }, {
      headers: {
        'Set-Cookie': 'activated_branch_id=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
      }
    });
  } catch (error: any) {
    console.error('[License Deactivation] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to deactivate device',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
