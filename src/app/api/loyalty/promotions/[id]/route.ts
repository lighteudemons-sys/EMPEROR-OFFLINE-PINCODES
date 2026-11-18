import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session-manager';
import { canManageLoyaltyPromotions } from '@/lib/loyalty-permissions';

// ============================================================
// GET /api/loyalty/promotions/[id]
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const promotion = await db.loyaltyPromotion.findUnique({
      where: { id },
      include: {
        earnBranches: { include: { branch: { select: { branchName: true } } } },
        redeemBranches: { include: { branch: { select: { branchName: true } } } },
        productRestrictions: { include: { menuItem: { select: { name: true } } } },
        categoryRestrictions: { include: { category: { select: { name: true } } } },
        versions: { orderBy: { versionNumber: 'desc' } },
        _count: { select: { enrollments: true } },
      },
    });

    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 });
    }

    // BRANCH_MANAGER can only view promotions active in their branch
    if (session.role === 'BRANCH_MANAGER' && session.branchId) {
      const earnBranchIds = promotion.earnBranches.map((b) => b.branchId);
      if (earnBranchIds.length > 0 && !earnBranchIds.includes(session.branchId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ success: true, promotion });
  } catch (error) {
    console.error('[Loyalty] promotion get error:', error);
    return NextResponse.json({ error: 'Failed to fetch promotion' }, { status: 500 });
  }
}

// ============================================================
// PATCH /api/loyalty/promotions/[id]  (ADMIN only)
// ============================================================

const updatePromotionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),

  status: z.enum(['ACTIVE', 'PAUSED', 'SCHEDULED', 'EXPIRED', 'ARCHIVED']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().nullable().optional(),

  earningMethod: z.enum(['PER_VISIT', 'PER_ITEM', 'PER_QUANTITY', 'PER_AMOUNT']).optional(),
  earningValue: z.union([z.number(), z.string()]).optional(),
  stampsRequired: z.number().int().positive().optional(),
  maxEarnPerOrder: z.number().int().positive().nullable().optional(),
  maxEarnPerDay: z.number().int().positive().nullable().optional(),

  rewardType: z
    .enum(['FREE_ITEM', 'DISCOUNT_PERCENT', 'DISCOUNT_FIXED', 'FREE_PRODUCT', 'POINTS_BONUS'])
    .optional(),
  rewardValue: z.union([z.number(), z.string()]).nullable().optional(),
  rewardProductId: z.string().nullable().optional(),
  rewardCategoryId: z.string().nullable().optional(),
  rewardExpiresInDays: z.number().int().positive().nullable().optional(),

  minPurchaseAmount: z.union([z.number(), z.string()]).nullable().optional(),
  eligibleCustomerTiers: z.string().nullable().optional(),
  eligibleCustomerTypes: z.string().nullable().optional(),
  isNewCustomerOnly: z.boolean().optional(),
  isExistingCustomerOnly: z.boolean().optional(),

  overlapRule: z.enum(['EXCLUSIVE', 'SHARED', 'PRIORITY']).optional(),
  priority: z.number().int().optional(),
  allowSimultaneousRewards: z.boolean().optional(),
  isActive: z.boolean().optional(),

  earnBranchIds: z.array(z.string()).optional(),
  redeemBranchIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.string()).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canManageLoyaltyPromotions(session)) {
      return NextResponse.json({ error: 'Forbidden — ADMIN only' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.loyaltyPromotion.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updatePromotionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Determine if config-affecting fields changed (warrants a new version snapshot)
    const configFields = [
      'earningMethod',
      'earningValue',
      'stampsRequired',
      'maxEarnPerOrder',
      'maxEarnPerDay',
      'rewardType',
      'rewardValue',
      'rewardProductId',
      'rewardCategoryId',
      'rewardExpiresInDays',
      'minPurchaseAmount',
      'eligibleCustomerTiers',
      'eligibleCustomerTypes',
      'isNewCustomerOnly',
      'isExistingCustomerOnly',
      'overlapRule',
      'priority',
      'allowSimultaneousRewards',
    ];
    const configChanged = configFields.some((f) => (data as any)[f] !== undefined);
    const restrictionsChanged =
      data.earnBranchIds !== undefined ||
      data.redeemBranchIds !== undefined ||
      data.productIds !== undefined ||
      data.categoryIds !== undefined;

    const needsNewVersion = configChanged || restrictionsChanged;

    const updated = await db.$transaction(async (tx) => {
      // Build update data
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
      if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
      if (data.earningMethod !== undefined) updateData.earningMethod = data.earningMethod;
      if (data.earningValue !== undefined) updateData.earningValue = data.earningValue;
      if (data.stampsRequired !== undefined) updateData.stampsRequired = data.stampsRequired;
      if (data.maxEarnPerOrder !== undefined) updateData.maxEarnPerOrder = data.maxEarnPerOrder;
      if (data.maxEarnPerDay !== undefined) updateData.maxEarnPerDay = data.maxEarnPerDay;
      if (data.rewardType !== undefined) updateData.rewardType = data.rewardType;
      if (data.rewardValue !== undefined) updateData.rewardValue = data.rewardValue;
      if (data.rewardProductId !== undefined) updateData.rewardProductId = data.rewardProductId;
      if (data.rewardCategoryId !== undefined) updateData.rewardCategoryId = data.rewardCategoryId;
      if (data.rewardExpiresInDays !== undefined) updateData.rewardExpiresInDays = data.rewardExpiresInDays;
      if (data.minPurchaseAmount !== undefined) updateData.minPurchaseAmount = data.minPurchaseAmount;
      if (data.eligibleCustomerTiers !== undefined) updateData.eligibleCustomerTiers = data.eligibleCustomerTiers;
      if (data.eligibleCustomerTypes !== undefined) updateData.eligibleCustomerTypes = data.eligibleCustomerTypes;
      if (data.isNewCustomerOnly !== undefined) updateData.isNewCustomerOnly = data.isNewCustomerOnly;
      if (data.isExistingCustomerOnly !== undefined) updateData.isExistingCustomerOnly = data.isExistingCustomerOnly;
      if (data.overlapRule !== undefined) updateData.overlapRule = data.overlapRule;
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.allowSimultaneousRewards !== undefined) updateData.allowSimultaneousRewards = data.allowSimultaneousRewards;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      const promotion = await tx.loyaltyPromotion.update({
        where: { id },
        data: updateData,
      });

      // Replace earn branch restrictions (if provided)
      if (data.earnBranchIds !== undefined) {
        await tx.loyaltyPromotionEarnBranch.deleteMany({ where: { promotionId: id } });
        if (data.earnBranchIds.length > 0) {
          await tx.loyaltyPromotionEarnBranch.createMany({
            data: data.earnBranchIds.map((branchId) => ({ promotionId: id, branchId })),
          });
        }
      }

      if (data.redeemBranchIds !== undefined) {
        await tx.loyaltyPromotionRedeemBranch.deleteMany({ where: { promotionId: id } });
        if (data.redeemBranchIds.length > 0) {
          await tx.loyaltyPromotionRedeemBranch.createMany({
            data: data.redeemBranchIds.map((branchId) => ({ promotionId: id, branchId })),
          });
        }
      }

      if (data.productIds !== undefined) {
        await tx.loyaltyPromotionProduct.deleteMany({ where: { promotionId: id } });
        if (data.productIds.length > 0) {
          await tx.loyaltyPromotionProduct.createMany({
            data: data.productIds.map((menuItemId) => ({ promotionId: id, menuItemId })),
          });
        }
      }

      if (data.categoryIds !== undefined) {
        await tx.loyaltyPromotionCategory.deleteMany({ where: { promotionId: id } });
        if (data.categoryIds.length > 0) {
          await tx.loyaltyPromotionCategory.createMany({
            data: data.categoryIds.map((categoryId) => ({ promotionId: id, categoryId })),
          });
        }
      }

      // Create a new version snapshot if config or restrictions changed
      if (needsNewVersion) {
        // Close out the previous current version
        const previousVersion = await tx.loyaltyPromotionVersion.findFirst({
          where: { promotionId: id, validUntil: null },
          orderBy: { versionNumber: 'desc' },
        });
        if (previousVersion) {
          await tx.loyaltyPromotionVersion.update({
            where: { id: previousVersion.id },
            data: { validUntil: new Date() },
          });
        }

        const nextVersionNumber = (previousVersion?.versionNumber ?? 0) + 1;

        // Reload the promotion with all relations for the snapshot
        const fullPromotion = await tx.loyaltyPromotion.findUnique({
          where: { id },
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
            promotionId: id,
            versionNumber: nextVersionNumber,
            config: configSnapshot,
            createdBy: session.userId,
          },
        });

        await tx.loyaltyPromotion.update({
          where: { id },
          data: { currentVersion: nextVersionNumber },
        });
      }

      return promotion;
    });

    // Reload with relations for the response
    const fullPromotion = await db.loyaltyPromotion.findUnique({
      where: { id: updated.id },
      include: {
        earnBranches: { include: { branch: { select: { branchName: true } } } },
        redeemBranches: { include: { branch: { select: { branchName: true } } } },
        productRestrictions: true,
        categoryRestrictions: true,
        versions: { orderBy: { versionNumber: 'desc' } },
      },
    });

    return NextResponse.json({ success: true, promotion: fullPromotion });
  } catch (error) {
    console.error('[Loyalty] promotion update error:', error);
    return NextResponse.json({ error: 'Failed to update promotion' }, { status: 500 });
  }
}

// ============================================================
// DELETE /api/loyalty/promotions/[id]  (ADMIN only — archive)
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canManageLoyaltyPromotions(session)) {
      return NextResponse.json({ error: 'Forbidden — ADMIN only' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await db.loyaltyPromotion.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 });
    }

    // Archive (soft delete) — set status to ARCHIVED, isActive=false
    await db.loyaltyPromotion.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        isActive: false,
      },
    });

    return NextResponse.json({ success: true, message: 'Promotion archived' });
  } catch (error) {
    console.error('[Loyalty] promotion archive error:', error);
    return NextResponse.json({ error: 'Failed to archive promotion' }, { status: 500 });
  }
}
