import { NextRequest, NextResponse } from 'next/server';
import { findCustomersByIdentifier, checkOtpRequestRate, generateAndSendOtp, maskPhone } from '@/lib/loyalty-portal-otp';

// ============================================================
// POST /api/loyalty-portal/send-otp
//
// Body: { membershipCodeOrPhone: string }
//
// Looks up customers by membership code or phone. If found,
// generates a 6-digit OTP, sends it via SMS (or logs it in dev
// mode), and returns a masked-phone acknowledgement.
//
// Rate limit: 3 OTP requests per 10 minutes per phone number.
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const identifier = String(body?.membershipCodeOrPhone || '').trim();

    if (!identifier) {
      return NextResponse.json(
        { success: false, error: 'Membership code or phone number is required' },
        { status: 400 }
      );
    }

    // Resolve customer(s) — multiple customers may share a phone
    const customers = await findCustomersByIdentifier(identifier);
    if (customers.length === 0) {
      // Don't leak whether the identifier exists — return same shape
      // as success but with a generic error so attackers can't enumerate.
      return NextResponse.json(
        {
          success: false,
          error: 'No customer found with that membership code or phone number.',
        },
        { status: 404 }
      );
    }

    // All matched customers must share the same phone (the lookup is
    // either by membership code → exactly one customer, or by phone
    // → all customers with that phone). The OTP goes to that phone.
    const phone = customers[0].phone;
    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Customer has no registered phone number. Please contact the branch.' },
        { status: 400 }
      );
    }

    // Rate limit
    const rate = checkOtpRequestRate(phone);
    if (!rate.allowed) {
      const retryMinutes = Math.ceil((rate.retryAfterMs || 0) / 60000);
      return NextResponse.json(
        {
          success: false,
          error: `Too many OTP requests. Please try again in ${retryMinutes} minute(s).`,
        },
        { status: 429 }
      );
    }

    // Generate + send OTP
    const customerIds = customers.map((c) => c.id);
    const result = await generateAndSendOtp(phone, customerIds);

    // Dev mode: include the OTP in the response so a test session
    // can use it. In production (with SMS configured), devOtp is
    // undefined and the OTP only goes via SMS.
    return NextResponse.json({
      success: true,
      maskedPhone: result.maskedPhone,
      devOtp: result.devOtp, // only set in dev mode
      smsSent: result.sent,
      message: result.sent
        ? `OTP sent to ${result.maskedPhone}`
        : `SMS not configured — OTP logged to server console (dev mode).`,
    });
  } catch (error) {
    console.error('[LoyaltyPortal] send-otp error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send OTP' },
      { status: 500 }
    );
  }
}
