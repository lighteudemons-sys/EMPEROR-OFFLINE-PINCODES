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
    const category = searchParams.get('category');

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
        // Check if this is a weight-based item (custom input)
        // Primary indicator: customVariantValue exists and is > 0
        // Fallback: variantName contains "وزن:" (Arabic for weight) or matches pattern like "Type: 0.125x"
        const isCustomInput = (item.customVariantValue && item.customVariantValue > 0) ||
                              item.variantName?.includes('وزن:') ||
                              /:\s*[\d.]+x/.test(item.variantName || '') || false;

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
        if (isCustomInput) {
          stats.isCustomInput = true;

          // Extract weight from variantName or calculate from price
          let weightInKG = 0;

          if (item.customVariantValue && item.customVariantValue > 0) {
            // customVariantValue should be the weight per order item (total weight for this line item)
            weightInKG = item.customVariantValue;
          } else {
            // Calculate weight from price
            // Weight (KG) = (Unit Price / Base Price per KG) * Quantity
            const basePricePerKG = menuItem.price;
            const unitPrice = item.unitPrice || (item.subtotal / item.quantity);

            console.log('[Best Sellers] Weight calculation attempt:', {
              name: menuItem.name,
              basePricePerKG,
              unitPrice,
              subtotal: item.subtotal,
              quantity: item.quantity,
              variantName: item.variantName
            });

            if (basePricePerKG > 0 && unitPrice > 0) {
              // Calculate the multiplier (what fraction of 1 KG this order represents)
              const multiplier = unitPrice / basePricePerKG;
              // Total weight = multiplier * quantity
              weightInKG = multiplier * item.quantity;

              console.log('[Best Sellers] Calculated weight from price:', {
                name: menuItem.name,
                basePricePerKG,
                unitPrice,
                quantity: item.quantity,
                multiplier,
                calculatedWeight: weightInKG
              });
            } else {
              console.log('[Best Sellers] Cannot calculate from price, basePricePerKG or unitPrice is 0:', {
                name: menuItem.name,
                basePricePerKG,
                unitPrice
              });
              // Last resort: try to extract from variantName
              let weightMatch = item.variantName?.match(/وزن:\s*([\d.]+)x/);
              if (!weightMatch) {
                weightMatch = item.variantName?.match(/:\s*([\d.]+)x/);
              }
              if (weightMatch) {
                const weightMultiplier = parseFloat(weightMatch[1]);
                weightInKG = item.quantity * weightMultiplier;

                console.log('[Best Sellers] Extracted weight from variantName:', {
                  name: menuItem.name,
                  variantName: item.variantName,
                  weightMultiplier,
                  quantity: item.quantity,
                  calculatedWeight: weightInKG
                });
              } else {
                console.log('[Best Sellers] Could not extract weight from variantName:', {
                  name: menuItem.name,
                  variantName: item.variantName
                });
              }
            }
          }

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

    // Filter by category if specified
    let filteredProducts = products;
    if (category && category !== 'all') {
      filteredProducts = products.filter(p => p.category === category);
    }

    // Sort by revenue (highest first)
    filteredProducts.sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Calculate summary stats (based on filtered products)
    const totalSales = filteredProducts.reduce((sum, p) => sum + p.totalRevenue, 0);
    const totalItems = filteredProducts.reduce((sum, p) => sum + p.totalQuantity, 0);
    const totalWeight = filteredProducts.reduce((sum, p) => sum + p.totalWeight, 0);
    const topProduct = filteredProducts.length > 0 ? filteredProducts[0] : null;

    return NextResponse.json({
      success: true,
      data: {
        products: filteredProducts,
        summary: {
          totalSales,
          totalItems,
          totalWeight,
          totalProducts: filteredProducts.length,
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
