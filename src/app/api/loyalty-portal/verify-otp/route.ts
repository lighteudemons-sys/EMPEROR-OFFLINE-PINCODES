import { NextRequest, NextResponse } from 'next/server';
import { findCustomersByIdentifier, verifyOtp } from '@/lib/loyalty-portal-otp';
import { createPortalSession } from '@/lib/loyalty-portal-session';

// ============================================================
// POST /api/loyalty-portal/verify-otp
//
// Body: { membershipCodeOrPhone: string, otp: string }
//
// Verifies the OTP and returns a session token + customer
// identifier (masked). The token is required for all subsequent
// /api/loyalty-portal/* calls.
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const identifier = String(body?.membershipCodeOrPhone || '').trim();
    const code = String(body?.otp || '').trim();

    if (!identifier || !code) {
      return NextResponse.json(
        { success: false, error: 'Membership code/phone and OTP are required' },
        { status: 400 }
      );
    }

    // Resolve customer(s) — must match what was used in send-otp
    const customers = await findCustomersByIdentifier(identifier);
    if (customers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const phone = customers[0].phone;
    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Customer has no registered phone number' },
        { status: 400 }
      );
    }

    // Verify OTP
    const result = verifyOtp(phone, code);
    if (!result.valid || !result.customerIds || result.customerIds.length === 0) {
      return NextResponse.json(
        { success: false, error: result.reason || 'Invalid OTP' },
        { status: 401 }
      );
    }

    // For multi-customer phones, we'd need a follow-up step to pick which
    // customer. For now (single-customer-per-phone is the normal case),
    // we just create a session for the first one.
    // TODO: if multiple customers, return customer list and require a
    // follow-up "select customer" call before issuing the session.
    const customerId = result.customerIds[0];

    // Create session
    const session = await createPortalSession(customerId);

    // Set HTTP-only cookie (24h TTL)
    const response = NextResponse.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      maskedPhone: phone.replace(/.(?=.{4})/g, '*'),
    });
    response.cookies.set('loyalty_portal_token', session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.floor((session.expiresAt - Date.now()) / 1000),
    });

    return response;
  } catch (error) {
    console.error('[LoyaltyPortal] verify-otp error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify OTP' },
      { status: 500 }
    );
  }
}
