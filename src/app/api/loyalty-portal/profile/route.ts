import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPortalSession } from '@/lib/loyalty-portal-session';
import { getCustomerProgress } from '@/lib/loyalty-engine';

// ============================================================
// GET /api/loyalty-portal/profile
//
// Returns the customer's loyalty data for portal display:
//   - Name, membership code, tier (masked phone)
//   - Active promotions + progress
//   - Available rewards
//   - Recent stamp transactions (no monetary amounts — only
//     loyalty-relevant data per the plan's security matrix)
//
// Auth: requires a valid portal session token (HTTP-only cookie
// or Authorization: Bearer header). Customer sessions only — no
// staff auth, no admin override. Financial fields (totalSpent,
// creditBalance) are NOT returned.
// ============================================================

export async function GET(request: NextRequest) {
  try {
    // Token may be in cookie (browser) or Authorization header (mobile)
    const cookieToken = request.cookies.get('loyalty_portal_token')?.value;
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const token = cookieToken || bearerToken || '';

    const customerId = await verifyPortalSession(token);
    if (!customerId) {
      return NextResponse.json(
        { success: false, error: 'Session expired or invalid. Please verify your phone again.' },
        { status: 401 }
      );
    }

    // Load customer (portal-visible fields only — no financials)
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        membershipCode: true,
        tier: true,
        loyaltyPoints: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Load multi-promotion progress (uses the same engine the POS uses)
    const progress = await getCustomerProgress(customerId);

    // Recent stamp transactions (no monetary amounts)
    const recentTransactions = await db.loyaltyStampTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        type: true,
        stamps: true,
        promotionId: true,
        createdAt: true,
        reason: true,
      },
    });

    // Mask the phone for display
    const maskedPhone = customer.phone
      ? customer.phone.replace(/.(?=.{4})/g, '*')
      : '';

    return NextResponse.json({
      success: true,
      profile: {
        name: customer.name,
        membershipCode: customer.membershipCode,
        tier: customer.tier || 'BRONZE',
        legacyPoints: customer.loyaltyPoints || 0,
        maskedPhone,
        email: customer.email || null,
      },
      progress, // includes enrollments[] and availableRewards[]
      recentTransactions,
    });
  } catch (error) {
    console.error('[LoyaltyPortal] profile error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load portal profile' },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/loyalty-portal/logout
// ============================================================
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('loyalty_portal_token');
  return response;
}
