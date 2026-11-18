import { db } from '@/lib/db';

// ============================================================
// Loyalty Notifications — Phase 7
//
// Emits in-app notifications for loyalty milestones so branch
// staff see them in the existing notification center:
//   - Reward earned (threshold crossed → reward issued)
//   - Tier upgrade (legacy: BRONZE → SILVER → GOLD → PLATINUM)
//   - Reward expiring soon (sweep job)
//
// All notifications use type='LOYALTY_MILESTONE' (already in
// the existing NotificationType enum) and are addressed to the
// customer's home branch. They show up alongside inventory /
// waste / purchase-order notifications in the bell-icon drop-
// down at the top of the POS.
//
// Note: customer-facing notifications (SMS/WhatsApp/email) are
// Phase 7's stretch goal and would route through the same
// OTP SMS adapter built in Phase 5. The in-app notifications
// here are for STAFF — so the cashier can congratulate the
// customer or know to mention it during checkout.
// ============================================================

export interface LoyaltyNotificationPayload {
  customerId: string;
  customerName: string;
  branchId: string | null;
  title: string;
  message: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  entityId?: string;
  entityType?: string;
}

// ============================================================
// Resolve the customer's home branch + name (used by all
// notification helpers below).
// ============================================================
async function loadCustomerContext(customerId: string) {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      branchId: true,
      tier: true,
      loyaltyPoints: true,
    },
  });
  return customer;
}

// ============================================================
// Notify that a customer earned a reward (threshold crossed).
// Called from loyalty-engine.evaluateOrder after each
// THRESHOLD_CONSUMED + LoyaltyRewardInstance pair is created.
// ============================================================
export async function notifyRewardEarned(
  customerId: string,
  promotionId: string,
  promotionName: string,
  rewardInstanceId: string,
  expiresAt: Date | null
): Promise<void> {
  try {
    const customer = await loadCustomerContext(customerId);
    if (!customer || !customer.branchId) return; // No branch → no audience

    const expiryText = expiresAt
      ? ` Valid until ${expiresAt.toLocaleDateString()}.`
      : '';

    await db.notification.create({
      data: {
        branchId: customer.branchId,
        type: 'LOYALTY_MILESTONE',
        title: `Reward earned — ${customer.name}`,
        message: `Earned a reward from "${promotionName}".${expiryText} Mention it at checkout!`,
        priority: 'NORMAL',
        entityId: rewardInstanceId,
        entityType: 'loyalty_reward_instance',
      },
    });
    console.log(
      `[LoyaltyNotif] Reward-earned notification created for customer ${customerId}, promotion ${promotionId}`
    );
  } catch (error) {
    // Don't let notification failure break the order flow.
    console.error('[LoyaltyNotif] notifyRewardEarned failed:', error);
  }
}

// ============================================================
// Notify that a customer's tier was upgraded (legacy system).
// Called from loyalty-utils.awardLoyaltyPoints when the tier
// changes as a result of new points.
// ============================================================
export async function notifyTierUpgrade(
  customerId: string,
  oldTier: string,
  newTier: string
): Promise<void> {
  try {
    if (oldTier === newTier) return;
    const customer = await loadCustomerContext(customerId);
    if (!customer || !customer.branchId) return;

    // Tier rank order — only upgrade direction is celebrated.
    const tierRank: Record<string, number> = {
      BRONZE: 0,
      SILVER: 1,
      GOLD: 2,
      PLATINUM: 3,
      DIAMOND: 4,
    };
    const isUpgrade =
      (tierRank[newTier] ?? 0) > (tierRank[oldTier] ?? 0);
    if (!isUpgrade) return;

    await db.notification.create({
      data: {
        branchId: customer.branchId,
        type: 'LOYALTY_MILESTONE',
        title: `Tier upgrade — ${customer.name}`,
        message: `Upgraded from ${oldTier} to ${newTier}. Congratulate them on their next visit!`,
        priority: 'HIGH',
        entityId: customerId,
        entityType: 'customer_tier',
      },
    });
    console.log(
      `[LoyaltyNotif] Tier-upgrade notification created for customer ${customerId}: ${oldTier} → ${newTier}`
    );
  } catch (error) {
    console.error('[LoyaltyNotif] notifyTierUpgrade failed:', error);
  }
}

// ============================================================
// Sweep: find rewards that will expire within N days and
// create a notification if one doesn't already exist for that
// reward's expiring window.
//
// Idempotency: we tag the notification's entityId with the
// rewardInstanceId and check before creating. The Notification
// model has no unique constraint on entityId, so we manually
// dedupe by querying first.
//
// Returns the count of new notifications created.
// ============================================================
export async function sweepExpiringRewards(
  withinDays: number = 3
): Promise<number> {
  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + withinDays * 86400000);

    // Find AVAILABLE rewards that will expire within the window
    // and haven't already been notified about.
    const expiringRewards = await db.loyaltyRewardInstance.findMany({
      where: {
        status: 'AVAILABLE',
        expiresAt: {
          gte: now,
          lte: horizon,
        },
      },
      select: {
        id: true,
        customerId: true,
        promotionId: true,
        expiresAt: true,
      },
      take: 200, // batch cap
    });

    let created = 0;
    for (const reward of expiringRewards) {
      // Check if a notification already exists for this reward
      const existing = await db.notification.findFirst({
        where: {
          type: 'LOYALTY_MILESTONE',
          entityId: reward.id,
          entityType: 'loyalty_reward_expiring',
        },
        select: { id: true },
      });
      if (existing) continue;

      const customer = await loadCustomerContext(reward.customerId);
      if (!customer || !customer.branchId) continue;

      const daysLeft = Math.ceil(
        (reward.expiresAt!.getTime() - now.getTime()) / 86400000
      );
      const expiryLabel =
        daysLeft <= 1 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;

      await db.notification.create({
        data: {
          branchId: customer.branchId,
          type: 'LOYALTY_MILESTONE',
          title: `Reward expiring ${expiryLabel} — ${customer.name}`,
          message: `Customer has an unclaimed loyalty reward that expires ${expiryLabel}. Remind them at their next visit!`,
          priority: 'HIGH',
          entityId: reward.id,
          entityType: 'loyalty_reward_expiring',
        },
      });
      created++;
    }

    console.log(
      `[LoyaltyNotif] sweepExpiringRewards: ${created} new notifications (of ${expiringRewards.length} candidates)`
    );
    return created;
  } catch (error) {
    console.error('[LoyaltyNotif] sweepExpiringRewards failed:', error);
    return 0;
  }
}
