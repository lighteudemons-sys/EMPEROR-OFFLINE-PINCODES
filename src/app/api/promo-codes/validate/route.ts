import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

// Validation schema for promo code validation request
const validatePromoSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  branchId: z.string().min(1, 'Branch ID is required'),
  customerId: z.string().nullable().optional(),
  orderSubtotal: z.number().min(0),
  orderItems: z.array(z.object({
    menuItemId: z.string(),
    categoryId: z.string().nullable().optional(),
    price: z.number(),
    quantity: z.number(),
  })).optional(),
});

// Validation response type
interface ValidateResponse {
  success: boolean;
  valid: boolean;
  promo?: {
    id: string; // Promo code ID
    promotionId: string; // Promotion ID
    name: string;
    code: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
    message: string;
  };
  error?: string;
}

// POST /api/promo-codes/validate - Validate and calculate discount for a promo code
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = validatePromoSchema.parse(body);

    const { code, branchId, customerId, orderSubtotal, orderItems = [] } = validatedData;

    // Find the promo code
    const promoCode = await db.promotionCode.findFirst({
      where: {
        code: code.toUpperCase(),
        isActive: true,
      },
      include: {
        promotion: {
          include: {
            branchRestrictions: true,
            categoryRestrictions: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!promoCode) {
      return NextResponse.json<ValidateResponse>({
        success: true,
        valid: false,
        error: 'Invalid promo code',
      });
    }

    const promotion = promoCode.promotion;

    // Check if promotion is active
    if (!promotion.isActive) {
      return NextResponse.json<ValidateResponse>({
        success: true,
        valid: false,
        error: 'This promotion is not active',
      });
    }

    // Check date range
    const now = new Date();
    if (now < promotion.startDate || now > promotion.endDate) {
      return NextResponse.json<ValidateResponse>({
        success: true,
        valid: false,
        error: 'This promo code has expired',
      });
    }

    // Check branch restrictions
    if (promotion.branchRestrictions.length > 0) {
      const isBranchAllowed = promotion.branchRestrictions.some(
        (restriction) => restriction.branchId === branchId
      );
      if (!isBranchAllowed) {
        return NextResponse.json<ValidateResponse>({
          success: true,
          valid: false,
          error: 'This promo code is not valid for this branch',
        });
      }
    }

    // Check usage limits
    // 1. Check if single-use code has been used
    if (promoCode.isSingleUse && promoCode.usageCount > 0) {
      return NextResponse.json<ValidateResponse>({
        success: true,
        valid: false,
        error: 'This promo code has already been used',
      });
    }

    // 2. Check code-level max uses
    if (promoCode.maxUses !== null && promoCode.usageCount >= promoCode.maxUses) {
      return NextResponse.json<ValidateResponse>({
        success: true,
        valid: false,
        error: 'This promo code has reached its maximum usage limit',
      });
    }

    // 3. Check promotion-level max uses
    if (promotion.maxUses !== null) {
      const totalUsage = await db.promotionUsageLog.count({
        where: { promotionId: promotion.id },
      });
      if (totalUsage >= promotion.maxUses) {
        return NextResponse.json<ValidateResponse>({
          success: true,
          valid: false,
          error: 'This promotion has reached its maximum usage limit',
        });
      }
    }

    // 4. Check customer usage limit
    if (customerId && promotion.usesPerCustomer !== null) {
      const customerUsage = await db.promotionUsageLog.count({
        where: {
          promotionId: promotion.id,
          customerId,
        },
      });
      if (customerUsage >= promotion.usesPerCustomer) {
        return NextResponse.json<ValidateResponse>({
          success: true,
          valid: false,
          error: `You have reached the maximum uses for this promo code (${promotion.usesPerCustomer} uses)`,
        });
      }
    }

    // Check minimum order amount
    if (promotion.minOrderAmount !== null && orderSubtotal < promotion.minOrderAmount) {
      return NextResponse.json<ValidateResponse>({
        success: true,
        valid: false,
        error: `Minimum order amount of ${promotion.minOrderAmount} required to use this promo code`,
      });
    }

    // Calculate discount based on type
    let discountAmount = 0;
    let applicableSubtotal = orderSubtotal;
    let message = '';

    switch (promotion.discountType) {
      case 'PERCENTAGE':
        discountAmount = (orderSubtotal * promotion.discountValue) / 100;
        message = `${promotion.discountValue}% discount applied`;
        break;

      case 'FIXED_AMOUNT':
        discountAmount = promotion.discountValue;
        message = `${promotion.discountValue} EGP discount applied`;
        break;

      case 'CATEGORY_PERCENTAGE':
        // Calculate subtotal for restricted categories
        const restrictedCategoryIds = [
          ...(promotion.categoryId ? [promotion.categoryId] : []),
          ...promotion.categoryRestrictions.map((cr) => cr.categoryId),
        ];

        if (restrictedCategoryIds.length === 0) {
          return NextResponse.json<ValidateResponse>({
            success: true,
            valid: false,
            error: 'Category configuration error',
          });
        }

        const categorySubtotal = orderItems.reduce((sum, item) => {
          if (item.categoryId && restrictedCategoryIds.includes(item.categoryId)) {
            return sum + (item.price * item.quantity);
          }
          return sum;
        }, 0);

        if (categorySubtotal === 0) {
          return NextResponse.json<ValidateResponse>({
            success: true,
            valid: false,
            error: 'No eligible items in cart for this category-specific promo',
          });
        }

        applicableSubtotal = categorySubtotal;
        discountAmount = (categorySubtotal * promotion.discountValue) / 100;
        const categoryNames = promotion.categoryRestrictions
          .map((cr) => cr.category.name)
          .join(', ');
        message = `${promotion.discountValue}% discount on ${categoryNames} applied`;
        break;

      case 'CATEGORY_FIXED':
        // Similar logic for category fixed amount
        const restrictedFixedCategoryIds = [
          ...(promotion.categoryId ? [promotion.categoryId] : []),
          ...promotion.categoryRestrictions.map((cr) => cr.categoryId),
        ];

        if (restrictedFixedCategoryIds.length === 0) {
          return NextResponse.json<ValidateResponse>({
            success: true,
            valid: false,
            error: 'Category configuration error',
          });
        }

        const fixedCategorySubtotal = orderItems.reduce((sum, item) => {
          if (item.categoryId && restrictedFixedCategoryIds.includes(item.categoryId)) {
            return sum + (item.price * item.quantity);
          }
          return sum;
        }, 0);

        if (fixedCategorySubtotal === 0) {
          return NextResponse.json<ValidateResponse>({
            success: true,
            valid: false,
            error: 'No eligible items in cart for this category-specific promo',
          });
        }

        discountAmount = promotion.discountValue;
        const fixedCategoryNames = promotion.categoryRestrictions
          .map((cr) => cr.category.name)
          .join(', ');
        message = `${promotion.discountValue} EGP off ${fixedCategoryNames} applied`;
        break;

      case 'BUY_X_GET_Y_FREE':
        // BOGO (Buy X Get Y Free) logic
        const buyIds: string[] = [];
        const getIds: string[] = [];

        // Determine buy items
        if (promotion.buyProductId) {
          buyIds.push(promotion.buyProductId);
        } else if (promotion.buyCategoryId) {
          // Get all menu items in the category
          const categoryMenuItems = await db.menuItem.findMany({
            where: { categoryId: promotion.buyCategoryId },
            select: { id: true },
          });
          buyIds.push(...categoryMenuItems.map(m => m.id));
        }

        // Determine get items
        if (promotion.getProductId) {
          getIds.push(promotion.getProductId);
        } else if (promotion.getCategoryId) {
          const categoryMenuItems = await db.menuItem.findMany({
            where: { categoryId: promotion.getCategoryId },
            select: { id: true },
          });
          getIds.push(...categoryMenuItems.map(m => m.id));
        } else {
          // If not specified, get items are same as buy items
          getIds.push(...buyIds);
        }

        // Filter order items for buy products
        const buyItems = orderItems.filter(item => buyIds.includes(item.menuItemId));
        const totalBuyQuantity = buyItems.reduce((sum, item) => sum + item.quantity, 0);

        if (totalBuyQuantity < (promotion.buyQuantity || 0)) {
          return NextResponse.json<ValidateResponse>({
            success: true,
            valid: false,
            error: `Need to buy ${promotion.buyQuantity} items to qualify for this promotion`,
          });
        }

        // Calculate how many free items to give
        const freeBundles = Math.floor(totalBuyQuantity / (promotion.buyQuantity || 1));
        const totalFreeItems = freeBundles * (promotion.getQuantity || 1);

        // Filter order items for get products
        const getItems = orderItems.filter(item => getIds.includes(item.menuItemId));

        // Calculate discount based on applyToCheapest setting
        if (promotion.applyToCheapest) {
          // Sort get items by price (ascending) and discount the cheapest ones
          const sortedGetItems = [...getItems].sort((a, b) => a.price - b.price);
          let remainingFreeItems = totalFreeItems;
          let totalDiscount = 0;

          for (const item of sortedGetItems) {
            if (remainingFreeItems <= 0) break;

            const freeQuantity = Math.min(item.quantity, remainingFreeItems);
            totalDiscount += (item.price * freeQuantity);
            remainingFreeItems -= freeQuantity;
          }

          discountAmount = totalDiscount;
        } else {
          // Apply discount proportionally or to first eligible items
          let remainingFreeItems = totalFreeItems;
          let totalDiscount = 0;

          for (const item of getItems) {
            if (remainingFreeItems <= 0) break;

            const freeQuantity = Math.min(item.quantity, remainingFreeItems);
            totalDiscount += (item.price * freeQuantity);
            remainingFreeItems -= freeQuantity;
          }

          discountAmount = totalDiscount;
        }

        if (discountAmount === 0) {
          return NextResponse.json<ValidateResponse>({
            success: true,
            valid: false,
            error: 'No eligible items to apply free items discount',
          });
        }

        message = `Buy ${promotion.buyQuantity} Get ${promotion.getQuantity} Free applied`;
        applicableSubtotal = orderSubtotal;
        break;
    }

    // Apply max discount cap if specified
    if (promotion.maxDiscountAmount !== null && discountAmount > promotion.maxDiscountAmount) {
      discountAmount = promotion.maxDiscountAmount;
      message = `Discount capped at ${promotion.maxDiscountAmount} EGP`;
    }

    // Ensure discount doesn't exceed subtotal
    discountAmount = Math.min(discountAmount, applicableSubtotal);

    // Round to 2 decimal places
    discountAmount = Math.round(discountAmount * 100) / 100;

    return NextResponse.json<ValidateResponse>({
      success: true,
      valid: true,
      promo: {
        id: promoCode.id, // Return the PROMO CODE ID, not promotion ID
        promotionId: promotion.id, // Also include the promotion ID
        name: promotion.name,
        code: promoCode.code,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
        discountAmount,
        message,
      },
    });
  } catch (error) {
    console.error('Error validating promo code:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json<ValidateResponse>({
        success: false,
        valid: false,
        error: 'Validation error',
      });
    }

    return NextResponse.json<ValidateResponse>({
      success: false,
      valid: false,
      error: 'Failed to validate promo code',
    });
  }
}
