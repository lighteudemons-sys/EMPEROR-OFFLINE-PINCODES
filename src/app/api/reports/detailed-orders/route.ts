import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const branchId = searchParams.get('branchId');
    const format = searchParams.get('format') || 'json';

    // Build where clause using orderTimestamp
    const whereClause: any = {};

    if (startDate || endDate) {
      whereClause.orderTimestamp = {};
      if (startDate) {
        whereClause.orderTimestamp.gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        whereClause.orderTimestamp.lte = endDateTime;
      }
    }

    if (branchId && branchId !== 'all') {
      whereClause.branchId = branchId;
    }

    // Fetch orders with full details
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
            username: true,
          },
        },
        customer: {
          select: {
            name: true,
            phone: true,
          },
        },
        deliveryArea: {
          select: {
            name: true,
            fee: true,
          },
        },
      },
      orderBy: {
        orderTimestamp: 'desc',
      },
    });

    // Fetch all recipes and ingredients for cost calculation
    const recipes = await db.recipe.findMany({
      include: {
        ingredient: true,
        variant: true,
      },
    });

    // Build recipe map: menuItemId -> menuItemVariantId -> ingredientId -> quantity
    const recipeMap = new Map<string, Map<string | null, Map<string, number>>>();
    recipes.forEach(recipe => {
      if (!recipeMap.has(recipe.menuItemId)) {
        recipeMap.set(recipe.menuItemId, new Map());
      }
      const variantMap = recipeMap.get(recipe.menuItemId)!;
      if (!variantMap.has(recipe.menuItemVariantId)) {
        variantMap.set(recipe.menuItemVariantId, new Map());
      }
      const ingredientMap = variantMap.get(recipe.menuItemVariantId)!;
      ingredientMap.set(recipe.ingredientId, recipe.quantityRequired);
    });

    // Build ingredient cost map
    const ingredientCostMap = new Map<string, number>();
    recipes.forEach(recipe => {
      if (recipe.ingredient && recipe.ingredient.costPerUnit) {
        ingredientCostMap.set(recipe.ingredientId, recipe.ingredient.costPerUnit);
      }
    });

    // Helper function to extract custom variant value from variantName or price
    // Handles patterns like "وزن: 0.133x" or infers from price ratio
    const extractVariantMultiplier = (item: any): number => {
      // First, check if customVariantValue is already stored
      if (item.customVariantValue && item.customVariantValue > 0) {
        return item.customVariantValue;
      }

      // Try to extract from variantName for old orders
      if (item.variantName) {
        // Pattern: Look for a number followed by 'x' at the end
        // Examples: "وزن: 0.133x" -> 0.133, "0.1333333333333333x" -> 0.1333333333333333
        const match = item.variantName.match(/(\d+\.?\d*)\s*x$/i);
        if (match && match[1]) {
          const multiplier = parseFloat(match[1]);
          if (!isNaN(multiplier) && multiplier > 0) {
            console.log(`[Detailed Report] Extracted variant multiplier from variantName:`, {
              itemId: item.id,
              variantName: item.variantName,
              extractedMultiplier: multiplier
            });
            return multiplier;
          }
        }
      }

      // Try to infer from price ratio (for old orders without variantName)
      if (item.menuItem && item.unitPrice && item.unitPrice > 0 && item.menuItem.price > 0) {
        const priceRatio = item.unitPrice / item.menuItem.price;
        // Only use this if the ratio is less than 1 (suggests partial portion)
        // and greater than 0.01 (not zero or extremely small)
        if (priceRatio > 0 && priceRatio < 0.95) {
          console.log(`[Detailed Report] Inferred variant multiplier from price ratio:`, {
            itemId: item.id,
            itemName: item.itemName,
            unitPrice: item.unitPrice,
            basePrice: item.menuItem.price,
            priceRatio: priceRatio,
            inferredMultiplier: priceRatio
          });
          return priceRatio;
        }
      }

      // Default to 1 (full unit)
      return 1;
    };

    // Calculate product costs for each order item
    const ordersWithCosts = orders.map(order => {
      const itemsWithCosts = order.items.map(item => {
        let itemProductCost = 0;
        let itemProfit = item.subtotal;

        // Get the appropriate recipe map
        const variantMap = recipeMap.get(item.menuItemId);
        if (variantMap) {
          // Try to find recipe for specific variant first, then fall back to base item
          let ingredientMap = variantMap.get(item.menuItemVariantId);
          if (!ingredientMap) {
            ingredientMap = variantMap.get(null);
          }

          if (ingredientMap) {
            // Extract variant multiplier (from stored value or parsed from variantName)
            const variantMultiplier = extractVariantMultiplier(item);

            ingredientMap.forEach((quantity, ingredientId) => {
              const costPerUnit = ingredientCostMap.get(ingredientId) || 0;
              // Scale the recipe quantity by the custom variant value
              const adjustedQuantity = quantity * variantMultiplier;
              itemProductCost += adjustedQuantity * costPerUnit;
            });

            // Calculate profit for this item (revenue - cost * quantity)
            itemProfit = item.subtotal - (itemProductCost * item.quantity);
          }
        }

        return {
          ...item,
          productCost: itemProductCost * item.quantity,
          productCostPerUnit: itemProductCost,
          profit: itemProfit,
          margin: item.subtotal > 0 ? (itemProfit / item.subtotal) * 100 : 0,
        };
      });

      const totalProductCost = itemsWithCosts.reduce((sum, item) => sum + item.productCost, 0);
      const totalProfit = order.subtotal - totalProductCost;
      const profitMargin = order.subtotal > 0 ? (totalProfit / order.subtotal) * 100 : 0;

      return {
        ...order,
        items: itemsWithCosts,
        totalProductCost,
        totalProfit,
        profitMargin,
      };
    });

    // Return in requested format
    if (format === 'excel' || format === 'csv') {
      return generateDetailedCSV(ordersWithCosts);
    } else {
      return NextResponse.json({
        success: true,
        data: ordersWithCosts,
        summary: {
          totalOrders: ordersWithCosts.length,
          totalRevenue: ordersWithCosts.reduce((sum, order) => sum + order.subtotal, 0),
          totalProductCost: ordersWithCosts.reduce((sum, order) => sum + order.totalProductCost, 0),
          totalProfit: ordersWithCosts.reduce((sum, order) => sum + order.totalProfit, 0),
        },
      });
    }
  } catch (error) {
    console.error('Detailed orders export error:', error);
    return NextResponse.json(
      { error: 'Failed to export detailed orders', details: error.message },
      { status: 500 }
    );
  }
}

function generateDetailedCSV(orders: any[]) {
  // Create CSV header with detailed columns
  const headers = [
    'Order #',
    'Date',
    'Time',
    'Cashier',
    'Branch',
    'Type',
    'Payment',
    'Item Name',
    'Item Quantity',
    'Item Unit Price',
    'Item Subtotal',
    'Product Cost',
    'Item Profit',
    'Margin %',
    'Variant',
    'Custom Value',
    'Customer',
    'Customer Phone',
    'Order Subtotal',
    'Order Product Cost',
    'Order Profit',
    'Profit Margin %',
    'Delivery Fee',
    'Total Amount',
    'Status',
  ];

  // Create CSV rows (one row per order item)
  const rows: any[] = [];
  orders.forEach((order) => {
    const orderDate = new Date(order.orderTimestamp);
    const dateStr = orderDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const timeStr = orderDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // If order has items, create a row for each item
    if (order.items && order.items.length > 0) {
      order.items.forEach((item: any) => {
        rows.push([
          order.orderNumber,
          dateStr,
          timeStr,
          order.cashier?.name || 'N/A',
          order.branch?.branchName || 'N/A',
          order.orderType,
          order.paymentMethod,
          `"${item.itemName || ''}"`, // Quote item name
          item.quantity,
          item.unitPrice?.toFixed(2) || '0.00',
          item.subtotal?.toFixed(2) || '0.00',
          item.productCost?.toFixed(2) || '0.00',
          item.profit?.toFixed(2) || '0.00',
          item.margin?.toFixed(2) || '0.00',
          `"${item.variantName || ''}"`,
          item.customVariantValue || '',
          `"${order.customer?.name || ''}"`,
          `"${order.customer?.phone || ''}"`,
          order.subtotal?.toFixed(2) || '0.00',
          order.totalProductCost?.toFixed(2) || '0.00',
          order.totalProfit?.toFixed(2) || '0.00',
          order.profitMargin?.toFixed(2) || '0.00',
          order.deliveryFee?.toFixed(2) || '0.00',
          order.totalAmount?.toFixed(2) || '0.00',
          order.isRefunded ? 'Refunded' : 'Completed',
        ]);
      });
    } else {
      // Order with no items
      rows.push([
        order.orderNumber,
        dateStr,
        timeStr,
        order.cashier?.name || 'N/A',
        order.branch?.branchName || 'N/A',
        order.orderType,
        order.paymentMethod,
        '', // No item name
        '', // No quantity
        '', // No unit price
        '', // No subtotal
        '', // No product cost
        '', // No profit
        '', // No margin
        '', // No variant
        '', // No custom value
        `"${order.customer?.name || ''}"`,
        `"${order.customer?.phone || ''}"`,
        order.subtotal?.toFixed(2) || '0.00',
        order.totalProductCost?.toFixed(2) || '0.00',
        order.totalProfit?.toFixed(2) || '0.00',
        order.profitMargin?.toFixed(2) || '0.00',
        order.deliveryFee?.toFixed(2) || '0.00',
        order.totalAmount?.toFixed(2) || '0.00',
        order.isRefunded ? 'Refunded' : 'Completed',
      ]);
    }
  });

  // Combine headers and rows
  const csvContent = [headers, ...rows]
    .map(row => row.join(','))
    .join('\n');

  // Add BOM for UTF-8 encoding (required for Excel to properly display Arabic)
  const BOM = '\uFEFF';

  // Return as CSV text with UTF-8 BOM
  return new NextResponse(BOM + csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="detailed-orders-export-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
