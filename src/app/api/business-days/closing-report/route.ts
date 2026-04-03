import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/business-days/closing-report?businessDayId=xxx
// Get detailed closing day report with category breakdown
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessDayId = searchParams.get('businessDayId');

    if (!businessDayId) {
      return NextResponse.json({
        success: false,
        error: 'Business Day ID is required'
      }, { status: 400 });
    }

    // Get business day with full details
    const businessDay = await db.businessDay.findUnique({
      where: { id: businessDayId },
      include: {
        openedByUser: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true
          }
        },
        closedByUser: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true
          }
        },
        shifts: {
          include: {
            cashier: {
              select: {
                id: true,
                name: true,
                username: true
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
          },
          orderBy: {
            startTime: 'asc'
          }
        }
      }
    });

    if (!businessDay) {
      return NextResponse.json({
        success: false,
        error: 'Business day not found'
      }, { status: 404 });
    }

    // Get branch information separately
    const branch = await db.branch.findUnique({
      where: { id: businessDay.branchId },
      select: {
        id: true,
        branchName: true
      }
    });

    // Get all orders for this business day
    const allOrders = await db.order.findMany({
      where: {
        shiftId: {
          in: businessDay.shifts.map(s => s.id)
        }
      },
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
      },
      orderBy: {
        orderTimestamp: 'asc'
      }
    });

    // Calculate payment breakdown with card details
    let cashTotal = 0;
    let cardTotal = 0;
    let instapayTotal = 0;
    let walletTotal = 0;

    allOrders.forEach(order => {
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
      }
    });

    // Normalize category name (trim and use consistent format)
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

    // Group items by category using normalized names
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

    allOrders.forEach(order => {
      // Skip refunded orders from item summary
      if (order.isRefunded) {
        return;
      }

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

    // Convert Map to array and filter categories with zero sales
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

    // Get refunds
    const refunds = allOrders.filter(o => o.isRefunded);

    // Get daily expenses for all shifts in this business day
    const shiftIds = businessDay.shifts.map(s => s.id);
    const allDailyExpenses = await db.dailyExpense.findMany({
      where: {
        shiftId: {
          in: shiftIds
        }
      }
    });

    // Group expenses by shift
    const expensesByShift = new Map<string, number>();
    allDailyExpenses.forEach(expense => {
      const current = expensesByShift.get(expense.shiftId) || 0;
      expensesByShift.set(expense.shiftId, current + expense.amount);
    });

    // Calculate total daily expenses for the day
    const totalDailyExpensesDay = allDailyExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Get all order IDs for this business day
    const allShiftOrderIds = businessDay.shifts.flatMap(shift => shift.orders.map(o => o.id));

    // Get all voided items for this business day in one query
    const allVoidedItems = await db.voidedItem.findMany({
      where: {
        orderItem: {
          orderId: {
            in: allShiftOrderIds
          }
        }
      }
    });

    // Create a map of order IDs to their voided items for quick lookup
    const voidedItemsByOrderId = new Map<string, typeof allVoidedItems>();
    allVoidedItems.forEach(vi => {
      const orderId = vi.orderItem.orderId;
      if (!voidedItemsByOrderId.has(orderId)) {
        voidedItemsByOrderId.set(orderId, []);
      }
      voidedItemsByOrderId.get(orderId)!.push(vi);
    });

    // Calculate shift data for new DayClosingReceipt format
    const shiftsData = businessDay.shifts.map((shift, index) => {
      const shiftOrders = shift.orders.filter(o => !o.isRefunded);
      const shiftDailyExpenses = expensesByShift.get(shift.id) || 0;

      // Calculate order type breakdown for this shift
      const orderTypeBreakdown = {
        'take-away': { value: 0, discounts: 0, count: 0, total: 0 },
        'dine-in': { value: 0, discounts: 0, count: 0, total: 0 },
        'delivery': { value: 0, discounts: 0, count: 0, total: 0 }
      };

      let totalDiscounts = 0;
      let totalDeliveryFees = 0;
      let totalRefunds = 0;
      let totalVoidedItems = 0;
      let totalSales = 0;
      let cashTotalShift = 0;
      let cardTotalShift = 0;
      let instapayTotalShift = 0;
      let walletTotalShift = 0;

      shiftOrders.forEach(order => {
        const type = order.orderType || 'dine-in';
        if (orderTypeBreakdown[type]) {
          orderTypeBreakdown[type].value += order.subtotal;
          orderTypeBreakdown[type].count += 1;
          totalSales += order.subtotal;
        }

        const orderDiscount = (order.promoDiscount || 0) + (order.loyaltyDiscount || 0) + (order.manualDiscountAmount || 0);
        if (orderTypeBreakdown[type]) {
          orderTypeBreakdown[type].discounts += orderDiscount;
        }
        totalDiscounts += orderDiscount;
        totalDeliveryFees += order.deliveryFee || 0;

        const method = order.paymentMethod.toLowerCase();
        if (method === 'cash') {
          cashTotalShift += order.totalAmount;
        } else if (method === 'card') {
          // Break down card payments by detail
          const detail = order.paymentMethodDetail?.toUpperCase();
          if (detail === 'INSTAPAY') {
            instapayTotalShift += order.totalAmount;
          } else if (detail === 'MOBILE_WALLET') {
            walletTotalShift += order.totalAmount;
          } else {
            cardTotalShift += order.totalAmount;
          }
        } else if (method.includes('visa') || method.includes('credit')) {
          cardTotalShift += order.totalAmount;
        }
      });

      // Calculate refunds and voided items for this shift (from all orders, including refunded)
      const refundedOrdersInShift = shift.orders.filter(o => o.isRefunded);
      totalRefunds = refundedOrdersInShift.reduce((sum, order) => sum + order.totalAmount, 0);

      // Get voided items for orders in this shift from pre-fetched data
      const shiftOrderIds = shift.orders.map(o => o.id);
      const voidedItemsInShift = allVoidedItems.filter(vi =>
        shiftOrderIds.includes(vi.orderItem.orderId)
      );
      totalVoidedItems = voidedItemsInShift.reduce((sum, item) => sum + item.voidedSubtotal, 0);

      // Calculate totals per order type
      Object.keys(orderTypeBreakdown).forEach(type => {
        orderTypeBreakdown[type].total = orderTypeBreakdown[type].value - orderTypeBreakdown[type].discounts;
      });

      // Calculate cash difference (subtract daily expenses, refunds, and voided items)
      const closingRevenue = shift.closingRevenue || 0;
      const expectedCash = shift.openingCash + cashTotalShift - shiftDailyExpenses - totalRefunds - totalVoidedItems;
      const overShort = shift.closingCash ? shift.closingCash - expectedCash : null;

      return {
        shiftNumber: index + 1,
        startTime: shift.startTime,
        endTime: shift.endTime || new Date().toISOString(),
        orderTypeBreakdown,
        totals: {
          sales: totalSales,
          discounts: totalDiscounts,
          deliveryFees: totalDeliveryFees,
          refunds: totalRefunds,
          voidedItems: totalVoidedItems,
          card: cardTotalShift,
          instapay: instapayTotalShift,
          wallet: walletTotalShift,
          cash: cashTotalShift,
          dailyExpenses: shiftDailyExpenses,
          openingCashBalance: shift.openingCash,
          expectedCash,
          closingCashBalance: shift.closingCash || 0,
          overShort
        },
        cashier: {
          name: shift.cashier?.name || shift.cashier?.username || 'Unknown',
          username: shift.cashier?.username || 'unknown'
        }
      };
    });

    // Prepare report data in DayClosingReceipt format
    const reportData = {
      storeName: 'Emperor Coffee',
      branchName: branch?.branchName || 'Unknown Branch',
      date: businessDay.openedAt,
      shifts: shiftsData,
      categoryBreakdown: categories,
      notes: businessDay.notes,
      fontSize: 'medium' as const,
      dailyExpenses: {
        total: totalDailyExpensesDay,
        breakdown: allDailyExpenses.map(exp => ({
          amount: exp.amount,
          reason: exp.reason,
          shiftId: exp.shiftId
        }))
      }
    };

    // Legacy report data for backward compatibility
    const legacyReport = {
      businessDay: {
        id: businessDay.id,
        openedAt: businessDay.openedAt,
        closedAt: businessDay.closedAt,
        isOpen: businessDay.isOpen,
        openingCash: businessDay.openingCash,
        closingCash: businessDay.closingCash,
        expectedCash: businessDay.expectedCash,
        cashDifference: businessDay.cashDifference,
        notes: businessDay.notes,
        branch: branch,
        openedBy: businessDay.openedByUser,
        closedBy: businessDay.closedByUser
      },
      summary: {
        totalOrders: businessDay.totalOrders,
        totalSales: businessDay.totalSales,
        subtotal: businessDay.subtotal,
        taxAmount: businessDay.taxAmount,
        deliveryFees: businessDay.deliveryFees,
        loyaltyDiscounts: businessDay.loyaltyDiscounts,
        cashSales: cashTotal,
        cardSales: cardTotal,
        instapaySales: instapayTotal,
        walletSales: walletTotal,
        totalShifts: businessDay.shifts.length,
        dailyExpenses: totalDailyExpensesDay
      },
      categoryBreakdown: categories,
      shifts: businessDay.shifts.map(shift => ({
        id: shift.id,
        cashier: shift.cashier,
        startTime: shift.startTime,
        endTime: shift.endTime,
        isClosed: shift.isClosed,
        openingCash: shift.openingCash,
        closingCash: shift.closingCash,
        openingOrders: shift.openingOrders,
        closingOrders: shift.closingOrders || 0,
        openingRevenue: shift.openingRevenue,
        closingRevenue: shift.closingRevenue || 0,
        ordersCount: shift.orders.length,
        cashDifference: shift.closingCash
          ? shift.closingCash - shift.openingCash - (shift.closingRevenue || 0)
          : null
      })),
      refunds
    };

    return NextResponse.json({
      success: true,
      report: reportData,
      legacyReport
    });
  } catch (error: any) {
    console.error('[Closing Day Report Error]', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate closing day report',
      details: error.message
    }, { status: 500 });
  }
}
