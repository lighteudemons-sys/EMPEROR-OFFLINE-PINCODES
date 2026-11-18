// Local Loyalty Manager for Offline Operations
// Handles loyalty point operations when offline
//
// ============================================================
// Phase 6 — offline model for the new stamp-based loyalty system
// ============================================================
// The new (Phase 2+) loyalty system is SERVER-SIDE ONLY for
// committed state. Stamps are awarded/reversed by the loyalty
// engine as a side-effect of order creation, refund, and void —
// never by the client writing directly to LoyaltyStampTransaction.
//
// Offline behavior:
//   - Customer places an order offline → order is queued in the
//     IndexedDB offline queue (existing behavior).
//   - The order syncs up via /api/sync/batch-push on reconnect.
//   - The server's order-create flow calls the loyalty engine,
//     which evaluates the promotion version snapshot and writes
//     EARNED / THRESHOLD_CONSUMED / REWARD_REDEEMED rows in the
//     same transaction as the order.
//   - The client's LoyaltyPanel re-fetches /api/loyalty/
//     customer-progress after the sync completes to see the
//     updated stamp counts and any newly-issued rewards.
//
// What this module provides for the new system:
//   - previewStampsForOrder(): computes how many stamps WOULD be
//     earned for a candidate order, using the locally-cached
//     promotion configs from /api/sync/pull. This lets the POS
//     show a "you'll earn N stamps" preview in the cart BEFORE
//     the order is committed — without a network round-trip.
//
// What this module still provides for the LEGACY system:
//   - awardLoyaltyPointsOffline() / redeemLoyaltyPointsOffline()
//     — these queue legacy LoyaltyTransaction rows for sync.
//     The legacy system runs in parallel with the new system
//     (legacyEarningEnabled flag controls whether new orders
//     also award legacy points).
// ============================================================

import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';

const storage = getIndexedDBStorage();

export interface LoyaltyPointsResult {
  success: boolean;
  pointsAwarded: number;
  newBalance: number;
  error?: string;
}

// ============================================================
// NEW SYSTEM — offline stamp preview
// ============================================================

export interface PreviewOrderItem {
  menuItemId: string;
  categoryId?: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface PromotionPreviewConfig {
  id: string;
  name: string;
  earningMethod: 'PER_VISIT' | 'PER_ITEM' | 'PER_QUANTITY' | 'PER_AMOUNT';
  earningValue: string | number;
  stampsRequired: number;
  maxEarnPerOrder: number | null;
  minPurchaseAmount: string | number | null;
  // Restrictions
  productRestrictions?: { menuItemId: string }[];
  categoryRestrictions?: { categoryId: string }[];
  // Overlap
  overlapRule: 'EXCLUSIVE' | 'SHARED' | 'PRIORITY';
  priority: number;
}

export interface StampPreviewResult {
  promotionId: string;
  promotionName: string;
  stampsToEarn: number;
  earningMethod: string;
  notes?: string;
}

/**
 * Preview how many stamps a candidate order would earn across
 * all locally-cached active promotions.
 *
 * This is a CLIENT-SIDE PREVIEW only — the server's loyalty
 * engine is the source of truth. The actual stamps awarded may
 * differ if the promotion config changed between this preview
 * and the order-sync commit (the engine uses the version
 * snapshot at sync time, which may be newer than what the client
 * has cached).
 *
 * The overlap resolution here is a SIMPLIFIED version of the
 * server's algorithm (V5 §6). It handles the common case
 * (single qualifying promotion per item) correctly and falls
 * back to "all SHARED promotions earn" for the multi-promotion
 * case. For full EXCLUSIVE/PRIORITY semantics, the server's
 * evaluation always wins.
 *
 * @param items The order items being previewed
 * @param promotions Locally-cached promotion configs (from sync pull)
 */
export function previewStampsForOrder(
  items: PreviewOrderItem[],
  promotions: PromotionPreviewConfig[]
): StampPreviewResult[] {
  if (!items.length || !promotions.length) return [];

  const results: StampPreviewResult[] = [];

  for (const promo of promotions) {
    // Determine which items qualify for this promotion
    const qualifyingItems = items.filter((item) => itemQualifiesForPromotion(item, promo));
    if (qualifyingItems.length === 0) continue;

    // Check minimum purchase amount
    if (promo.minPurchaseAmount != null && promo.minPurchaseAmount !== '') {
      const minAmount = Number(promo.minPurchaseAmount);
      const orderSubtotal = items.reduce((s, i) => s + i.subtotal, 0);
      if (orderSubtotal < minAmount) continue;
    }

    const earningValue = Number(promo.earningValue) || 0;
    if (earningValue <= 0) continue;

    let stamps = 0;
    let capped = false;

    switch (promo.earningMethod) {
      case 'PER_VISIT':
        // Once per order, regardless of how many qualifying items
        stamps = earningValue;
        break;
      case 'PER_ITEM':
        // Once per qualifying OrderItem line (not per quantity)
        stamps = qualifyingItems.length * earningValue;
        break;
      case 'PER_QUANTITY':
        // Once per unit
        stamps = qualifyingItems.reduce((s, i) => s + i.quantity, 0) * earningValue;
        break;
      case 'PER_AMOUNT':
        // Per OrderItem: floor(subtotal × earningValue), then sum.
        // Rounding is per-line, never on the order total (V5 §1.2).
        stamps = qualifyingItems.reduce(
          (s, i) => s + Math.floor(i.subtotal * earningValue),
          0
        );
        break;
    }

    // Apply per-order cap
    if (promo.maxEarnPerOrder != null && stamps > promo.maxEarnPerOrder) {
      stamps = promo.maxEarnPerOrder;
      capped = true;
    }

    if (stamps > 0) {
      results.push({
        promotionId: promo.id,
        promotionName: promo.name,
        stampsToEarn: Math.floor(stamps),
        earningMethod: promo.earningMethod,
        notes: capped ? `capped at ${promo.maxEarnPerOrder}/order` : undefined,
      });
    }
  }

  // NOTE: This preview does NOT enforce EXCLUSIVE overlap resolution
  // (V5 §6). The server's engine will pick the correct winner at
  // commit time. Showing multiple promotions earning in the preview
  // is acceptable — it tells the customer "this item is eligible
  // for these promotions" — and the actual award may collapse to
  // one if EXCLUSIVE wins.

  return results;
}

function itemQualifiesForPromotion(
  item: PreviewOrderItem,
  promo: PromotionPreviewConfig
): boolean {
  const productIds = promo.productRestrictions?.map((p) => p.menuItemId) || [];
  const categoryIds = promo.categoryRestrictions?.map((c) => c.categoryId) || [];

  // No restrictions = all items qualify
  if (productIds.length === 0 && categoryIds.length === 0) return true;

  // Product restriction takes precedence
  if (productIds.length > 0) {
    return productIds.includes(item.menuItemId);
  }

  // Category restriction
  if (categoryIds.length > 0) {
    return item.categoryId ? categoryIds.includes(item.categoryId) : false;
  }

  return true;
}

// ============================================================
// LEGACY SYSTEM — offline award/redeem (unchanged)
// ============================================================

/**
 * Award loyalty points to a customer for an order (offline mode)
 * This function stores the operation locally and will sync when online
 */
export async function awardLoyaltyPointsOffline(
  customerId: string,
  orderId: string,
  amount: number,
  pointsPerCurrency: number = 1
): Promise<LoyaltyPointsResult> {
  try {
    // Calculate points to award
    const pointsToAward = Math.floor(amount * pointsPerCurrency);

    // Store the operation in IndexedDB for later sync
    if (typeof window !== 'undefined') {
      const pendingOperations = await storage.getJSON<any[]>(
        'pendingLoyaltyOperations'
      ) || [];

      pendingOperations.push({
        id: `loyalty-${Date.now()}`,
        customerId,
        orderId,
        pointsAwarded: pointsToAward,
        timestamp: new Date().toISOString(),
        operation: 'AWARD_POINTS',
        synced: false,
      });

      await storage.setJSON(
        'pendingLoyaltyOperations',
        pendingOperations
      );

      console.log(
        `[LocalLoyalty] Awarded ${pointsToAward} points to customer ${customerId} for order ${orderId}`
      );
    }

    return {
      success: true,
      pointsAwarded: pointsToAward,
      newBalance: pointsToAward, // This would be updated from server
    };
  } catch (error: any) {
    console.error('[LocalLoyalty] Error awarding points:', error);
    return {
      success: false,
      pointsAwarded: 0,
      newBalance: 0,
      error: error.message,
    };
  }
}

/**
 * Redeem loyalty points for a discount (offline mode)
 */
export async function redeemLoyaltyPointsOffline(
  customerId: string,
  pointsToRedeem: number,
  orderId: string
): Promise<LoyaltyPointsResult> {
  try {
    // Store the operation in IndexedDB for later sync
    if (typeof window !== 'undefined') {
      const pendingOperations = await storage.getJSON<any[]>(
        'pendingLoyaltyOperations'
      ) || [];

      pendingOperations.push({
        id: `loyalty-${Date.now()}`,
        customerId,
        orderId,
        pointsRedeemed: pointsToRedeem,
        timestamp: new Date().toISOString(),
        operation: 'REDEEM_POINTS',
        synced: false,
      });

      await storage.setJSON(
        'pendingLoyaltyOperations',
        pendingOperations
      );

      console.log(
        `[LocalLoyalty] Redeemed ${pointsToRedeem} points from customer ${customerId} for order ${orderId}`
      );
    }

    return {
      success: true,
      pointsAwarded: -pointsToRedeem,
      newBalance: -pointsToRedeem,
    };
  } catch (error: any) {
    console.error('[LocalLoyalty] Error redeeming points:', error);
    return {
      success: false,
      pointsAwarded: 0,
      newBalance: 0,
      error: error.message,
    };
  }
}

/**
 * Get pending loyalty operations that need to be synced
 */
export async function getPendingLoyaltyOperations(): Promise<any[]> {
  if (typeof window !== 'undefined') {
    try {
      const pendingOperations = await storage.getJSON<any[]>(
        'pendingLoyaltyOperations'
      ) || [];
      return pendingOperations.filter((op: any) => !op.synced);
    } catch (error) {
      console.error('[LocalLoyalty] Error reading pending operations:', error);
      return [];
    }
  }
  return [];
}

/**
 * Clear synced loyalty operations from IndexedDB
 */
export async function clearSyncedLoyaltyOperations(operationIds: string[]): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      const pendingOperations = await storage.getJSON<any[]>(
        'pendingLoyaltyOperations'
      ) || [];

      const updatedOperations = pendingOperations.filter(
        (op: any) => !operationIds.includes(op.id)
      );

      await storage.setJSON(
        'pendingLoyaltyOperations',
        updatedOperations
      );
    } catch (error) {
      console.error('[LocalLoyalty] Error clearing synced operations:', error);
    }
  }
}
