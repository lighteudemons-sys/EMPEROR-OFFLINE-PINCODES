import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session-manager';
import { canRedeemRewards } from '@/lib/loyalty-permissions';
import { releaseReward } from '@/lib/loyalty-engine';

const releaseSchema = z.object({
  rewardInstanceId: z.string().min(1),
});

/**
 * POST /api/loyalty/release-reward
 *
 * Releases a reward that was previously reserved for redemption back
 * to AVAILABLE status. Called by the POS when checkout fails or the
 * customer cancels after the reward was reserved.
 *
 * Body: { rewardInstanceId }
 *
 * Requires auth. Only the cashier who reserved the reward can release it
 * (enforced in the engine via `reservedBy = cashierId`).
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
    const parsed = releaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    await releaseReward(parsed.data.rewardInstanceId, session.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to release reward';
    console.error('[Loyalty] release-reward error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
