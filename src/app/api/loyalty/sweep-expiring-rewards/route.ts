import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session-manager';
import { canManageLoyaltyPromotions, canViewLoyaltyReports } from '@/lib/loyalty-permissions';
import { sweepExpiringRewards } from '@/lib/loyalty-notifications';

// ============================================================
// POST /api/loyalty/sweep-expiring-rewards
//
// Walks all AVAILABLE reward instances whose expiresAt is within
// `withinDays` (default 3) of now, and creates a LOYALTY_MILESTONE
// notification addressed to the customer's home branch — unless
// one already exists (idempotent by entityId + entityType).
//
// Intended to be called by:
//   - A daily cron job (e.g. Vercel Cron, systemd timer, etc.)
//   - Manual admin trigger from the loyalty reports tab
//
// Auth: ADMIN or BRANCH_MANAGER (the sweep is global — branch
// managers can run it but it will create notifications for any
// branch, since expiring rewards may belong to customers in any
// branch. The notifications themselves are scoped to each
// customer's home branch).
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canViewLoyaltyReports(session)) {
      return NextResponse.json(
        { error: 'Forbidden — ADMIN or BRANCH_MANAGER only' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const withinDays = Math.min(
      30,
      Math.max(1, parseInt(searchParams.get('withinDays') || '3', 10))
    );

    const created = await sweepExpiringRewards(withinDays);

    return NextResponse.json({
      success: true,
      created,
      withinDays,
      message: `${created} new expiring-reward notification(s) created.`,
    });
  } catch (error) {
    console.error('[Loyalty] sweep-expiring-rewards error:', error);
    return NextResponse.json(
      { error: 'Failed to run sweep' },
      { status: 500 }
    );
  }
}
