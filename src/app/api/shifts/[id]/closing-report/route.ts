import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/shifts/[id]/closing-report
// Get detailed closing shift report with payment and item breakdowns
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shiftId } = await params;

    // Get shift with all related data
    const shift = await db.shift.findUnique({
      where: { id: shiftId },
      include: {
        cashier: {
          select: {
            id: true,
            name: true,
            username: true
          }
        },
        branch: {
          select: {
            id: true,
            branchName: true
          }
        },
        orders: {
          include: {
            items: {
              include: {
                menuItem: {
                  select: {
                    id: true,
                    name: true,
                    category: true,
                    categoryId: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!shift) {
      return NextResponse.json({
        success: false,
        error: 'Shift not found'
      }, { status: 404 });
    }

    // Calculate payment breakdown with card details
    let cashTotal = 0;
    let cardTotal = 0;
    let instapayTotal = 0;
    let walletTotal = 0;
    let otherTotal = 0;

    shift.orders.forEach(order => {
      const method = order.paymentMethod.toLowerCase();
      if (method === 'cash') {
        cashTotal += order.totalAmount;
      } else if (method === 'card') {
        // Break down card payments by detail
        const detail = order.paymentMethodDetail?.toUpperCase();
        if (detail === 'INSTAPAY') {
          instapayTotal += order.totalAmount;
        } else if (detail === 'MOBILE_WALLET') {
          walletTotal += order.totalAmount;
        } else {
          // Default to CARD for regular card payments
          cardTotal += order.totalAmount;
        }
      } else if (method.includes('visa') || method.includes('credit')) {
        cardTotal += order.totalAmount;
      } else {
        otherTotal += order.totalAmount;
      }
    });

    // Calculate order type breakdown
    const orderTypeBreakdown = {
      'take-away': { value: 0, discounts: 0, count: 0, total: 0 },
      'dine-in': { value: 0, discounts: 0, count: 0, total: 0 },
      'delivery': { value: 0, discounts: 0, count: 0, total: 0 }
    };

    let totalDiscounts = 0;
    let totalDeliveryFees = 0;
    let totalRefunds = 0;
    let totalSales = 0;

    shift.orders.forEach(order => {
      if (order.isRefunded) {
        // Skip refunded orders from sales calculations
        // Refunds are now calculated based on when they were performed (not order creation)
        return;
      }

      const type = order.orderType || 'dine-in';
      if (orderTypeBreakdown[type]) {
        orderTypeBreakdown[type].value += order.subtotal;
        orderTypeBreakdown[type].count += 1;
        totalSales += order.subtotal;
      }

      // Add discounts (both promo, loyalty, and manual)
      const orderDiscount = (order.promoDiscount || 0) + (order.loyaltyDiscount || 0) + (order.manualDiscountAmount || 0);
      if (orderTypeBreakdown[type]) {
        orderTypeBreakdown[type].discounts += orderDiscount;
      }
      totalDiscounts += orderDiscount;

      // Add delivery fees
      totalDeliveryFees += order.deliveryFee || 0;
    });

    // Calculate totals per order type
    Object.keys(orderTypeBreakdown).forEach(type => {
      orderTypeBreakdown[type].total = orderTypeBreakdown[type].value - orderTypeBreakdown[type].discounts;
    });

    // Normalize category name
    const normalizeCategory = (category: string | null | undefined): string => {
      if (!category) return 'Uncategorized';
      return category.trim().replace(/\s+/g, ' ');
    };

    // Detect if an item is a custom input (weight-based) item
    const isCustomInputItem = (orderItem: any): boolean => {
      return !!(orderItem.variantName && orderItem.variantName.includes('وزن:'));
    };

    // Extract weight from variant name (e.g., "وزن: 0.125x (125g)" -> 0.125)
    const extractWeight = (variantName: string): number => {
      const match = variantName.match(/وزن:\s*([\d.]+)x/);
      return match ? parseFloat(match[1]) : 0;
    };

    // Get display name for item (including variant if present)
    const getItemDisplayName = (orderItem: any): string => {
      const baseName = orderItem.menuItem?.name || orderItem.itemName;
      const variant = orderItem.variantName;
      return variant ? `${baseName} - ${variant}` : baseName;
    };

    // Get aggregation key for custom input items
    const getAggregationKey = (orderItem: any): { key: string; baseName: string; isCustomInput: boolean } => {
      const isCustom = isCustomInputItem(orderItem);
      if (!isCustom) {
        // For regular items, use the full display name
        return {
          key: orderItem.menuItemId + (orderItem.menuItemVariantId ? `_${orderItem.menuItemVariantId}` : ''),
          baseName: getItemDisplayName(orderItem),
          isCustomInput: false
        };
      }

      // For custom input items, extract base name without weight
      const baseName = orderItem.menuItem?.name || orderItem.itemName;
      const variant = orderItem.variantName || '';
      // Remove weight pattern to get the base variant name
      const baseVariant = variant.replace(/\s*-\s*وزن:\s*[\d.]+x\s*\(\d+g\)/g, '');
      const displayName = baseVariant ? `${baseName} - ${baseVariant}`.trim() : baseName;

      return {
        key: `custom_${orderItem.menuItemId}_${displayName.replace(/\s+/g, '_')}`,
        baseName: displayName,
        isCustomInput: true
      };
    };

    // Group items by category
    const categoryBreakdown = new Map<string, {
      categoryName: string;
      totalSales: number;
      items: Map<string, {
        itemId: string;
        itemName: string;
        quantity: number;
        totalPrice: number;
        isCustomInput: boolean;
        totalWeight?: number; // For custom input items in KG
      }>;
    }>();

    shift.orders.forEach(order => {
      if (order.isRefunded) return; // Skip refunded orders

      order.items.forEach(orderItem => {
        const category = normalizeCategory(orderItem.menuItem?.category);

        if (!categoryBreakdown.has(category)) {
          categoryBreakdown.set(category, {
            categoryName: category,
            totalSales: 0,
            items: new Map()
          });
        }

        const catData = categoryBreakdown.get(category)!;
        catData.totalSales += orderItem.subtotal;

        const aggKey = getAggregationKey(orderItem);

        if (!catData.items.has(aggKey.key)) {
          catData.items.set(aggKey.key, {
            itemId: aggKey.key,
            itemName: aggKey.baseName,
            quantity: 0,
            totalPrice: 0,
            isCustomInput: aggKey.isCustomInput,
            totalWeight: aggKey.isCustomInput ? 0 : undefined
          });
        }

        const itemData = catData.items.get(aggKey.key)!;
        itemData.quantity += orderItem.quantity;
        itemData.totalPrice += orderItem.subtotal;

        // For custom input items, accumulate weight
        if (aggKey.isCustomInput && itemData.totalWeight !== undefined) {
          const weight = extractWeight(orderItem.variantName || '');
          itemData.totalWeight += weight * orderItem.quantity;
        }
      });
    });

    // Convert to array and sort
    const categories = Array.from(categoryBreakdown.values())
      .filter(cat => cat.totalSales > 0)
      .map(cat => ({
        categoryName: cat.categoryName,
        totalSales: cat.totalSales,
        items: Array.from(cat.items.values()).map(item => ({
          itemId: item.itemId,
          itemName: item.itemName,
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          isCustomInput: item.isCustomInput,
          totalWeight: item.totalWeight
        }))
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    // Get daily expenses for this shift
    const dailyExpenses = await db.dailyExpense.findMany({
      where: {
        shiftId: shiftId
      }
    });
    const totalDailyExpenses = dailyExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Get all order IDs for this shift to find all related refunds/voids
    const shiftOrderIds = shift.orders.map(o => o.id);

    // Get voided items for orders that belong to this shift
    // This includes voids that happened even after the shift was closed
    const voidedItems = await db.voidedItem.findMany({
      where: {
        orderItem: {
          orderId: {
            in: shiftOrderIds
          }
        }
      },
      orderBy: { voidedAt: 'desc' },
      include: {
        orderItem: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                orderTimestamp: true
              }
            }
          }
        }
      }
    });

    const totalVoidedAmount = voidedItems.reduce((sum, item) => sum + item.voidedSubtotal, 0);

    // Get orders that belong to this shift and were refunded
    // This includes refunds that happened even after the shift was closed
    const refundedOrders = await db.order.findMany({
      where: {
        id: {
          in: shiftOrderIds
        },
        isRefunded: true
      },
      select: {
        id: true,
        orderNumber: true,
        orderTimestamp: true,
        totalAmount: true,
        refundReason: true,
        refundedAt: true,
        paymentMethod: true
      }
    });

    // Calculate total refunds from orders that belong to this shift
    totalRefunds = refundedOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // Debug logging
    console.log('[Shift Closing Report] Shift:', {
      id: shift.id,
      branchId: shift.branchId,
      startTime: shift.startTime,
      endTime: shift.endTime,
      ordersCount: shift.orders.length
    });

    console.log('[Shift Closing Report] Orders:', shift.orders.map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      itemsCount: o.items.length,
      isRefunded: o.isRefunded
    })));

    console.log('[Shift Closing Report] Order Items:', shift.orders.flatMap(o => o.items).map(item => ({
      id: item.id,
      menuItemId: item.menuItemId,
      itemName: item.itemName,
      menuItem: item.menuItem ? {
        id: item.menuItem.id,
        name: item.menuItem.name,
        category: item.menuItem.category
      } : null,
      quantity: item.quantity,
      subtotal: item.subtotal
    })));

    console.log('[Shift Closing Report] Category Breakdown before filtering:', categories.map(c => ({
      category: c.categoryName,
      itemsCount: c.items.length,
      totalSales: c.totalSales
    })));

    console.log('[Shift Closing Report] Final category breakdown after filtering:', {
      totalCategories: categories.length,
      categories: categories
    });

    console.log('[Shift Closing Report] Voided Items:', {
      count: voidedItems.length,
      totalAmount: totalVoidedAmount,
      items: voidedItems.map(v => ({
        id: v.id,
        voidedAt: v.voidedAt,
        voidedSubtotal: v.voidedSubtotal,
        orderId: v.orderItem.order.id,
        orderNumber: v.orderItem.order.orderNumber
      }))
    });
    console.log('[Shift Closing Report] Refunded Orders:', {
      count: refundedOrders.length,
      totalAmount: totalRefunds,
      orders: refundedOrders.map(ro => ({
        id: ro.id,
        orderNumber: ro.orderNumber,
        refundedAt: ro.refundedAt
      }))
    });

    // Get order IDs for this shift (for loyalty and promo filtering)
    const orderIds = shift.orders.map(o => o.id);

    // Get loyalty transactions for orders made during this shift
    const loyaltyTransactions = orderIds.length > 0 ? await db.loyaltyTransaction.findMany({
      where: {
        orderId: {
          in: orderIds
        },
      },
      orderBy: { createdAt: 'desc' },
    }) : [];

    const totalLoyaltyDiscounts = loyaltyTransactions
      .filter(tx => tx.type === 'REDEEMED')
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);

    // Get promo code usage for orders made during this shift
    const promoUsages = orderIds.length > 0 ? await db.promotionUsageLog.findMany({
      where: {
        orderId: {
          in: orderIds
        },
      },
      orderBy: { usedAt: 'desc' },
    }) : [];

    const totalPromoDiscounts = promoUsages.reduce((sum, usage) => sum + usage.discountAmount, 0);

    // Calculate cash balance (subtract daily expenses, voided items, and refunds)
    const expectedCash = shift.openingCash + cashTotal - totalDailyExpenses - totalVoidedAmount - totalRefunds;
    const overShort = shift.closingCash ? shift.closingCash - expectedCash : null;

    // Generate shift number from orders count or closing orders
    const shiftNumber = Math.max(shift.openingOrders, shift.closingOrders || 0, shift.orders.length);

    // Create order map for looking up order details
    const orderMap = new Map(shift.orders.map(o => [o.id, o]));

    // Create refunded order map for looking up details
    const refundedOrderMap = new Map(refundedOrders.map(o => [o.id, o]));

    // Generate report
    const report = {
      shift: {
        id: shift.id,
        shiftNumber,
        startTime: shift.startTime,
        endTime: shift.endTime,
        cashier: shift.cashier,
        branch: shift.branch,
        openingCash: shift.openingCash,
        closingCash: shift.closingCash,
        openingOrders: shift.openingOrders,
        closingOrders: shift.closingOrders,
        openingRevenue: shift.openingRevenue,
        closingRevenue: shift.closingRevenue,
        notes: shift.notes
      },
      paymentSummary: {
        cash: cashTotal,
        card: cardTotal,
        instapay: instapayTotal,
        wallet: walletTotal,
        other: otherTotal,
        total: cashTotal + cardTotal + instapayTotal + walletTotal + otherTotal
      },
      orderTypeBreakdown,
      totals: {
        sales: totalSales,
        discounts: totalDiscounts,
        deliveryFees: totalDeliveryFees,
        refunds: totalRefunds,
        voidedItems: totalVoidedAmount,
        loyaltyDiscounts: totalLoyaltyDiscounts,
        promoDiscounts: totalPromoDiscounts,
        card: cardTotal,
        instapay: instapayTotal,
        wallet: walletTotal,
        cash: cashTotal,
        dailyExpenses: totalDailyExpenses,
        openingCashBalance: shift.openingCash,
        expectedCash: expectedCash,
        closingCashBalance: shift.closingCash || 0,
        overShort: overShort
      },
      categoryBreakdown: categories,
      voidedItems: voidedItems.map(vi => {
        return {
          id: vi.id,
          itemName: vi.orderItem.itemName,
          voidedQuantity: vi.voidedQuantity,
          unitPrice: vi.unitPrice,
          voidedSubtotal: vi.voidedSubtotal,
          reason: vi.reason,
          voidedBy: vi.voidedBy,
          voidedAt: vi.voidedAt,
          orderNumber: vi.orderItem.order.orderNumber,
          orderTimestamp: vi.orderItem.order.orderTimestamp,
        };
      }),
      refundedOrders: refundedOrders.map(ro => ({
        id: ro.id,
        orderNumber: ro.orderNumber,
        orderTimestamp: ro.orderTimestamp,
        refundAmount: ro.totalAmount,
        refundReason: ro.refundReason,
        refundedAt: ro.refundedAt,
        paymentMethod: ro.paymentMethod
      })),
      loyaltyTransactions: loyaltyTransactions.map(lt => {
        const order = orderMap.get(lt.orderId || '');
        return {
          id: lt.id,
          customerId: lt.customerId,
          points: lt.points,
          type: lt.type,
          amount: lt.amount,
          notes: lt.notes,
          createdAt: lt.createdAt,
          orderNumber: order?.orderNumber,
        };
      }),
      promoUsages: promoUsages.map(pu => {
        const order = orderMap.get(pu.orderId || '');
        return {
          id: pu.id,
          code: pu.code,
          discountAmount: pu.discountAmount,
          orderSubtotal: pu.orderSubtotal,
          usedAt: pu.usedAt,
          orderNumber: order?.orderNumber,
        };
      })
    };

    return NextResponse.json({
      success: true,
      report
    });
  } catch (error: any) {
    console.error('[Shift Closing Report Error]', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate shift closing report',
      details: error.message
    }, { status: 500 });
  }
}
