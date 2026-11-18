import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session-manager';
import { canViewCustomerLoyalty } from '@/lib/loyalty-permissions';
import { getCustomerProgress } from '@/lib/loyalty-engine';

/**
 * GET /api/loyalty/customer-progress?customerId=...
 *
 * Returns a customer's full loyalty progress across all promotions,
 * including available rewards and legacy loyalty points balance.
 *
 * Requires auth. Roles allowed: ADMIN, BRANCH_MANAGER, CASHIER.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canViewCustomerLoyalty(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json(
        { error: 'Missing required query parameter: customerId' },
        { status: 400 }
      );
    }

    const progress = await getCustomerProgress(customerId);

    return NextResponse.json({ success: true, progress });
  } catch (error) {
    console.error('[Loyalty] customer-progress error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customer loyalty progress' },
      { status: 500 }
    );
  }
}
