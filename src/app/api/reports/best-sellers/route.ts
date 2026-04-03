import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Best Sellers Report
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'last-7-days';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const branchId = searchParams.get('branchId');

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

    // Build branch filter
    const branchFilter: any = {};
    if (branchId && branchId !== 'all') {
      branchFilter.branchId = branchId;
    }

    // Fetch all orders with items in the date range
    const orders = await db.order.findMany({
      where: {
        orderTimestamp: {
          gte: dateStart,
          lte: dateEnd,
        },
        ...branchFilter,
        isRefunded: false,
      },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
      },
    });

    // Aggregate product data
    const productStats = new Map<string, any>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const menuItem = (item as any).menuItem;
        if (!menuItem) return;

        const key = menuItem.id;
        const isCustomInput = item.variantName?.includes('وزن:') || false;

        if (!productStats.has(key)) {
          productStats.set(key, {
            id: menuItem.id,
            name: menuItem.name,
            category: menuItem.category,
            price: menuItem.price,
            hasVariants: menuItem.hasVariants,
            totalQuantity: 0,
            totalRevenue: 0,
            totalWeight: 0,
            variants: new Map<string, number>(),
            isCustomInput: false,
            orders: 0,
          });
        }

        const stats = productStats.get(key);

        // Update total quantity and revenue
        stats.totalQuantity += item.quantity;
        stats.totalRevenue += item.subtotal || (item.quantity * item.unitPrice);
        stats.orders += 1;

        // Handle custom input items (weight-based)
        if (isCustomInput && item.customVariantValue) {
          stats.isCustomInput = true;
          // customVariantValue is in KG, convert to KG
          const weightInKG = item.quantity * item.customVariantValue;
          stats.totalWeight += weightInKG;
        }

        // Handle variant items
        if (item.variantName && !isCustomInput) {
          const variantKey = item.variantName;
          stats.variants.set(variantKey, (stats.variants.get(variantKey) || 0) + item.quantity);
        }
      });
    });

    // Convert to array and format
    const products = Array.from(productStats.values()).map(p => {
      // Calculate price: for regular items, use average unit price, for custom input, calculate price per KG
      let price = p.price;
      if (p.isCustomInput && p.totalWeight > 0) {
        // For weight-based items, calculate price per KG
        price = p.totalRevenue / p.totalWeight;
      } else if (p.totalQuantity > 0 && p.totalRevenue > 0) {
        // Use average unit price
        price = p.totalRevenue / p.totalQuantity;
      }

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        price: price || 0,
        hasVariants: p.hasVariants,
        totalQuantity: p.totalQuantity,
        totalRevenue: p.totalRevenue,
        totalWeight: p.totalWeight,
        isCustomInput: p.isCustomInput,
        variants: Array.from(p.variants.entries()).map(([variant, quantity]) => ({
          name: variant,
          quantity,
        })),
        orders: p.orders,
      };
    });

    // Sort by revenue (highest first)
    products.sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Calculate summary stats
    const totalSales = products.reduce((sum, p) => sum + p.totalRevenue, 0);
    const totalItems = products.reduce((sum, p) => sum + p.totalQuantity, 0);
    const totalWeight = products.reduce((sum, p) => sum + p.totalWeight, 0);
    const topProduct = products.length > 0 ? products[0] : null;

    return NextResponse.json({
      success: true,
      data: {
        products,
        summary: {
          totalSales,
          totalItems,
          totalWeight,
          totalProducts: products.length,
          topProduct: topProduct ? {
            name: topProduct.name,
            revenue: topProduct.totalRevenue,
            quantity: topProduct.totalQuantity,
          } : null,
        },
      },
    });
  } catch (error) {
    console.error('Best sellers report error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch best sellers report' },
      { status: 500 }
    );
  }
}
