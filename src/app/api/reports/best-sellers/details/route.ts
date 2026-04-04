import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Get order details for a specific product
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const period = searchParams.get('period') || 'last-7-days';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const branchId = searchParams.get('branchId');
    const category = searchParams.get('category');

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId is required' },
        { status: 400 }
      );
    }

    // Calculate date range based on period
    const now = new Date();
    let dateStart: Date;
    let dateEnd: Date;

    switch (period) {
      case 'last-7-days':
        dateStart = new Date(now);
        dateStart.setDate(now.getDate() - 7);
        dateStart.setHours(0, 0, 0, 0);
        dateEnd = new Date(now);
        dateEnd.setHours(23, 59, 59, 999);
        break;
      case 'last-month':
        dateStart = new Date(now);
        dateStart.setMonth(now.getMonth() - 1);
        dateStart.setDate(1);
        dateStart.setHours(0, 0, 0, 0);
        dateEnd = new Date(now);
        dateEnd.setDate(0); // Last day of previous month
        dateEnd.setHours(23, 59, 59, 999);
        break;
      case 'current-month':
        dateStart = new Date(now);
        dateStart.setDate(1);
        dateStart.setHours(0, 0, 0, 0);
        dateEnd = new Date(now);
        dateEnd.setHours(23, 59, 59, 999);
        break;
      case 'custom':
        if (!startDate || !endDate) {
          return NextResponse.json(
            { success: false, error: 'startDate and endDate are required for custom period' },
            { status: 400 }
          );
        }
        dateStart = new Date(startDate);
        dateStart.setHours(0, 0, 0, 0);
        dateEnd = new Date(endDate);
        dateEnd.setHours(23, 59, 59, 999);
        break;
      default:
        dateStart = new Date(now);
        dateStart.setDate(now.getDate() - 7);
        dateStart.setHours(0, 0, 0, 0);
        dateEnd = new Date(now);
        dateEnd.setHours(23, 59, 59, 999);
    }

    // Build filter conditions
    const whereClause: any = {
      orderTimestamp: {
        gte: dateStart,
        lte: dateEnd,
      },
      isRefunded: false,
    };

    if (branchId && branchId !== 'all') {
      whereClause.branchId = branchId;
    }

    // Fetch orders with items
    const orders = await db.order.findMany({
      where: whereClause,
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
        branch: {
          select: {
            branchName: true,
          },
        },
        cashier: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        orderTimestamp: 'desc',
      },
    });

    console.log('[Best Sellers Details] Fetching orders for product:', productId, {
      totalOrders: orders.length,
      period,
      category,
      branchId
    });

    // First, collect all order items for this product to analyze pricing patterns
    const allOrderItems: any[] = [];
    orders.forEach(order => {
      order.items.forEach((item: any) => {
        if (item.menuItemId !== productId) return;
        if (category && category !== 'all' && item.menuItem?.category !== category) return;
        allOrderItems.push({
          ...item,
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderTimestamp: order.orderTimestamp,
          branchName: order.branch?.branchName,
          cashierName: order.cashier?.name,
        });
      });
    });

    // Analyze pricing to detect if this is a weight-based item
    // If we see multiple different unit prices, it's likely weight-based
    const uniquePrices = [...new Set(allOrderItems.map(item => item.unitPrice))];
    const hasMultiplePrices = uniquePrices.length > 1;
    const basePricePerKG = allOrderItems[0]?.menuItem?.price || 0;

    // Determine if this is a weight-based item based on:
    // 1. Has multiple different unit prices, OR
    // 2. Any order has unitPrice different from basePrice, OR
    // 3. Any order has customVariantValue or variantName matching pattern
    const isWeightBasedItem = hasMultiplePrices ||
                               uniquePrices.some(price => price !== basePricePerKG && price < basePricePerKG) ||
                               allOrderItems.some(item =>
                                 (item.customVariantValue && item.customVariantValue > 0) ||
                                 item.variantName?.includes('وزن:') ||
                                 /:\s*[\d.]+x/.test(item.variantName || '')
                               );

    console.log('[Best Sellers Details] Weight-based detection:', {
      productId,
      uniquePrices,
      hasMultiplePrices,
      basePricePerKG,
      isWeightBasedItem
    });

    // Process orders to extract product details
    const productOrders: any[] = [];

    allOrderItems.forEach(item => {
      // Check if this specific order item is weight-based
      const isCustomInput = (item.customVariantValue && item.customVariantValue > 0) ||
                            item.variantName?.includes('وزن:') ||
                            /:\s*[\d.]+x/.test(item.variantName || '') ||
                            (isWeightBasedItem && item.unitPrice < basePricePerKG);

      // Calculate weight for custom input items
      let weight = 0;
      if (isCustomInput) {
        // First try to get weight from customVariantValue if available
        if (item.customVariantValue && item.customVariantValue > 0) {
          weight = item.customVariantValue;
          console.log('[Best Sellers Details] Using customVariantValue:', {
            itemName: item.menuItem?.name,
            customVariantValue: item.customVariantValue,
            calculatedWeight: weight
          });
        } else if (basePricePerKG > 0 && item.unitPrice > 0 && item.unitPrice < basePricePerKG) {
          // Calculate weight from price
          // Weight (KG) = (Unit Price / Base Price per KG) * Quantity
          const unitPrice = item.unitPrice;
          const multiplier = unitPrice / basePricePerKG;
          weight = multiplier * item.quantity;

          console.log('[Best Sellers Details] Calculated weight from price:', {
            itemName: item.menuItem?.name,
            basePricePerKG,
            unitPrice,
            quantity: item.quantity,
            multiplier,
            calculatedWeight: weight
          });
        } else {
          console.log('[Best Sellers Details] Cannot calculate weight:', {
            itemName: item.menuItem?.name,
            basePricePerKG,
            unitPrice: item.unitPrice,
            variantName: item.variantName
          });

          // Last resort: try to extract from variantName
          let weightMatch = item.variantName?.match(/وزن:\s*([\d.]+)x/);
          if (!weightMatch) {
            weightMatch = item.variantName?.match(/:\s*([\d.]+)x/);
          }
          if (weightMatch) {
            const weightMultiplier = parseFloat(weightMatch[1]);
            weight = item.quantity * weightMultiplier;
            console.log('[Best Sellers Details] Extracted from variantName:', { weight, weightMultiplier });
          }
        }
      }

      productOrders.push({
        orderId: item.orderId,
        orderNumber: item.orderNumber,
        orderTimestamp: item.orderTimestamp,
        quantity: item.quantity,
        weight: weight,
        subtotal: item.subtotal || (item.quantity * item.unitPrice),
        branchName: item.branchName,
        cashierName: item.cashierName,
        variantName: item.variantName,
        isCustomInput: isCustomInput,
      });
    });

    // Sort by timestamp (newest first)
    productOrders.sort((a, b) =>
      new Date(b.orderTimestamp).getTime() - new Date(a.orderTimestamp).getTime()
    );

    console.log('[Best Sellers Details] Result:', {
      productId,
      orderCount: productOrders.length,
      orders: productOrders.slice(0, 5) // Log first 5 for debugging
    });

    return NextResponse.json({
      success: true,
      data: {
        orders: productOrders,
      },
    });
  } catch (error) {
    console.error('Best sellers details error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch product order details' },
      { status: 500 }
    );
  }
}
