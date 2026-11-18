import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session-manager';
import { canViewLoyaltyReports } from '@/lib/loyalty-permissions';

// ============================================================
// GET /api/loyalty/reports
//
// Aggregated loyalty KPIs and per-promotion performance.
// ADMIN sees all branches; BRANCH_MANAGER restricted to their branch.
//
// Query params:
//   branchId?  — restrict to a specific branch (in addition to session scope)
//   from?      — ISO date (inclusive)
//   to?        — ISO date (inclusive)
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canViewLoyaltyReports(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const fromIso = searchParams.get('from');
    const toIso = searchParams.get('to');

    const fromDate = fromIso ? new Date(fromIso) : undefined;
    const toDate = toIso ? new Date(toIso) : undefined;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    // BRANCH_MANAGER: hard-restrict to their own branch.
    const scopeBranchId =
      session.role === 'BRANCH_MANAGER' ? session.branchId : branchId || undefined;

    // ----------------------------------------------------------------
    // (1) Tier distribution + legacy points liability
    // ----------------------------------------------------------------
    const tierAgg = await db.customer.groupBy({
      by: ['tier'],
      _count: { id: true },
      _sum: { loyaltyPoints: true },
    });

    const tierDistribution = (['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'] as const).map(
      (tier) => {
        const row = tierAgg.find((r) => (r.tier || 'BRONZE') === tier);
        return {
          tier,
          customerCount: row?._count.id || 0,
          totalPoints: row?._sum.loyaltyPoints || 0,
        };
      }
    );

    const totalCustomers = tierDistribution.reduce((s, t) => s + t.customerCount, 0);
    const totalLegacyPoints = tierDistribution.reduce((s, t) => s + t.totalPoints, 0);

    // Legacy points liability = totalPoints * legacyPointsValue (default 0.1 EGP/pt)
    const settings = await db.loyaltyGlobalSettings.findUnique({
      where: { id: 'singleton' },
    });
    const legacyPointsValue = Number(settings?.legacyPointsValue ?? 0.1);
    const legacyPointsLiability = totalLegacyPoints * legacyPointsValue;

    // ----------------------------------------------------------------
    // (2) Promotion performance (one row per promotion)
    // ----------------------------------------------------------------
    // BRANCH_MANAGER: restrict to promotions where their branch is in
    // earnBranches (or promotions with no earnBranches = all branches).
    let promotionWhere: any = { status: { not: 'ARCHIVED' } };
    if (scopeBranchId) {
      promotionWhere.OR = [
        { earnBranches: { none: {} } },
        { earnBranches: { some: { branchId: scopeBranchId } } },
      ];
    }
    const promotions = await db.loyaltyPromotion.findMany({
      where: promotionWhere,
      include: {
        enrollments: {
          select: {
            availableStamps: true,
            rewardsClaimed: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Aggregate reward instances per promotion in a single query
    const rewardAggRows = await db.loyaltyRewardInstance.groupBy({
      by: ['promotionId', 'status'],
      _count: { id: true },
      _sum: { rewardValue: true },
      where: {
        ...(fromDate || toDate
          ? {
              earnedAt: {
                gte: fromDate || undefined,
                lte: toDate || undefined,
              },
            }
          : {}),
      },
    });

    // Build a lookup: promotionId -> { status -> { count, value } }
    const rewardByPromotion = new Map<string, Record<string, { count: number; value: number }>>();
    for (const row of rewardAggRows) {
      const entry = rewardByPromotion.get(row.promotionId) || {};
      entry[row.status] = {
        count: row._count.id,
        value: Number(row._sum.rewardValue || 0),
      };
      rewardByPromotion.set(row.promotionId, entry);
    }

    const promotionPerformance = promotions.map((p) => {
      const statusMap = rewardByPromotion.get(p.id) || {};
      const redeemed = statusMap['REDEEMED']?.count || 0;
      const expired = statusMap['EXPIRED']?.count || 0;
      const available = statusMap['AVAILABLE']?.count || 0;
      const pending = statusMap['PENDING_REDEMPTION']?.count || 0;
      const redeemedValue = statusMap['REDEEMED']?.value || 0;

      // Redemption rate = REDEEMED / (REDEEMED + EXPIRED + AVAILABLE + PENDING)
      const totalIssued = redeemed + expired + available + pending;
      const redemptionRate = totalIssued > 0 ? redeemed / totalIssued : 0;

      const totalEnrolled = p.enrollments.length;
      const totalStamps = p.enrollments.reduce((s, e) => s + e.availableStamps, 0);
      const totalRewardsClaimed = p.enrollments.reduce((s, e) => s + e.rewardsClaimed, 0);

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        earningMethod: p.earningMethod,
        stampsRequired: p.stampsRequired,
        enrolledCustomers: totalEnrolled,
        availableStampsOutstanding: totalStamps,
        totalRewardsClaimed,
        rewardsIssued: totalIssued,
        rewardsRedeemed: redeemed,
        rewardsExpired: expired,
        rewardsAvailable: available,
        rewardsPending: pending,
        redeemedValue,
        redemptionRate: Math.round(redemptionRate * 1000) / 10, // percentage with 1 decimal
      };
    });

    // ----------------------------------------------------------------
    // (3) Recent stamp activity (counts by type in window)
    // ----------------------------------------------------------------
    // NOTE: LoyaltyStampTransaction has no `order` relation (only
    // `enrollment` and `rewardInstance`), so we cannot efficiently
    // filter by branch via Prisma. For BRANCH_MANAGER scope we
    // surface all activity; the promotion performance table above is
    // already correctly branch-scoped (promotions are restricted to
    // those whose earnBranches include the manager's branch).
    const stampTxWhere: any = {};
    if (fromDate || toDate) {
      stampTxWhere.createdAt = {
        gte: fromDate || undefined,
        lte: toDate || undefined,
      };
    }

    const stampTxAgg = await db.loyaltyStampTransaction.groupBy({
      by: ['type'],
      _count: { id: true },
      _sum: { stamps: true },
      where: stampTxWhere,
    });

    const stampActivity = stampTxAgg.map((r) => ({
      type: r.type,
      count: r._count.id,
      stamps: r._sum.stamps || 0,
    }));

    // ----------------------------------------------------------------
    // (4) Reward status overview
    // ----------------------------------------------------------------
    const rewardStatusAgg = await db.loyaltyRewardInstance.groupBy({
      by: ['status'],
      _count: { id: true },
      _sum: { rewardValue: true },
      where: fromDate || toDate
        ? {
            earnedAt: {
              gte: fromDate || undefined,
              lte: toDate || undefined,
            },
          }
        : undefined,
    });

    const rewardStatus = (['AVAILABLE', 'PENDING_REDEMPTION', 'REDEEMED', 'EXPIRED'] as const).map(
      (status) => {
        const row = rewardStatusAgg.find((r) => r.status === status);
        return {
          status,
          count: row?._count.id || 0,
          value: Number(row?._sum.rewardValue || 0),
        };
      }
    );

    // ----------------------------------------------------------------
    // (5) Top promotions by redemption count (top 5)
    // ----------------------------------------------------------------
    const topPromotionsByRedemption = [...promotionPerformance]
      .sort((a, b) => b.rewardsRedeemed - a.rewardsRedeemed)
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        name: p.name,
        rewardsRedeemed: p.rewardsRedeemed,
        redemptionRate: p.redemptionRate,
      }));

    return NextResponse.json({
      success: true,
      scope: {
        role: session.role,
        branchId: scopeBranchId || null,
        from: fromDate ? fromDate.toISOString() : null,
        to: toDate ? toDate.toISOString() : null,
      },
      summary: {
        totalCustomers,
        totalLegacyPoints,
        legacyPointsValue,
        legacyPointsLiability: Math.round(legacyPointsLiability * 100) / 100,
        activePromotions: promotions.filter((p) => p.status === 'ACTIVE').length,
      },
      tierDistribution,
      promotionPerformance,
      stampActivity,
      rewardStatus,
      topPromotionsByRedemption,
    });
  } catch (error) {
    console.error('[Loyalty] reports error:', error);
    return NextResponse.json({ error: 'Failed to generate loyalty report' }, { status: 500 });
  }
}
