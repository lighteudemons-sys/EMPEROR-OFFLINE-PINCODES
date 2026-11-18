/**
 * Loyalty Engine — Phase 2 (Emperor Coffee POS)
 *
 * This module is the core of the upgraded loyalty system. It evaluates
 * completed orders against active promotions, issues reward instances when
 * thresholds are crossed, and handles redemption, release, and reversal flows.
 *
 * IMPORTANT: All engine operations are non-blocking — the caller wraps them in
 * try/catch so that order creation, refunds, and voids still succeed even if
 * the loyalty engine fails. See the wiring in:
 *   - src/app/api/orders/route.ts            (evaluateOrder)
 *   - src/app/api/orders/[id]/refund/route.ts (reverseOrder)
 *   - src/app/api/orders/void-item/route.ts   (reverseVoid)
 *
 * All money math uses `Number()` to convert Prisma Decimal to JS number.
 * All stamp math uses `Math.floor()` for PER_AMOUNT / PER_QUANTITY.
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

// ============================================================
// Types (returned to API routes)
// ============================================================

export interface EvaluationResult {
  orderId: string;
  evaluated: boolean;
  enrollmentsAffected: number;
  stampsEarned: number;
  rewardsIssued: number;
  promotionsEvaluated: number;
  skippedReason?: string;
}

export interface RedemptionResult {
  rewardInstanceId: string;
  status: 'PENDING_REDEMPTION';
  rewardType: string;
  rewardValue: number | null;
  rewardProductId: string | null;
  rewardCategoryId: string | null;
  promotionId: string;
  promotionName: string;
  customerId: string;
  expiresAt: Date | null;
  reservedExpiresAt: Date;
}

export interface CustomerProgress {
  customerId: string;
  legacyPoints: number;
  enrollments: Array<{
    id: string;
    promotionId: string;
    promotionName: string;
    isActive: boolean;
    enrolledAt: Date;
    lastEarnedAt: Date | null;
    lastRedeemedAt: Date | null;
    availableStamps: number;
    rewardsClaimed: number;
    stampsRequired: number;
    earningMethod: string;
    earningValue: number;
    overlapRule: string;
    rewardType: string;
    rewardValue: number | null;
    rewardProductId: string | null;
    rewardCategoryId: string | null;
  }>;
  availableRewards: Array<{
    id: string;
    promotionId: string;
    promotionName: string;
    rewardType: string;
    rewardValue: number | null;
    rewardProductId: string | null;
    rewardCategoryId: string | null;
    status: string;
    earnedAt: Date;
    expiresAt: Date | null;
  }>;
}

// ============================================================
// Internal helpers
// ============================================================

interface QualifyingItem {
  orderItemId: string;
  quantity: number;
  subtotal: number;
}

interface PromotionContext {
  promotion: any; // LoyaltyPromotion with relations
  qualifyingItems: QualifyingItem[];
  orderSubtotal: number;
}

/**
 * Build a JSON snapshot of the promotion config for a version record.
 * Captures all the fields that affect earning/rewarding logic.
 */
function buildPromotionConfigSnapshot(promotion: any): Record<string, unknown> {
  return {
    name: promotion.name,
    description: promotion.description,
    earningMethod: promotion.earningMethod,
    earningValue: Number(promotion.earningValue),
    stampsRequired: promotion.stampsRequired,
    maxEarnPerOrder: promotion.maxEarnPerOrder,
    maxEarnPerDay: promotion.maxEarnPerDay,
    rewardType: promotion.rewardType,
    rewardValue: promotion.rewardValue !== null ? Number(promotion.rewardValue) : null,
    rewardProductId: promotion.rewardProductId,
    rewardCategoryId: promotion.rewardCategoryId,
    rewardExpiresInDays: promotion.rewardExpiresInDays,
    minPurchaseAmount:
      promotion.minPurchaseAmount !== null ? Number(promotion.minPurchaseAmount) : null,
    eligibleCustomerTiers: promotion.eligibleCustomerTiers,
    eligibleCustomerTypes: promotion.eligibleCustomerTypes,
    isNewCustomerOnly: promotion.isNewCustomerOnly,
    isExistingCustomerOnly: promotion.isExistingCustomerOnly,
    overlapRule: promotion.overlapRule,
    priority: promotion.priority,
    allowSimultaneousRewards: promotion.allowSimultaneousRewards,
    earnBranches: (promotion.earnBranches || []).map((b: any) => b.branchId),
    redeemBranches: (promotion.redeemBranches || []).map((b: any) => b.branchId),
    productRestrictions: (promotion.productRestrictions || []).map((p: any) => p.menuItemId),
    categoryRestrictions: (promotion.categoryRestrictions || []).map((c: any) => c.categoryId),
  };
}

/**
 * Ensure a version snapshot exists for a promotion. If not, create version 1.
 * Returns the versionId to attach to stamp transactions.
 */
async function ensurePromotionVersion(promotion: any, userId?: string): Promise<string> {
  // Look for the current version (validUntil IS NULL).
  const existing = await db.loyaltyPromotionVersion.findFirst({
    where: { promotionId: promotion.id, validUntil: null },
    orderBy: { versionNumber: 'desc' },
  });

  if (existing) {
    return existing.id;
  }

  // No current version — create version 1.
  const created = await db.loyaltyPromotionVersion.create({
    data: {
      promotionId: promotion.id,
      versionNumber: 1,
      config: buildPromotionConfigSnapshot(promotion),
      createdBy: userId ?? null,
    },
  });

  await db.loyaltyPromotion.update({
    where: { id: promotion.id },
    data: { currentVersion: 1 },
  });

  return created.id;
}

/**
 * Check if a customer is eligible for a promotion based on tier/type/newness.
 */
function isCustomerEligible(promotion: any, customer: any): boolean {
  // Tier check
  if (promotion.eligibleCustomerTiers) {
    const tiers = promotion.eligibleCustomerTiers
      .split(',')
      .map((t: string) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tiers.length > 0 && !tiers.includes((customer.tier || 'BRONZE').toUpperCase())) {
      return false;
    }
  }

  // Customer type check
  if (promotion.eligibleCustomerTypes) {
    const types = promotion.eligibleCustomerTypes
      .split(',')
      .map((t: string) => t.trim().toUpperCase())
      .filter(Boolean);
    if (types.length > 0 && !types.includes((customer.customerType || 'B2C').toUpperCase())) {
      return false;
    }
  }

  // New / existing customer
  const hasPriorOrders = (customer.orderCount ?? 0) > 0;
  if (promotion.isNewCustomerOnly && hasPriorOrders) return false;
  if (promotion.isExistingCustomerOnly && !hasPriorOrders) return false;

  return true;
}

/**
 * Determine which OrderItems qualify for a promotion based on
 * productRestrictions and categoryRestrictions (OR logic).
 * If both lists are empty, ALL items qualify.
 */
function filterQualifyingItems(
  orderItems: any[],
  productIds: Set<string>,
  categoryIds: Set<string>
): QualifyingItem[] {
  if (productIds.size === 0 && categoryIds.size === 0) {
    return orderItems.map((item) => ({
      orderItemId: item.id,
      quantity: item.quantity,
      subtotal: item.subtotal,
    }));
  }

  const qualifying: QualifyingItem[] = [];
  for (const item of orderItems) {
    const inProducts = productIds.has(item.menuItemId);
    const inCategories =
      item.menuItem?.categoryId != null && categoryIds.has(item.menuItem.categoryId);
    if (inProducts || inCategories) {
      qualifying.push({
        orderItemId: item.id,
        quantity: item.quantity,
        subtotal: item.subtotal,
      });
    }
  }
  return qualifying;
}

/**
 * Compute stamps for a single qualifying item given the earning method.
 * Returns null if the method doesn't apply per-item (PER_VISIT).
 */
function computeItemStamps(
  method: string,
  earningValue: number,
  item: QualifyingItem
): number | null {
  switch (method) {
    case 'PER_ITEM':
      return Math.max(1, Math.floor(earningValue));
    case 'PER_QUANTITY':
      return Math.floor(item.quantity * earningValue);
    case 'PER_AMOUNT':
      return Math.floor(item.subtotal * earningValue);
    case 'PER_VISIT':
      return null; // handled separately at order level
    default:
      return null;
  }
}

/**
 * Resolve overlapping promotions on a given set of qualifying items.
 *
 * Algorithm (V5 doc §6):
 *   EXCLUSIVE > PRIORITY > SHARED
 *
 * - If any EXCLUSIVE promotion claims an item, that item is locked to it
 *   (and other promotions are excluded from earning on it).
 * - Among PRIORITY promotions on an item, only the highest priority earns.
 * - SHARED promotions all earn on the item (subject to the above rules).
 */
function resolveOverlaps(
  contexts: PromotionContext[]
): PromotionContext[] {
  // For each item, determine which promotions would earn on it
  // and apply the EXCLUSIVE > PRIORITY > SHARED rule.
  const itemOwners = new Map<string, Set<string>>(); // orderItemId -> set of promotionIds that may earn

  for (const ctx of contexts) {
    for (const item of ctx.qualifyingItems) {
      if (!itemOwners.has(item.orderItemId)) {
        itemOwners.set(item.orderItemId, new Set());
      }
      itemOwners.get(item.orderItemId)!.add(ctx.promotion.id);
    }
  }

  // Build per-item promotions list
  const itemPromotions = new Map<string, PromotionContext[]>();
  for (const [itemId, promotionIds] of itemOwners.entries()) {
    const list: PromotionContext[] = [];
    for (const ctx of contexts) {
      if (promotionIds.has(ctx.promotion.id)) {
        list.push(ctx);
      }
    }
    itemPromotions.set(itemId, list);
  }

  // For each item, decide which promotions actually earn.
  // Build a new set of filtered contexts.
  const filteredContexts = contexts.map((ctx) => {
    const newQualifyingItems: QualifyingItem[] = [];
    for (const item of ctx.qualifyingItems) {
      const list = itemPromotions.get(item.orderItemId) || [];

      // Determine winners for this item.
      const hasExclusive = list.some((c) => c.promotion.overlapRule === 'EXCLUSIVE');
      if (hasExclusive) {
        // Only EXCLUSIVE promotions on this item can earn.
        if (ctx.promotion.overlapRule !== 'EXCLUSIVE') continue;
        // Among multiple EXCLUSIVE promotions on the same item, pick the highest priority.
        const exclusiveList = list.filter((c) => c.promotion.overlapRule === 'EXCLUSIVE');
        const topPriority = Math.max(...exclusiveList.map((c) => c.promotion.priority || 0));
        if ((ctx.promotion.priority || 0) < topPriority) continue;
      } else {
        // No EXCLUSIVE — apply PRIORITY > SHARED.
        const hasPriority = list.some((c) => c.promotion.overlapRule === 'PRIORITY');
        if (hasPriority) {
          if (ctx.promotion.overlapRule !== 'PRIORITY') continue;
          const priorityList = list.filter((c) => c.promotion.overlapRule === 'PRIORITY');
          const topPriority = Math.max(...priorityList.map((c) => c.promotion.priority || 0));
          if ((ctx.promotion.priority || 0) < topPriority) continue;
        }
        // SHARED: all shared promotions earn.
      }

      newQualifyingItems.push(item);
    }
    return { ...ctx, qualifyingItems: newQualifyingItems };
  });

  return filteredContexts;
}

/**
 * Count stamps earned so far today for a customer/promotion pair.
 * Used to enforce maxEarnPerDay cap.
 */
async function getStampsEarnedToday(
  tx: Prisma.TransactionClient,
  customerId: string,
  promotionId: string
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const result = await tx.loyaltyStampTransaction.aggregate({
    where: {
      customerId,
      promotionId,
      type: 'EARNED',
      createdAt: { gte: startOfDay },
    },
    _sum: { stamps: true },
  });
  return result._sum.stamps ?? 0;
}

/**
 * Helper: compute expiry date for a new reward instance.
 */
function computeRewardExpiry(promotion: any, settings: any): Date | null {
  const days =
    promotion.rewardExpiresInDays ?? settings?.defaultRewardExpiryDays ?? null;
  if (days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// ============================================================
// evaluateOrder
// ============================================================

export async function evaluateOrder(orderId: string): Promise<EvaluationResult> {
  // Load order with items, customer, branch
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          menuItem: { select: { id: true, categoryId: true } },
        },
      },
      customer: true,
      branch: true,
    },
  });

  if (!order) {
    return {
      orderId,
      evaluated: false,
      enrollmentsAffected: 0,
      stampsEarned: 0,
      rewardsIssued: 0,
      promotionsEvaluated: 0,
      skippedReason: 'Order not found',
    };
  }

  if (!order.customerId || !order.customer) {
    return {
      orderId,
      evaluated: false,
      enrollmentsAffected: 0,
      stampsEarned: 0,
      rewardsIssued: 0,
      promotionsEvaluated: 0,
      skippedReason: 'No customer on order',
    };
  }

  if (order.isRefunded) {
    return {
      orderId,
      evaluated: false,
      enrollmentsAffected: 0,
      stampsEarned: 0,
      rewardsIssued: 0,
      promotionsEvaluated: 0,
      skippedReason: 'Order is refunded',
    };
  }

  // Load active promotions
  const now = new Date();
  const promotions = await db.loyaltyPromotion.findMany({
    where: {
      status: 'ACTIVE',
      isActive: true,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    include: {
      earnBranches: true,
      redeemBranches: true,
      productRestrictions: true,
      categoryRestrictions: true,
    },
    orderBy: { priority: 'desc' },
  });

  if (promotions.length === 0) {
    return {
      orderId,
      evaluated: true,
      enrollmentsAffected: 0,
      stampsEarned: 0,
      rewardsIssued: 0,
      promotionsEvaluated: 0,
    };
  }

  // Filter by branch + customer eligibility
  const eligibleContexts: PromotionContext[] = [];
  for (const promotion of promotions) {
    // Branch filter: empty earnBranches = all branches
    if (promotion.earnBranches.length > 0) {
      const branchIds = promotion.earnBranches.map((b: any) => b.branchId);
      if (!branchIds.includes(order.branchId)) continue;
    }

    // Customer eligibility
    if (!isCustomerEligible(promotion, order.customer)) continue;

    // minPurchaseAmount check (against full order subtotal)
    if (promotion.minPurchaseAmount !== null) {
      if (Number(order.subtotal) < Number(promotion.minPurchaseAmount)) continue;
    }

    // Determine qualifying items
    const productIds = new Set(promotion.productRestrictions.map((p: any) => p.menuItemId));
    const categoryIds = new Set(promotion.categoryRestrictions.map((c: any) => c.categoryId));
    const qualifyingItems = filterQualifyingItems(order.items, productIds, categoryIds);

    if (qualifyingItems.length === 0 && promotion.earningMethod !== 'PER_VISIT') {
      // PER_VISIT can earn on the order even if no specific items qualify
      // (since it's visit-level, not item-level).
      // For other methods, no qualifying items means no earning.
      // However, if no product/category restrictions exist, ALL items qualify
      // (already handled by filterQualifyingItems). So this means order has items
      // but none match the restrictions.
      continue;
    }

    eligibleContexts.push({ promotion, qualifyingItems, orderSubtotal: Number(order.subtotal) });
  }

  if (eligibleContexts.length === 0) {
    return {
      orderId,
      evaluated: true,
      enrollmentsAffected: 0,
      stampsEarned: 0,
      rewardsIssued: 0,
      promotionsEvaluated: 0,
    };
  }

  // Resolve overlaps
  const resolvedContexts = resolveOverlaps(eligibleContexts).filter(
    (ctx) => ctx.qualifyingItems.length > 0
  );

  // Load global settings (for reward expiry defaults)
  const settings = await db.loyaltyGlobalSettings.findUnique({
    where: { id: 'singleton' },
  });

  let totalStampsEarned = 0;
  let totalRewardsIssued = 0;
  const enrollmentsAffectedSet = new Set<string>();

  // Process each promotion in its own transaction (atomic issuance).
  for (const ctx of resolvedContexts) {
    const promotion = ctx.promotion;
    const earningValue = Number(promotion.earningValue);
    const stampsRequired = promotion.stampsRequired;
    const maxPerOrder = promotion.maxEarnPerOrder ?? null;
    const maxPerDay = promotion.maxEarnPerDay ?? null;

    // Compute stamps to earn for this promotion
    let stampsToEarn = 0;
    const perItemStamps: Array<{ orderItemId: string | null; eligibleQuantity: number; stamps: number }> = [];

    if (promotion.earningMethod === 'PER_VISIT') {
      // Single stamp transaction at order level (orderItemId=null)
      const visitStamps = Math.max(1, Math.floor(earningValue));
      perItemStamps.push({ orderItemId: null, eligibleQuantity: 1, stamps: visitStamps });
      stampsToEarn = visitStamps;
    } else {
      for (const item of ctx.qualifyingItems) {
        const itemStamps = computeItemStamps(promotion.earningMethod, earningValue, item);
        if (itemStamps == null) continue;
        perItemStamps.push({
          orderItemId: item.orderItemId,
          eligibleQuantity: item.quantity,
          stamps: itemStamps,
        });
        stampsToEarn += itemStamps;
      }
    }

    if (stampsToEarn <= 0) continue;

    // Apply maxEarnPerOrder cap
    if (maxPerOrder != null && stampsToEarn > maxPerOrder) {
      const scale = maxPerOrder / stampsToEarn;
      // Scale down proportionally, integer.
      let remaining = maxPerOrder;
      for (const entry of perItemStamps) {
        const scaled = Math.floor(entry.stamps * scale);
        entry.stamps = Math.min(scaled, remaining);
        remaining -= entry.stamps;
        if (remaining <= 0) entry.stamps = 0;
      }
      stampsToEarn = perItemStamps.reduce((s, e) => s + e.stamps, 0);
    }

    if (stampsToEarn <= 0) continue;

    // Apply maxEarnPerDay cap (need to check actual DB)
    if (maxPerDay != null) {
      const earnedToday = await getStampsEarnedToday(db, order.customerId, promotion.id);
      const remaining = Math.max(0, maxPerDay - earnedToday);
      if (stampsToEarn > remaining) {
        const scale = remaining > 0 ? remaining / stampsToEarn : 0;
        let alloc = remaining;
        for (const entry of perItemStamps) {
          if (alloc <= 0) {
            entry.stamps = 0;
            continue;
          }
          const scaled = Math.floor(entry.stamps * scale);
          entry.stamps = Math.min(scaled, alloc);
          alloc -= entry.stamps;
        }
        stampsToEarn = perItemStamps.reduce((s, e) => s + e.stamps, 0);
      }
    }

    if (stampsToEarn <= 0) continue;

    // Ensure promotion version exists
    const versionId = await ensurePromotionVersion(promotion, order.cashierId);

    // Execute atomic issuance: lock enrollment, create EARNED txns, issue rewards.
    const issuance = await db.$transaction(async (tx) => {
      // Find or create enrollment (with SELECT FOR UPDATE)
      let enrollment = await tx.customerPromotionEnrollment.findUnique({
        where: {
          customerId_promotionId: {
            customerId: order.customerId!,
            promotionId: promotion.id,
          },
        },
      });

      if (!enrollment) {
        // Auto-enroll
        enrollment = await tx.customerPromotionEnrollment.create({
          data: {
            customerId: order.customerId!,
            promotionId: promotion.id,
            isActive: true,
          },
        });
      }

      // Lock the enrollment row (PostgreSQL SELECT ... FOR UPDATE)
      // Cast to any because Prisma's $queryRaw typing is awkward here.
      const locked = await (tx as any).$queryRaw`
        SELECT id FROM "CustomerPromotionEnrollment"
        WHERE id = ${enrollment.id}
        FOR UPDATE
      `;
      if (!Array.isArray(locked) || locked.length === 0) {
        throw new Error(`Enrollment ${enrollment.id} not found during FOR UPDATE`);
      }

      let currentStamps = enrollment.availableStamps;
      const issuedRewards: { id: string; expiresAt: Date | null }[] = [];

      for (const entry of perItemStamps) {
        if (entry.stamps <= 0) continue;

        // Create EARNED transaction
        await tx.loyaltyStampTransaction.create({
          data: {
            enrollmentId: enrollment.id,
            customerId: order.customerId!,
            promotionId: promotion.id,
            type: 'EARNED',
            stamps: entry.stamps,
            orderId: order.id,
            orderItemId: entry.orderItemId ?? null,
            eligibleQuantity: entry.eligibleQuantity ?? null,
            promotionVersionId: versionId,
            createdBy: order.cashierId,
          },
        });

        currentStamps += entry.stamps;

        // Threshold check
        while (currentStamps >= stampsRequired) {
          // Issue the reward instance FIRST so we can link the THRESHOLD_CONSUMED txn to it.
          const rewardExpiry = computeRewardExpiry(promotion, settings);

          const rewardInstance = await tx.loyaltyRewardInstance.create({
            data: {
              enrollmentId: enrollment.id,
              customerId: order.customerId!,
              promotionId: promotion.id,
              rewardType: promotion.rewardType,
              rewardValue: promotion.rewardValue,
              rewardProductId: promotion.rewardProductId,
              rewardCategoryId: promotion.rewardCategoryId,
              promotionVersionId: versionId,
              status: 'AVAILABLE',
              expiresAt: rewardExpiry,
            },
          });

          // Now create the THRESHOLD_CONSUMED txn, linked to the reward instance.
          await tx.loyaltyStampTransaction.create({
            data: {
              enrollmentId: enrollment.id,
              customerId: order.customerId!,
              promotionId: promotion.id,
              type: 'THRESHOLD_CONSUMED',
              stamps: -stampsRequired,
              orderId: order.id,
              rewardInstanceId: rewardInstance.id,
              promotionVersionId: versionId,
              createdBy: order.cashierId,
            },
          });

          currentStamps -= stampsRequired;
          issuedRewards.push({ id: rewardInstance.id, expiresAt: rewardExpiry });
        }
      }

      // Update enrollment cache
      await tx.customerPromotionEnrollment.update({
        where: { id: enrollment.id },
        data: {
          availableStamps: currentStamps,
          lastEarnedAt: now,
          rewardsClaimed: { increment: issuedRewards.length },
        },
      });

      return { stampsEarned: perItemStamps.reduce((s, e) => s + e.stamps, 0), rewardsIssued: issuedRewards.length, enrollmentId: enrollment.id };
    });

    totalStampsEarned += issuance.stampsEarned;
    totalRewardsIssued += issuance.rewardsIssued;
    enrollmentsAffectedSet.add(issuance.enrollmentId);
  }

  return {
    orderId,
    evaluated: true,
    enrollmentsAffected: enrollmentsAffectedSet.size,
    stampsEarned: totalStampsEarned,
    rewardsIssued: totalRewardsIssued,
    promotionsEvaluated: resolvedContexts.length,
  };
}

// ============================================================
// redeemReward
// ============================================================

export async function redeemReward(
  rewardInstanceId: string,
  orderId: string,
  cashierId: string,
  branchId: string
): Promise<RedemptionResult> {
  // Atomic reservation: AVAILABLE → PENDING_REDEMPTION
  // Use raw SQL to perform an atomic conditional UPDATE.
  const updateResult: any = await db.$executeRaw`
    UPDATE "LoyaltyRewardInstance"
    SET
      status = 'PENDING_REDEMPTION',
      "reservedAt" = NOW(),
      "reservedBy" = ${cashierId},
      "reservedOrderId" = ${orderId},
      "reservedBranchId" = ${branchId},
      "reservedExpiresAt" = NOW() + INTERVAL '15 minutes',
      "updatedAt" = NOW()
    WHERE id = ${rewardInstanceId}
      AND status = 'AVAILABLE'
  `;

  if (updateResult === 0) {
    throw new Error('Reward is no longer available');
  }

  // Load the reward instance with promotion details for branch validation.
  const reward = await db.loyaltyRewardInstance.findUnique({
    where: { id: rewardInstanceId },
    include: {
      promotion: {
        include: { redeemBranches: true },
      },
    },
  });

  if (!reward) {
    throw new Error('Reward instance not found after reservation');
  }

  // Validate branch: if redeemBranches is non-empty, this branch must be allowed.
  if (reward.promotion.redeemBranches.length > 0) {
    const allowed = reward.promotion.redeemBranches.some((b: any) => b.branchId === branchId);
    if (!allowed) {
      // Roll back the reservation — branch not authorized to redeem.
      await db.$executeRaw`
        UPDATE "LoyaltyRewardInstance"
        SET
          status = 'AVAILABLE',
          "reservedAt" = NULL,
          "reservedBy" = NULL,
          "reservedOrderId" = NULL,
          "reservedBranchId" = NULL,
          "reservedExpiresAt" = NULL,
          "updatedAt" = NOW()
        WHERE id = ${rewardInstanceId}
          AND status = 'PENDING_REDEMPTION'
          AND "reservedBy" = ${cashierId}
      `;
      throw new Error('This branch is not authorized to redeem rewards from this promotion');
    }
  }

  // Create an audit REWARD_REDEEMED stamp transaction (zero stamps — audit only)
  await db.loyaltyStampTransaction.create({
    data: {
      enrollmentId: reward.enrollmentId,
      customerId: reward.customerId,
      promotionId: reward.promotionId,
      type: 'REWARD_REDEEMED',
      stamps: 0,
      orderId,
      rewardInstanceId: reward.id,
      promotionVersionId: reward.promotionVersionId,
      createdBy: cashierId,
    },
  });

  // Mark the reward as redeemed (final state).
  await db.loyaltyRewardInstance.update({
    where: { id: rewardInstanceId },
    data: {
      status: 'REDEEMED',
      redeemedAt: new Date(),
      redeemedOrderId: orderId,
      redeemedBy: cashierId,
      reservedAt: null,
      reservedBy: null,
      reservedOrderId: null,
      reservedBranchId: null,
      reservedExpiresAt: null,
    },
  });

  // Update enrollment lastRedeemedAt
  await db.customerPromotionEnrollment.update({
    where: { id: reward.enrollmentId },
    data: { lastRedeemedAt: new Date() },
  });

  // Compute reservedExpiresAt (15 min from now) for the response.
  const reservedExpiresAt = new Date();
  reservedExpiresAt.setMinutes(reservedExpiresAt.getMinutes() + 15);

  return {
    rewardInstanceId: reward.id,
    status: 'PENDING_REDEMPTION', // logical state when returned (caller will apply)
    rewardType: reward.rewardType,
    rewardValue: reward.rewardValue !== null ? Number(reward.rewardValue) : null,
    rewardProductId: reward.rewardProductId,
    rewardCategoryId: reward.rewardCategoryId,
    promotionId: reward.promotionId,
    promotionName: reward.promotion.name,
    customerId: reward.customerId,
    expiresAt: reward.expiresAt,
    reservedExpiresAt,
  };
}

// ============================================================
// releaseReward
// ============================================================

export async function releaseReward(
  rewardInstanceId: string,
  cashierId: string
): Promise<void> {
  await db.$executeRaw`
    UPDATE "LoyaltyRewardInstance"
    SET
      status = 'AVAILABLE',
      "reservedAt" = NULL,
      "reservedBy" = NULL,
      "reservedOrderId" = NULL,
      "reservedBranchId" = NULL,
      "reservedExpiresAt" = NULL,
      "updatedAt" = NOW()
    WHERE id = ${rewardInstanceId}
      AND status = 'PENDING_REDEMPTION'
      AND "reservedBy" = ${cashierId}
  `;
}

// ============================================================
// getCustomerProgress
// ============================================================

export async function getCustomerProgress(customerId: string): Promise<CustomerProgress> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, loyaltyPoints: true, tier: true },
  });

  if (!customer) {
    return {
      customerId,
      legacyPoints: 0,
      enrollments: [],
      availableRewards: [],
    };
  }

  const enrollments = await db.customerPromotionEnrollment.findMany({
    where: { customerId, isActive: true },
    include: {
      promotion: true,
    },
  });

  const enrollmentResult: CustomerProgress['enrollments'] = [];

  for (const enrollment of enrollments) {
    // Compute availableStamps from SUM of stamp transactions (source of truth)
    const sumResult = await db.loyaltyStampTransaction.aggregate({
      where: { enrollmentId: enrollment.id },
      _sum: { stamps: true },
    });
    const availableStamps = sumResult._sum.stamps ?? 0;

    enrollmentResult.push({
      id: enrollment.id,
      promotionId: enrollment.promotionId,
      promotionName: enrollment.promotion.name,
      isActive: enrollment.isActive,
      enrolledAt: enrollment.enrolledAt,
      lastEarnedAt: enrollment.lastEarnedAt,
      lastRedeemedAt: enrollment.lastRedeemedAt,
      availableStamps,
      rewardsClaimed: enrollment.rewardsClaimed,
      stampsRequired: enrollment.promotion.stampsRequired,
      earningMethod: enrollment.promotion.earningMethod,
      earningValue: Number(enrollment.promotion.earningValue),
      overlapRule: enrollment.promotion.overlapRule,
      rewardType: enrollment.promotion.rewardType,
      rewardValue:
        enrollment.promotion.rewardValue !== null
          ? Number(enrollment.promotion.rewardValue)
          : null,
      rewardProductId: enrollment.promotion.rewardProductId,
      rewardCategoryId: enrollment.promotion.rewardCategoryId,
    });
  }

  // Load available + pending rewards
  const availableRewards = await db.loyaltyRewardInstance.findMany({
    where: {
      customerId,
      status: { in: ['AVAILABLE', 'PENDING_REDEMPTION'] },
    },
    include: { promotion: { select: { name: true } } },
    orderBy: { earnedAt: 'desc' },
  });

  return {
    customerId,
    legacyPoints: customer.loyaltyPoints,
    enrollments: enrollmentResult,
    availableRewards: availableRewards.map((r) => ({
      id: r.id,
      promotionId: r.promotionId,
      promotionName: r.promotion.name,
      rewardType: r.rewardType,
      rewardValue: r.rewardValue !== null ? Number(r.rewardValue) : null,
      rewardProductId: r.rewardProductId,
      rewardCategoryId: r.rewardCategoryId,
      status: r.status,
      earnedAt: r.earnedAt,
      expiresAt: r.expiresAt,
    })),
  };
}

// ============================================================
// reverseOrder
// ============================================================

export async function reverseOrder(orderId: string, userId: string): Promise<void> {
  // Find all EARNED transactions for this order
  const earnedTxns = await db.loyaltyStampTransaction.findMany({
    where: {
      orderId,
      type: 'EARNED',
    },
  });

  if (earnedTxns.length === 0) return;

  for (const earned of earnedTxns) {
    // Check if already reversed (full order refund: voidedItemId IS NULL)
    const existingReversal = await db.loyaltyStampTransaction.findFirst({
      where: {
        reversesTransactionId: earned.id,
        type: 'REFUND_REVERSED',
        voidedItemId: null,
      },
    });
    if (existingReversal) continue;

    await db.$transaction(async (tx) => {
      // Lock the enrollment row
      await (tx as any).$queryRaw`
        SELECT id FROM "CustomerPromotionEnrollment"
        WHERE id = ${earned.enrollmentId}
        FOR UPDATE
      `;

      const enrollment = await tx.customerPromotionEnrollment.findUnique({
        where: { id: earned.enrollmentId },
      });
      if (!enrollment) return;

      // Create REFUND_REVERSED transaction
      await tx.loyaltyStampTransaction.create({
        data: {
          enrollmentId: earned.enrollmentId,
          customerId: earned.customerId,
          promotionId: earned.promotionId,
          type: 'REFUND_REVERSED',
          stamps: -earned.stamps,
          orderId,
          orderItemId: earned.orderItemId,
          promotionVersionId: earned.promotionVersionId,
          reversesTransactionId: earned.id,
          refundOrderId: orderId,
          createdBy: userId,
        },
      });

      const newAvailableStamps = enrollment.availableStamps - earned.stamps;

      // Update enrollment cache
      await tx.customerPromotionEnrollment.update({
        where: { id: earned.enrollmentId },
        data: { availableStamps: newAvailableStamps },
      });

      // If availableStamps dropped below 0, expire the most recently issued AVAILABLE reward.
      if (newAvailableStamps < 0) {
        const availableReward = await tx.loyaltyRewardInstance.findFirst({
          where: {
            enrollmentId: earned.enrollmentId,
            status: 'AVAILABLE',
          },
          orderBy: { earnedAt: 'desc' },
        });

        if (availableReward) {
          await tx.loyaltyRewardInstance.update({
            where: { id: availableReward.id },
            data: { status: 'EXPIRED', updatedAt: new Date() },
          });

          // Audit transaction
          await tx.loyaltyStampTransaction.create({
            data: {
              enrollmentId: earned.enrollmentId,
              customerId: earned.customerId,
              promotionId: earned.promotionId,
              type: 'REWARD_EXPIRED',
              stamps: 0,
              orderId,
              rewardInstanceId: availableReward.id,
              promotionVersionId: earned.promotionVersionId,
              createdBy: userId,
              reason: 'Expired due to refund reversal',
            },
          });
        }
      }
    });
  }
}

// ============================================================
// reverseVoid
// ============================================================

export async function reverseVoid(
  orderItemId: string,
  voidedItemId: string | null,
  userId: string
): Promise<void> {
  // Load the order item to get the voided subtotal & quantity (if needed).
  const orderItem = await db.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: true },
  });

  if (!orderItem) return;

  // Find all EARNED transactions for this orderItem
  const earnedTxns = await db.loyaltyStampTransaction.findMany({
    where: {
      orderItemId,
      type: 'EARNED',
    },
    include: { promotion: true },
  });

  if (earnedTxns.length === 0) return;

  // For each EARNED transaction, calculate reversal amount based on earning method.
  for (const earned of earnedTxns) {
    const method = earned.promotion.earningMethod;
    const earningValue = Number(earned.promotion.earningValue);

    // PER_VISIT: visit-level earning — no item-level reversal.
    if (method === 'PER_VISIT') continue;

    // Determine the voided quantity & subtotal.
    // If voidedItemId is provided, load it to get the actual voided amounts.
    let voidedQuantity = 0;
    let voidedSubtotal = 0;

    if (voidedItemId) {
      const voidedItem = await db.voidedItem.findUnique({
        where: { id: voidedItemId },
      });
      if (voidedItem) {
        voidedQuantity = voidedItem.voidedQuantity;
        voidedSubtotal = voidedItem.voidedSubtotal;
      }
    } else {
      // Full void — entire OrderItem was voided.
      // By the time reverseVoid runs, the OrderItem has already had its
      // quantity and subtotal zeroed out by the void transaction. We
      // reconstruct the original values from the EARNED txn's
      // eligibleQuantity and the OrderItem's (unchanged) unitPrice.
      const originalQty = earned.eligibleQuantity ?? orderItem.quantity ?? 0;
      voidedQuantity = originalQty;
      voidedSubtotal = orderItem.unitPrice != null ? orderItem.unitPrice * originalQty : 0;
    }

    let reversalAmount = 0;
    switch (method) {
      case 'PER_ITEM':
        // Full OrderItem line was voided — reverse the entire EARNED amount.
        reversalAmount = earned.stamps;
        break;
      case 'PER_QUANTITY':
        reversalAmount = Math.floor(voidedQuantity * earningValue);
        break;
      case 'PER_AMOUNT':
        reversalAmount = Math.floor(voidedSubtotal * earningValue);
        break;
      default:
        continue;
    }

    if (reversalAmount <= 0) continue;

    // Check if a REFUND_REVERSED already exists for this (voidedItemId, promotionId).
    // If voidedItemId is null (full void), use reversesTransactionId instead.
    const existingReversal = await db.loyaltyStampTransaction.findFirst({
      where: voidedItemId
        ? {
            voidedItemId,
            promotionId: earned.promotionId,
            type: 'REFUND_REVERSED',
          }
        : {
            reversesTransactionId: earned.id,
            type: 'REFUND_REVERSED',
          },
    });
    if (existingReversal) continue;

    await db.$transaction(async (tx) => {
      // Lock enrollment
      await (tx as any).$queryRaw`
        SELECT id FROM "CustomerPromotionEnrollment"
        WHERE id = ${earned.enrollmentId}
        FOR UPDATE
      `;

      const enrollment = await tx.customerPromotionEnrollment.findUnique({
        where: { id: earned.enrollmentId },
      });
      if (!enrollment) return;

      await tx.loyaltyStampTransaction.create({
        data: {
          enrollmentId: earned.enrollmentId,
          customerId: earned.customerId,
          promotionId: earned.promotionId,
          type: 'REFUND_REVERSED',
          stamps: -reversalAmount,
          orderId: orderItem.orderId,
          orderItemId: earned.orderItemId,
          voidedItemId: voidedItemId,
          eligibleQuantity: voidedQuantity || null,
          promotionVersionId: earned.promotionVersionId,
          reversesTransactionId: earned.id,
          createdBy: userId,
          reason: `Voided item reversal (${method})`,
        },
      });

      const newAvailableStamps = enrollment.availableStamps - reversalAmount;
      await tx.customerPromotionEnrollment.update({
        where: { id: earned.enrollmentId },
        data: { availableStamps: newAvailableStamps },
      });

      // If availableStamps < 0, expire the most recently issued AVAILABLE reward.
      if (newAvailableStamps < 0) {
        const availableReward = await tx.loyaltyRewardInstance.findFirst({
          where: {
            enrollmentId: earned.enrollmentId,
            status: 'AVAILABLE',
          },
          orderBy: { earnedAt: 'desc' },
        });
        if (availableReward) {
          await tx.loyaltyRewardInstance.update({
            where: { id: availableReward.id },
            data: { status: 'EXPIRED', updatedAt: new Date() },
          });
          await tx.loyaltyStampTransaction.create({
            data: {
              enrollmentId: earned.enrollmentId,
              customerId: earned.customerId,
              promotionId: earned.promotionId,
              type: 'REWARD_EXPIRED',
              stamps: 0,
              orderId: orderItem.orderId,
              orderItemId: earned.orderItemId,
              rewardInstanceId: availableReward.id,
              promotionVersionId: earned.promotionVersionId,
              createdBy: userId,
              reason: 'Expired due to void reversal',
            },
          });
        }
      }
    });
  }
}
