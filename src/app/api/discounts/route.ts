import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const branchId = searchParams.get('branchId');
    const type = searchParams.get('type'); // 'manual', 'promo', or null for all

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    // Build where clause for filtering
    const whereConditions: any = {
      orderTimestamp: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
      OR: [
        { promoDiscount: { gt: 0 } },
        { manualDiscountAmount: { gt: 0 } },
      ],
    };

    if (branchId && branchId !== 'all') {
      whereConditions.branchId = branchId;
    }

    // Filter by discount type
    if (type === 'manual') {
      whereConditions.AND = [
        { manualDiscountAmount: { gt: 0 } },
      ];
    } else if (type === 'promo') {
      whereConditions.AND = [
        { promoDiscount: { gt: 0 } },
      ];
    }

    // Fetch orders with discounts
    const orders = await db.order.findMany({
      where: whereConditions,
      include: {
        cashier: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        branch: {
          select: {
            id: true,
            branchName: true,
          },
        },
      },
      orderBy: {
        orderTimestamp: 'desc',
      },
    });

    // Process discounts
    const discounts: any[] = [];

    for (const order of orders) {
      // If manual discount exists
      if (order.manualDiscountAmount && order.manualDiscountAmount > 0) {
        discounts.push({
          id: `${order.id}-manual`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderTimestamp: order.orderTimestamp.toISOString(),
          discountType: 'manual',
          discountPercent: order.manualDiscountPercent,
          discountAmount: order.manualDiscountAmount,
          promoCode: null,
          manualDiscountComment: order.manualDiscountComment,
          subtotal: order.subtotal || 0,
          totalAmount: order.totalAmount,
          cashierName: order.cashier?.name || order.cashier?.username || 'Unknown',
          branchName: order.branch?.branchName || 'Unknown',
          branchId: order.branchId,
        });
      }

      // If promo discount exists
      if (order.promoDiscount && order.promoDiscount > 0) {
        discounts.push({
          id: `${order.id}-promo`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderTimestamp: order.orderTimestamp.toISOString(),
          discountType: 'promo',
          discountPercent: null,
          discountAmount: order.promoDiscount,
          promoCode: order.promoCode || null,
          manualDiscountComment: null,
          subtotal: order.subtotal || 0,
          totalAmount: order.totalAmount,
          cashierName: order.cashier?.name || order.cashier?.username || 'Unknown',
          branchName: order.branch?.branchName || 'Unknown',
          branchId: order.branchId,
        });
      }
    }

    // Calculate summary
    const manualDiscounts = discounts.filter(d => d.discountType === 'manual');
    const promoDiscounts = discounts.filter(d => d.discountType === 'promo');

    const manualDiscountsCount = manualDiscounts.length;
    const manualDiscountsTotal = manualDiscounts.reduce((sum, d) => sum + d.discountAmount, 0);
    const promoDiscountsCount = promoDiscounts.length;
    const promoDiscountsTotal = promoDiscounts.reduce((sum, d) => sum + d.discountAmount, 0);
    const totalDiscounts = manualDiscountsTotal + promoDiscountsTotal;

    // Calculate average discount percentage (for manual discounts only)
    const manualDiscountsPercent = manualDiscounts.filter(d => d.discountPercent !== null && d.discountPercent > 0);
    const averageDiscountPercent = manualDiscountsPercent.length > 0
      ? manualDiscountsPercent.reduce((sum, d) => sum + (d.discountPercent || 0), 0) / manualDiscountsPercent.length
      : 0;

    const summary = {
      totalDiscounts,
      manualDiscountsCount,
      manualDiscountsTotal,
      promoDiscountsCount,
      promoDiscountsTotal,
      averageDiscountPercent,
    };

    return NextResponse.json({
      success: true,
      discounts,
      summary,
    });
  } catch (error) {
    console.error('Failed to fetch discounts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch discounts' },
      { status: 500 }
    );
  }
}
