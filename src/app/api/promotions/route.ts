import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { getSession } from '@/lib/session-manager';

// Validation schema for creating/updating promotions
const promotionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'CATEGORY_PERCENTAGE', 'CATEGORY_FIXED', 'BUY_X_GET_Y_FREE']),
  discountValue: z.number().min(0, 'Discount value must be positive'),
  categoryId: z.string().nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  usesPerCustomer: z.number().int().positive().nullable().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  isActive: z.boolean().default(true),
  allowStacking: z.boolean().default(false),
  minOrderAmount: z.number().min(0).nullable().optional(),
  maxDiscountAmount: z.number().min(0).nullable().optional(),
  // BOGO fields
  buyQuantity: z.number().int().positive().nullable().optional(),
  getQuantity: z.number().int().positive().nullable().optional(),
  buyProductId: z.string().nullable().optional(),
  buyCategoryId: z.string().nullable().optional(),
  buyProductVariantId: z.string().nullable().optional(), // Variant-specific buy product
  getProductId: z.string().nullable().optional(),
  getCategoryId: z.string().nullable().optional(),
  getProductVariantId: z.string().nullable().optional(), // Variant-specific get product
  applyToCheapest: z.boolean().default(false),
  branchIds: z.array(z.string()).optional().default([]),
  categoryIds: z.array(z.string()).optional().default([]),
  codes: z.array(z.object({
    code: z.string().min(1, 'Code is required'),
    isSingleUse: z.boolean().default(false),
    maxUses: z.number().int().positive().nullable().optional(),
  })).optional().default([]),
});

// GET /api/promotions - List all promotions
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('isActive');
    const includeCodes = searchParams.get('includeCodes') === 'true';
    const includeUsage = searchParams.get('includeUsage') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (isActive !== null) {
      where.isActive = isActive === 'true';
    }

    // Branch filtering for non-admin users
    if (session.role === 'BRANCH_MANAGER' && session.branchId) {
      // Branch managers can only see:
      // 1. Global promotions (no branch restrictions)
      // 2. Promotions restricted to their branch
      where.OR = [
        { branchRestrictions: { none: {} } }, // No branch restrictions (global)
        { branchRestrictions: { some: { branchId: session.branchId } } }, // Restricted to their branch
      ];
    }

    // Don't include codes in list endpoint to avoid 5MB limit
    // Use the single promotion endpoint to get codes

    // Get total count for pagination
    const total = await db.promotion.count({ where });

    // Get paginated promotions
    const promotions = await db.promotion.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        branchRestrictions: {
          select: {
            id: true,
            branchId: true,
            branch: {
              select: {
                id: true,
                branchName: true,
              },
            },
          },
        },
        categoryRestrictions: {
          select: {
            id: true,
            categoryId: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            codes: true,
            usageLogs: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      promotions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch promotions' },
      { status: 500 }
    );
  }
}

// POST /api/promotions - Create a new promotion
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = promotionSchema.parse(body);

    // Branch managers can only create promotions for their branch
    if (session.role === 'BRANCH_MANAGER') {
      if (!session.branchId) {
        return NextResponse.json(
          { success: false, error: 'Branch manager must be assigned to a branch' },
          { status: 403 }
        );
      }
      // Force branchIds to only include the manager's branch
      validatedData.branchIds = [session.branchId];
    }

    // Validate dates
    const startDate = new Date(validatedData.startDate);
    const endDate = new Date(validatedData.endDate);
    if (endDate <= startDate) {
      return NextResponse.json(
        { success: false, error: 'End date must be after start date' },
        { status: 400 }
      );
    }

    // Validate category-specific discounts
    if (
      (validatedData.discountType === 'CATEGORY_PERCENTAGE' ||
        validatedData.discountType === 'CATEGORY_FIXED') &&
      !validatedData.categoryId &&
      (!validatedData.categoryIds || validatedData.categoryIds.length === 0)
    ) {
      return NextResponse.json(
        { success: false, error: 'Category is required for category-specific discounts' },
        { status: 400 }
      );
    }

    // Validate percentage discounts
    if (
      (validatedData.discountType === 'PERCENTAGE' ||
        validatedData.discountType === 'CATEGORY_PERCENTAGE')
    ) {
      if (validatedData.discountValue < 0 || validatedData.discountValue > 100) {
        return NextResponse.json(
          { success: false, error: 'Percentage discount must be between 0 and 100' },
          { status: 400 }
        );
      }
    }

    // Validate BOGO discounts
    if (validatedData.discountType === 'BUY_X_GET_Y_FREE') {
      if (!validatedData.buyQuantity || validatedData.buyQuantity < 1) {
        return NextResponse.json(
          { success: false, error: 'Buy quantity is required and must be at least 1' },
          { status: 400 }
        );
      }
      if (!validatedData.getQuantity || validatedData.getQuantity < 1) {
        return NextResponse.json(
          { success: false, error: 'Get quantity is required and must be at least 1' },
          { status: 400 }
        );
      }
      if (!validatedData.buyProductId && !validatedData.buyCategoryId) {
        return NextResponse.json(
          { success: false, error: 'Buy product or category is required for BOGO promotions' },
          { status: 400 }
        );
      }
    }

    // Create promotion with codes in a transaction
    const promotion = await db.$transaction(async (tx) => {
      // Create promotion
      const newPromotion = await tx.promotion.create({
        data: {
          name: validatedData.name,
          description: validatedData.description,
          discountType: validatedData.discountType,
          discountValue: validatedData.discountValue,
          categoryId: validatedData.categoryId,
          maxUses: validatedData.maxUses,
          usesPerCustomer: validatedData.usesPerCustomer,
          startDate,
          endDate,
          isActive: validatedData.isActive,
          allowStacking: validatedData.allowStacking,
          minOrderAmount: validatedData.minOrderAmount,
          maxDiscountAmount: validatedData.maxDiscountAmount,
          // BOGO fields
          buyQuantity: validatedData.buyQuantity,
          getQuantity: validatedData.getQuantity,
          buyProductId: validatedData.buyProductId,
          buyCategoryId: validatedData.buyCategoryId,
          buyProductVariantId: validatedData.buyProductVariantId,
          getProductId: validatedData.getProductId,
          getCategoryId: validatedData.getCategoryId,
          getProductVariantId: validatedData.getProductVariantId,
          applyToCheapest: validatedData.applyToCheapest,
        },
      });

      // Add branch restrictions if specified
      if (validatedData.branchIds && validatedData.branchIds.length > 0) {
        await tx.promotionBranch.createMany({
          data: validatedData.branchIds.map((branchId) => ({
            promotionId: newPromotion.id,
            branchId,
          })),
        });
      }

      // Add category restrictions if specified
      if (validatedData.categoryIds && validatedData.categoryIds.length > 0) {
        await tx.promotionCategory.createMany({
          data: validatedData.categoryIds.map((categoryId) => ({
            promotionId: newPromotion.id,
            categoryId,
          })),
        });
      }

      // Create codes if provided
      if (validatedData.codes && validatedData.codes.length > 0) {
        // Check for duplicate codes in database
        const codeList = validatedData.codes.map(c => c.code.toUpperCase());
        const existingCodes = await tx.promotionCode.findMany({
          where: {
            code: { in: codeList },
          },
          select: { code: true },
        });

        if (existingCodes.length > 0) {
          const duplicateCodes = existingCodes.map(c => c.code).join(', ');
          throw new Error(`The following codes already exist: ${duplicateCodes}`);
        }

        await tx.promotionCode.createMany({
          data: validatedData.codes.map((codeData) => ({
            promotionId: newPromotion.id,
            code: codeData.code.toUpperCase(),
            isSingleUse: codeData.isSingleUse,
            maxUses: codeData.maxUses,
          })),
        });
      }

      return newPromotion;
    });

    // Fetch the complete promotion with relations (limit codes to avoid 5MB limit)
    const completePromotion = await db.promotion.findUnique({
      where: { id: promotion.id },
      select: {
        id: true,
        name: true,
        description: true,
        discountType: true,
        discountValue: true,
        categoryId: true,
        maxUses: true,
        usesPerCustomer: true,
        startDate: true,
        endDate: true,
        isActive: true,
        allowStacking: true,
        minOrderAmount: true,
        maxDiscountAmount: true,
        // BOGO fields
        buyQuantity: true,
        getQuantity: true,
        buyProductId: true,
        buyCategoryId: true,
        buyProductVariantId: true,
        getProductId: true,
        getCategoryId: true,
        getProductVariantId: true,
        applyToCheapest: true,
        createdAt: true,
        updatedAt: true,
        codes: {
          select: {
            id: true,
            code: true,
            isActive: true,
            usageCount: true,
            maxUses: true,
            isSingleUse: true,
            createdAt: true,
          },
          take: 50, // Limit to 50 most recent codes to avoid response size limit
          orderBy: { createdAt: 'desc' },
        },
        branchRestrictions: {
          select: {
            id: true,
            branchId: true,
            branch: {
              select: {
                id: true,
                branchName: true,
              },
            },
          },
        },
        categoryRestrictions: {
          select: {
            id: true,
            categoryId: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            codes: true,
            usageLogs: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      promotion: completePromotion,
      message: 'Promotion created successfully. Note: Only the 50 most recent codes are shown in the response.',
    });
  } catch (error) {
    console.error('Error creating promotion:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create promotion' },
      { status: 500 }
    );
  }
}
