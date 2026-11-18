import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session-manager';
import { canManageLoyaltyPromotions } from '@/lib/loyalty-permissions';

// ============================================================
// GET /api/loyalty/promotions
// ============================================================

/**
 * List loyalty promotions with pagination.
 *
 * - ADMIN sees all promotions.
 * - BRANCH_MANAGER sees only promotions where their branch is in earnBranches
 *   (or promotions with no earnBranches restriction = all branches).
 *
 * Query params: page (default 1), pageSize (default 20), status?, isActive?
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const status = searchParams.get('status');
    const isActiveParam = searchParams.get('isActive');
    const isActive = isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;

    const where: any = {};
    if (status) where.status = status;
    if (isActive !== undefined) where.isActive = isActive;

    // BRANCH_MANAGER: restrict to their branch (or no-branch-restriction promotions).
    if (session.role === 'BRANCH_MANAGER' && session.branchId) {
      where.OR = [
        { earnBranches: { none: {} } },
        { earnBranches: { some: { branchId: session.branchId } } },
      ];
    } else if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [total, promotions] = await Promise.all([
      db.loyaltyPromotion.count({ where }),
      db.loyaltyPromotion.findMany({
        where,
        include: {
          earnBranches: { include: { branch: { select: { branchName: true } } } },
          redeemBranches: { include: { branch: { select: { branchName: true } } } },
          productRestrictions: true,
          categoryRestrictions: true,
          _count: { select: { enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      success: true,
      promotions,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[Loyalty] promotions list error:', error);
    return NextResponse.json({ error: 'Failed to list promotions' }, { status: 500 });
  }
}

// ============================================================
// POST /api/loyalty/promotions  (ADMIN only — create)
// ============================================================

const createPromotionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),

  status: z.enum(['ACTIVE', 'PAUSED', 'SCHEDULED']).default('SCHEDULED'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable().optional(),

  earningMethod: z.enum(['PER_VISIT', 'PER_ITEM', 'PER_QUANTITY', 'PER_AMOUNT']),
  earningValue: z.union([z.number(), z.string()]),
  stampsRequired: z.number().int().positive(),
  maxEarnPerOrder: z.number().int().positive().nullable().optional(),
  maxEarnPerDay: z.number().int().positive().nullable().optional(),

  rewardType: z.enum([
    'FREE_ITEM',
    'DISCOUNT_PERCENT',
    'DISCOUNT_FIXED',
    'FREE_PRODUCT',
    'POINTS_BONUS',
  ]),
  rewardValue: z.union([z.number(), z.string()]).nullable().optional(),
  rewardProductId: z.string().nullable().optional(),
  rewardCategoryId: z.string().nullable().optional(),
  rewardExpiresInDays: z.number().int().positive().nullable().optional(),

  minPurchaseAmount: z.union([z.number(), z.string()]).nullable().optional(),
  eligibleCustomerTiers: z.string().nullable().optional(),
  eligibleCustomerTypes: z.string().nullable().optional(),
  isNewCustomerOnly: z.boolean().default(false),
  isExistingCustomerOnly: z.boolean().default(false),

  overlapRule: z.enum(['EXCLUSIVE', 'SHARED', 'PRIORITY']).default('SHARED'),
  priority: z.number().int().default(0),
  allowSimultaneousRewards: z.boolean().default(true),
  isActive: z.boolean().default(true),

  // Branch / product / category restrictions
  earnBranchIds: z.array(z.string()).default([]),
  redeemBranchIds: z.array(z.string()).default([]),
  productIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canManageLoyaltyPromotions(session)) {
      return NextResponse.json({ error: 'Forbidden — ADMIN only' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createPromotionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const promotion = await db.$transaction(async (tx) => {
      const created = await tx.loyaltyPromotion.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          status: data.status,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,

          earningMethod: data.earningMethod,
          earningValue: data.earningValue,
          stampsRequired: data.stampsRequired,
          maxEarnPerOrder: data.maxEarnPerOrder ?? null,
          maxEarnPerDay: data.maxEarnPerDay ?? null,

          rewardType: data.rewardType,
          rewardValue: data.rewardValue ?? null,
          rewardProductId: data.rewardProductId ?? null,
          rewardCategoryId: data.rewardCategoryId ?? null,
          rewardExpiresInDays: data.rewardExpiresInDays ?? null,

          minPurchaseAmount: data.minPurchaseAmount ?? null,
          eligibleCustomerTiers: data.eligibleCustomerTiers ?? null,
          eligibleCustomerTypes: data.eligibleCustomerTypes ?? null,
          isNewCustomerOnly: data.isNewCustomerOnly,
          isExistingCustomerOnly: data.isExistingCustomerOnly,

          overlapRule: data.overlapRule,
          priority: data.priority,
          allowSimultaneousRewards: data.allowSimultaneousRewards,
          isActive: data.isActive,
          currentVersion: 1,
          createdBy: session.userId,
        },
      });

      // Branch restrictions
      if (data.earnBranchIds.length > 0) {
        await tx.loyaltyPromotionEarnBranch.createMany({
          data: data.earnBranchIds.map((branchId) => ({
            promotionId: created.id,
            branchId,
          })),
        });
      }
      if (data.redeemBranchIds.length > 0) {
        await tx.loyaltyPromotionRedeemBranch.createMany({
          data: data.redeemBranchIds.map((branchId) => ({
            promotionId: created.id,
            branchId,
          })),
        });
      }

      // Product restrictions
      if (data.productIds.length > 0) {
        await tx.loyaltyPromotionProduct.createMany({
          data: data.productIds.map((menuItemId) => ({
            promotionId: created.id,
            menuItemId,
          })),
        });
      }
      if (data.categoryIds.length > 0) {
        await tx.loyaltyPromotionCategory.createMany({
          data: data.categoryIds.map((categoryId) => ({
            promotionId: created.id,
            categoryId,
          })),
        });
      }

      // Create version 1 snapshot
      const fullPromotion = await tx.loyaltyPromotion.findUnique({
        where: { id: created.id },
        include: {
          earnBranches: true,
          redeemBranches: true,
          productRestrictions: true,
          categoryRestrictions: true,
        },
      });

      const configSnapshot = {
        name: fullPromotion!.name,
        description: fullPromotion!.description,
        earningMethod: fullPromotion!.earningMethod,
        earningValue: Number(fullPromotion!.earningValue),
        stampsRequired: fullPromotion!.stampsRequired,
        maxEarnPerOrder: fullPromotion!.maxEarnPerOrder,
        maxEarnPerDay: fullPromotion!.maxEarnPerDay,
        rewardType: fullPromotion!.rewardType,
        rewardValue:
          fullPromotion!.rewardValue !== null ? Number(fullPromotion!.rewardValue) : null,
        rewardProductId: fullPromotion!.rewardProductId,
        rewardCategoryId: fullPromotion!.rewardCategoryId,
        rewardExpiresInDays: fullPromotion!.rewardExpiresInDays,
        minPurchaseAmount:
          fullPromotion!.minPurchaseAmount !== null
            ? Number(fullPromotion!.minPurchaseAmount)
            : null,
        eligibleCustomerTiers: fullPromotion!.eligibleCustomerTiers,
        eligibleCustomerTypes: fullPromotion!.eligibleCustomerTypes,
        isNewCustomerOnly: fullPromotion!.isNewCustomerOnly,
        isExistingCustomerOnly: fullPromotion!.isExistingCustomerOnly,
        overlapRule: fullPromotion!.overlapRule,
        priority: fullPromotion!.priority,
        allowSimultaneousRewards: fullPromotion!.allowSimultaneousRewards,
        earnBranches: fullPromotion!.earnBranches.map((b) => b.branchId),
        redeemBranches: fullPromotion!.redeemBranches.map((b) => b.branchId),
        productRestrictions: fullPromotion!.productRestrictions.map((p) => p.menuItemId),
        categoryRestrictions: fullPromotion!.categoryRestrictions.map((c) => c.categoryId),
      };

      await tx.loyaltyPromotionVersion.create({
        data: {
          promotionId: created.id,
          versionNumber: 1,
          config: configSnapshot,
          createdBy: session.userId,
        },
      });

      return created;
    });

    // Reload with relations for the response
    const fullPromotion = await db.loyaltyPromotion.findUnique({
      where: { id: promotion.id },
      include: {
        earnBranches: { include: { branch: { select: { branchName: true } } } },
        redeemBranches: { include: { branch: { select: { branchName: true } } } },
        productRestrictions: true,
        categoryRestrictions: true,
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
    });

    return NextResponse.json({ success: true, promotion: fullPromotion }, { status: 201 });
  } catch (error) {
    console.error('[Loyalty] promotions create error:', error);
    return NextResponse.json(
      { error: 'Failed to create promotion' },
      { status: 500 }
    );
  }
}
