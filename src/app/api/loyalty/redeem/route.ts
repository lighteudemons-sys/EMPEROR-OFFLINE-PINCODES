import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session-manager';
import { canRedeemRewards } from '@/lib/loyalty-permissions';
import { redeemReward } from '@/lib/loyalty-engine';

const redeemSchema = z.object({
  rewardInstanceId: z.string().min(1),
  orderId: z.string().min(1),
});

/**
 * POST /api/loyalty/redeem
 *
 * Reserves a reward instance for redemption on an order (atomic
 * AVAILABLE -> PENDING_REDEMPTION transition). The POS applies the
 * reward discount/free-item to the order in the same checkout flow.
 *
 * Body: { rewardInstanceId, orderId }
 *
 * Requires auth. Roles allowed: ADMIN, BRANCH_MANAGER, CASHIER.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canRedeemRewards(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = redeemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { rewardInstanceId, orderId } = parsed.data;

    // Branch ID for validation comes from the session.
    // CASHIER / BRANCH_MANAGER must have a branchId set.
    const branchId = session.branchId;
    if (!branchId && session.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'No branch assigned to user — cannot redeem rewards' },
        { status: 400 }
      );
    }

    // If the user has no branchId (admin), we skip branch validation in the engine.
    // For non-admins, the engine validates against redeemBranches.
    const result = await redeemReward(
      rewardInstanceId,
      orderId,
      session.userId,
      branchId || ''
    );

    return NextResponse.json({ success: true, redemption: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to redeem reward';
    console.error('[Loyalty] redeem error:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
