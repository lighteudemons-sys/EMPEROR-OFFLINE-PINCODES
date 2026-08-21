import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logShiftClosed } from '@/lib/audit-logger';

// Shared update logic to avoid double-reading of body
async function closeShift(id: string, body: any) {
  const { closingCash, notes } = body;

  console.log('[closeShift] Shift ID:', id, 'Closing Cash:', closingCash);

  // Allow 0 or empty string for closing cash
  if (closingCash === undefined || closingCash === null || closingCash === '') {
    return { error: 'Closing cash is required', status: 400 };
  }

  // Get the shift first
  const shift = await db.shift.findUnique({
    where: { id },
    include: {
      cashier: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
    },
  });

  if (!shift) {
    console.log('[closeShift] Shift not found');
    return { error: 'Shift not found', status: 404 };
  }

  // Check for active Dine In orders before allowing shift close
  const activeDineInOrders = await db.order.findMany({
    where: {
      shiftId: id,
      orderType: 'dine-in',
      isRefunded: false,
    },
    include: {
      table: {
        select: {
          id: true,
          tableNumber: true,
          status: true,
        },
      },
    },
  });

  console.log('[closeShift] Active dine-in orders:', JSON.stringify(activeDineInOrders.map(o => ({
    orderId: o.id,
    tableNumber: o.table?.tableNumber,
    tableStatus: o.table?.status,
    totalAmount: o.totalAmount,
    isRefunded: o.isRefunded,
  })), null, 2));

  // Filter out orders that are fully refunded or don't have active tables
  const activeOrders = activeDineInOrders.filter(order => {
    // Check if the table is still occupied
    if (order.table) {
      const tableOrders = activeDineInOrders.filter(o => o.tableId === order.tableId);
      // Only consider table active if there are non-refunded orders AND table is OCCUPIED
      return tableOrders.length > 0 && order.table.status === 'OCCUPIED';
    }
    return false;
  });

  console.log('[closeShift] Filtered active orders:', JSON.stringify(activeOrders.map(o => ({
    orderId: o.id,
    tableNumber: o.table?.tableNumber,
    tableStatus: o.table?.status,
  })), null, 2));

  // Also check for tables with OCCUPIED status that have orders in this shift
  const occupiedTables = await db.table.findMany({
    where: {
      branchId: shift.branchId,
      status: 'OCCUPIED',
      openedBy: shift.cashierId,
    },
  });

  console.log('[closeShift] Occupied tables from DB:', JSON.stringify(occupiedTables.map(t => ({
    tableNumber: t.tableNumber,
    status: t.status,
    openedBy: t.openedBy,
  })), null, 2));

  // Combine both checks
  const openTables = new Set();
  activeOrders.forEach(order => {
    if (order.table) {
      openTables.add(order.table.tableNumber);
    }
  });
  occupiedTables.forEach(table => {
    openTables.add(table.tableNumber);
  });

  console.log('[closeShift] Combined openTables set:', Array.from(openTables));

  if (openTables.size > 0) {
    const tableNumbers = Array.from(openTables).sort((a, b) => a - b).join(', ');
    console.log('[closeShift] Cannot close shift - Tables still occupied:', tableNumbers);
    return {
      error: `Cannot close shift. The following tables are still occupied: ${tableNumbers}. Please close all tables before ending your shift.`,
      status: 400,
    };
  }

  // Calculate actual closing figures from orders
  // Revenue = subtotal (excludes delivery fees which go to couriers, excludes loyalty discounts)
  const orderStats = await db.order.aggregate({
    where: {
      shiftId: id,
    },
    _count: true,
    _sum: {
      subtotal: true,  // Revenue = subtotal (no delivery fees, no discounts)
      deliveryFee: true,
      totalAmount: true,
    },
  });

  // Get loyalty discounts for this branch (costs tracked as "Loyalty Discounts")
  const loyaltyDiscountStats = await db.branchCost.aggregate({
    where: {
      branchId: shift.branchId,
      shiftId: shift.id, // Only get loyalty discounts for this specific shift
      costCategory: {
        name: 'Loyalty Discounts',
      },
    },
    _sum: {
      amount: true,
    },
  });

  // Get daily expenses for this shift
  const dailyExpensesStats = await db.dailyExpense.aggregate({
    where: {
      shiftId: shift.id,
    },
    _sum: {
      amount: true,
    },
  });

  // Calculate what the cashier actually has
  // Cashier revenue = subtotal - loyaltyDiscounts (delivery fees go to courier)
  const deliveryFees = orderStats._sum.deliveryFee || 0;
  const loyaltyDiscounts = loyaltyDiscountStats._sum.amount || 0;
  const dailyExpenses = dailyExpensesStats._sum.amount || 0;
  const cashierRevenue = (orderStats._sum.subtotal || 0) - loyaltyDiscounts - dailyExpenses;

  // Get payment method breakdown with card details (excludes delivery fees)
  const orders = await db.order.findMany({
    where: { shiftId: id },
    select: {
      paymentMethod: true,
      paymentMethodDetail: true,
      subtotal: true,
    },
  });

  const paymentBreakdown: Record<string, number> = {
    cash: 0,
    card: 0,
    instapay: 0,
    wallet: 0,
    other: 0,
    total: 0,
  };

  orders.forEach(order => {
    const method = order.paymentMethod.toLowerCase();
    if (method === 'cash') {
      paymentBreakdown.cash += order.subtotal || 0;
    } else if (method === 'card') {
      // Break down card payments by detail
      const detail = order.paymentMethodDetail?.toUpperCase();
      if (detail === 'INSTAPAY') {
        paymentBreakdown.instapay += order.subtotal || 0;
      } else if (detail === 'MOBILE_WALLET') {
        paymentBreakdown.wallet += order.subtotal || 0;
      } else {
        // Default to CARD for regular card payments
        paymentBreakdown.card += order.subtotal || 0;
      }
    } else if (method.includes('visa') || method.includes('credit')) {
      paymentBreakdown.card += order.subtotal || 0;
    } else {
      paymentBreakdown.other += order.subtotal || 0;
    }
  });

  paymentBreakdown.total = paymentBreakdown.cash + paymentBreakdown.card + paymentBreakdown.instapay + paymentBreakdown.wallet + paymentBreakdown.other;

  console.log('[closeShift] Order stats:', {
    orders: orderStats._count,
    subtotal: orderStats._sum.subtotal || 0,
    deliveryFees,
    loyaltyDiscounts,
    dailyExpenses,
    cashierRevenue, // What cashier actually has (subtotal - discounts - expenses, no delivery)
    paymentBreakdown: {
      cash: paymentBreakdown.cash,
      card: paymentBreakdown.card,
      instapay: paymentBreakdown.instapay,
      wallet: paymentBreakdown.wallet,
      other: paymentBreakdown.other,
    },
  });

  // Update shift with calculated closing data
  const updatedShift = await db.shift.update({
    where: { id },
    data: {
      closingCash: parseFloat(closingCash),
      endTime: new Date(),
      isClosed: true,
      closingOrders: orderStats._count,
      closingRevenue: cashierRevenue, // Cashier's actual revenue (excludes delivery fees, discounts & expenses)
      closingLoyaltyDiscounts: loyaltyDiscounts,
      closingDailyExpenses: dailyExpenses,
      notes,
      // Note: paymentBreakdown removed temporarily due to Prisma issue
    },
    include: {
      cashier: true,
    },
  });

  // Log shift closing to audit logs
  await logShiftClosed(shift.cashierId, id, parseFloat(closingCash));

  // Create cash IN transaction for cash management (use closingCash - what you take hand-to-hand)
  if (parseFloat(closingCash) > 0) {
    console.log('[closeShift] Creating cash management transaction:', parseFloat(closingCash));
    try {
      // Set transactionDate to the shift's start date (business date)
      // This ensures if a shift closes after midnight (e.g., 3 AM July 1st),
      // the transaction is still attributed to the shift's actual day (e.g., June 30th)
      const shiftBusinessDate = new Date(shift.startTime);
      shiftBusinessDate.setHours(12, 0, 0, 0); // noon to avoid timezone edge cases

      await db.cashTransaction.create({
        data: {
          branchId: shift.branchId,
          type: 'SHIFT_CLOSING',
          amount: parseFloat(closingCash),
          description: `Cash from shift closing - ${shift.cashier.username}`,
          shiftId: id,
          createdBy: shift.cashierId,
          transactionDate: shiftBusinessDate,
        },
      });
      console.log('[closeShift] Cash transaction created successfully');
    } catch (cashTxnError) {
      console.error('[closeShift] Failed to create cash transaction:', cashTxnError);
      // Don't fail the shift closing if cash transaction creation fails
    }
  }

  console.log('[closeShift] Shift updated successfully');

  // Send shift report via email
  // Priority: branch's shiftReportEmail > global SHIFT_REPORT_EMAIL env var
  const branchData = await db.branch.findUnique({
    where: { id: shift.branchId },
    select: { branchName: true, shiftReportEmail: true },
  });

  const reportEmail = branchData?.shiftReportEmail || process.env.SHIFT_REPORT_EMAIL;
  if (reportEmail && reportEmail.trim()) {
    try {
      console.log('[closeShift] Building full email report data...');

      // ── Fetch all data needed for the 4-paper email report ──

      // 1. Orders with items + menuItem (for category breakdown & order type breakdown)
      const ordersWithItems = await db.order.findMany({
        where: { shiftId: id },
        select: {
          id: true,
          orderType: true,
          paymentMethod: true,
          paymentMethodDetail: true,
          subtotal: true,
          deliveryFee: true,
          totalAmount: true,
          promoDiscount: true,
          manualDiscountAmount: true,
          isRefunded: true,
          orderNumber: true,
          orderTimestamp: true,
          items: {
            select: {
              quantity: true,
              subtotal: true,
              itemName: true,
              variantName: true,
              customVariantValue: true,
              menuItemId: true,
              menuItemVariantId: true,
              unitPrice: true,
              menuItem: {
                select: { name: true, category: true },
              },
            },
          },
        },
      });

      // 2. Daily expenses (full list)
      const expenseList = await db.dailyExpense.findMany({
        where: { shiftId: id },
        include: {
          recorder: { select: { id: true, name: true, username: true } },
          ingredient: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      // 3. Voided items
      const shiftOrderIds = ordersWithItems.map(o => o.id).filter(Boolean);
      const voidedItems = shiftOrderIds.length > 0 ? await db.voidedItem.findMany({
        where: { orderItem: { orderId: { in: shiftOrderIds } } },
        orderBy: { voidedAt: 'desc' },
        include: {
          orderItem: {
            select: {
              itemName: true,
              order: { select: { orderNumber: true, orderTimestamp: true } },
            },
          },
        },
      }) : [];

      // 4. Refunded orders
      const refundedOrders = shiftOrderIds.length > 0 ? await db.order.findMany({
        where: { id: { in: shiftOrderIds }, isRefunded: true },
        select: {
          id: true, orderNumber: true, orderTimestamp: true,
          totalAmount: true, refundReason: true, refundedAt: true, paymentMethod: true,
        },
      }) : [];

      // 5. Loyalty transactions
      const loyaltyTxs = shiftOrderIds.length > 0 ? await db.loyaltyTransaction.findMany({
        where: { orderId: { in: shiftOrderIds } },
        orderBy: { createdAt: 'desc' },
      }) : [];

      // 6. Promo usages
      const promoUsages = shiftOrderIds.length > 0 ? await db.promotionUsageLog.findMany({
        where: { orderId: { in: shiftOrderIds } },
        orderBy: { usedAt: 'desc' },
      }) : [];

      // ── Compute report fields ──

      const orderMap = new Map(ordersWithItems.map(o => [o.id, o]));

      // Order type breakdown
      const orderTypeBreakdown = {
        'take-away': { value: 0, discounts: 0, count: 0, total: 0 },
        'dine-in':   { value: 0, discounts: 0, count: 0, total: 0 },
        delivery:    { value: 0, discounts: 0, count: 0, total: 0 },
      };
      let totalSales = 0;
      let totalDiscounts = 0;
      let totalDeliveryFees = 0;

      ordersWithItems.forEach(order => {
        if (order.isRefunded) return;
        const type = (order.orderType || 'dine-in') as keyof typeof orderTypeBreakdown;
        if (!orderTypeBreakdown[type]) return;
        orderTypeBreakdown[type].value += order.subtotal || 0;
        orderTypeBreakdown[type].count += 1;
        totalSales += order.subtotal || 0;
        const disc = (order.promoDiscount || 0) + (order.manualDiscountAmount || 0);
        orderTypeBreakdown[type].discounts += disc;
        totalDiscounts += disc;
        totalDeliveryFees += order.deliveryFee || 0;
      });
      (Object.keys(orderTypeBreakdown) as Array<keyof typeof orderTypeBreakdown>).forEach(t => {
        orderTypeBreakdown[t].total = orderTypeBreakdown[t].value - orderTypeBreakdown[t].discounts;
      });

      // Category breakdown
      const normalizeCategory = (c: string | null | undefined) => c?.trim().replace(/\s+/g, ' ') || 'Uncategorized';

      const isCustomInputItem = (variantName: string | null | undefined): boolean => {
        if (!variantName) return false;
        if (variantName.includes('وزن:')) return true;
        if (/\(([\d.]+)g\)/i.test(variantName)) return true;
        if (/[^:]*:\s*[\d.]+\s*x\s*$/i.test(variantName)) return true;
        if (/^\s*[\d.]+\s*x\s*$/i.test(variantName)) return false; // bare multiplier not enough
        return false;
      };

      const extractWeight = (vn: string): number => {
        const w = vn.match(/\(([\d.]+)g\)/i);
        if (w) return parseFloat(w[1]) / 1000;
        let m = vn.match(/وزن:\s*([\d.]+)x/i);
        if (m) return parseFloat(m[1]);
        m = vn.match(/[^:]*:\s*([\d.]+)x/i);
        if (m) return parseFloat(m[1]);
        return 0;
      };

      const catMap = new Map<string, {
        categoryName: string; totalSales: number;
        items: Map<string, { itemId: string; itemName: string; quantity: number; totalPrice: number; isCustomInput: boolean; totalWeight?: number }>;
      }>();

      ordersWithItems.forEach(order => {
        if (order.isRefunded) return;
        (order.items || []).forEach(oi => {
          const category = normalizeCategory(oi.menuItem?.category);
          if (!catMap.has(category)) {
            catMap.set(category, { categoryName: category, totalSales: 0, items: new Map() });
          }
          const cd = catMap.get(category)!;
          cd.totalSales += oi.subtotal || 0;

          const isCustom = isCustomInputItem(oi.variantName);
          const key = isCustom ? `custom_${oi.menuItemId}` : oi.menuItemId + (oi.menuItemVariantId ? `_${oi.menuItemVariantId}` : '');
          const baseName = isCustom ? (oi.menuItem?.name || oi.itemName) : (oi.menuItem?.name || oi.itemName);

          if (!cd.items.has(key)) {
            cd.items.set(key, { itemId: key, itemName: baseName, quantity: 0, totalPrice: 0, isCustomInput: isCustom, totalWeight: isCustom ? 0 : undefined });
          }
          const idata = cd.items.get(key)!;
          idata.quantity += oi.quantity || 0;
          idata.totalPrice += oi.subtotal || 0;
          if (isCustom && idata.totalWeight !== undefined) {
            idata.totalWeight += (oi.customVariantValue != null ? oi.customVariantValue : extractWeight(oi.variantName || ''));
          }
        });
      });

      const categoryBreakdown = Array.from(catMap.values())
        .filter(c => c.totalSales > 0)
        .sort((a, b) => b.totalSales - a.totalSales)
        .map(c => ({
          categoryName: c.categoryName,
          totalSales: c.totalSales,
          items: Array.from(c.items.values()).map(i => ({ itemId: i.itemId, itemName: i.itemName, quantity: i.quantity, totalPrice: i.totalPrice, isCustomInput: i.isCustomInput, totalWeight: i.totalWeight })),
        }));

      // Totals
      const totalVoided = voidedItems.reduce((s, v) => s + v.voidedSubtotal, 0);
      const totalRefunds = refundedOrders.reduce((s, r) => s + r.totalAmount, 0);
      const totalLoyalty = loyaltyTxs.filter(t => t.type === 'REDEEMED').reduce((s, t) => s + (t.amount || 0), 0);
      const totalPromo = promoUsages.reduce((s, p) => s + p.discountAmount, 0);
      const totalExpenses = expenseList.reduce((s, e) => s + e.amount, 0);
      const expectedCash = shift.openingCash + paymentBreakdown.cash - totalExpenses - totalVoided - totalRefunds;
      const closingCashNum = parseFloat(closingCash);

      // Build the full payload matching ShiftClosingReportPayload
      const reportPayload = {
        shift: {
          id,
          shiftNumber: Math.max(shift.openingOrders, updatedShift.closingOrders || 0, ordersWithItems.length),
          startTime: shift.startTime.toISOString(),
          endTime: updatedShift.endTime?.toISOString() || new Date().toISOString(),
          cashier: { id: shift.cashierId, name: shift.cashier.name, username: shift.cashier.username },
          branch: { id: shift.branchId, branchName: branchData?.branchName || '' },
          openingCash: shift.openingCash,
          closingCash: closingCashNum,
          openingOrders: shift.openingOrders,
          closingOrders: updatedShift.closingOrders,
          openingRevenue: shift.openingRevenue,
          closingRevenue: updatedShift.closingRevenue,
          notes,
        },
        paymentSummary: {
          cash: paymentBreakdown.cash,
          card: paymentBreakdown.card,
          instapay: paymentBreakdown.instapay,
          wallet: paymentBreakdown.wallet,
          other: paymentBreakdown.other,
          total: paymentBreakdown.total,
        },
        orderTypeBreakdown,
        totals: {
          sales: totalSales,
          discounts: totalDiscounts,
          deliveryFees: totalDeliveryFees,
          refunds: totalRefunds,
          voidedItems: totalVoided,
          loyaltyDiscounts: totalLoyalty,
          promoDiscounts: totalPromo,
          card: paymentBreakdown.card,
          instapay: paymentBreakdown.instapay,
          wallet: paymentBreakdown.wallet,
          cash: paymentBreakdown.cash,
          dailyExpenses: totalExpenses,
          openingCashBalance: shift.openingCash,
          expectedCash,
          closingCashBalance: closingCashNum,
          overShort: closingCashNum - expectedCash,
        },
        categoryBreakdown,
        voidedItems: voidedItems.map(vi => ({
          id: vi.id, itemName: vi.orderItem.itemName, voidedQuantity: vi.voidedQuantity,
          unitPrice: vi.unitPrice, voidedSubtotal: vi.voidedSubtotal, reason: vi.reason,
          voidedBy: vi.voidedBy, voidedAt: vi.voidedAt.toISOString(),
          orderNumber: vi.orderItem.order.orderNumber, orderTimestamp: vi.orderItem.order.orderTimestamp.toISOString(),
        })),
        refundedOrders: refundedOrders.map(ro => ({
          id: ro.id, orderNumber: ro.orderNumber, orderTimestamp: ro.orderTimestamp.toISOString(),
          refundAmount: ro.totalAmount, refundReason: ro.refundReason || '',
          refundedAt: (ro.refundedAt || new Date()).toISOString(), paymentMethod: ro.paymentMethod,
        })),
        dailyExpenses: expenseList.map(exp => ({
          id: exp.id, amount: exp.amount, reason: exp.reason || '', category: exp.category,
          ingredientId: exp.ingredientId, quantity: exp.quantity, quantityUnit: exp.quantityUnit,
          unitPrice: exp.unitPrice, createdAt: exp.createdAt.toISOString(),
          recorder: { id: exp.recorder.id, name: exp.recorder.name || '', username: exp.recorder.username },
          ingredient: exp.ingredient ? { id: exp.ingredient.id, name: exp.ingredient.name } : null,
        })),
        loyaltyTransactions: loyaltyTxs.map(lt => {
          const order = orderMap.get(lt.orderId || '');
          return {
            id: lt.id, customerId: lt.customerId, points: lt.points, type: lt.type,
            amount: lt.amount || 0, notes: lt.notes, createdAt: lt.createdAt.toISOString(),
            orderNumber: order?.orderNumber,
          };
        }),
        promoUsages: promoUsages.map(pu => {
          const order = orderMap.get(pu.orderId || '');
          return {
            id: pu.id, code: pu.code, discountAmount: pu.discountAmount,
            orderSubtotal: pu.orderSubtotal, usedAt: pu.usedAt.toISOString(),
            orderNumber: order?.orderNumber,
          };
        }),
      };

      const { sendShiftReport } = await import('@/lib/email');
      const sent = await sendShiftReport(reportEmail.trim(), reportPayload);
      console.log('[closeShift] Email result:', sent ? 'SENT' : 'FAILED', 'to:', reportEmail);
    } catch (emailErr) {
      console.error('[closeShift] Email send error:', emailErr);
    }
  }

  return {
    success: true,
    shift: {
      ...updatedShift,
      paymentBreakdown, // Include in response even if not saved to DB yet
    },
    message: 'Shift closed successfully',
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('[PATCH /api/shifts/[id]] Request received');

    // In Next.js 16, params is a Promise and must be awaited
    const { id } = await params;

    const body = await request.json();

    const result = await closeShift(id, body);

    if (result.status) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[PATCH /api/shifts/[id]] Error closing shift:', error);
    return NextResponse.json(
      { error: 'Failed to close shift', details: error.message },
      { status: 500 }
    );
  }
}

// Workaround for gateway that blocks PATCH requests
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('[POST /api/shifts/[id]] Request received (PATCH override)');

    // In Next.js 16, params is a Promise and must be awaited
    const { id } = await params;

    const body = await request.json();

    // Check if this is a PATCH override
    if (body._method !== 'PATCH') {
      return NextResponse.json(
        { error: 'Invalid method' },
        { status: 405 }
      );
    }

    const result = await closeShift(id, body);

    if (result.status) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[POST /api/shifts/[id]] Error closing shift:', error);
    return NextResponse.json(
      { error: 'Failed to close shift', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete a shift and all related data (ADMIN only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify ADMIN role via session
    const { getSession } = await import('@/lib/session-manager');
    const session = await getSession();

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Only administrators can delete shifts' },
        { status: 403 }
      );
    }

    // Check shift exists
    const shift = await db.shift.findUnique({
      where: { id },
      select: { id: true, isClosed: true },
    });

    if (!shift) {
      return NextResponse.json(
        { success: false, error: 'Shift not found' },
        { status: 404 }
      );
    }

    // Get all order IDs for this shift
    const orders = await db.order.findMany({
      where: { shiftId: id },
      select: { id: true },
    });
    const orderIds = orders.map(o => o.id);

    console.log(`[DELETE /api/shifts/[id]] Deleting shift ${id} with ${orderIds.length} orders`);

    await db.$transaction(async (tx) => {
      // 1. Delete non-cascading order-related records
      if (orderIds.length > 0) {
        await tx.loyaltyTransaction.deleteMany({
          where: { orderId: { in: orderIds } },
        });

        await tx.creditTransaction.deleteMany({
          where: { orderId: { in: orderIds } },
        });

        await tx.promotionUsageLog.deleteMany({
          where: { orderId: { in: orderIds } },
        });

        // OrderItemTransfer, OrderItem, VoidedItem cascade from Order deletion
      }

      // 2. Delete daily expenses for this shift
      await tx.dailyExpense.deleteMany({
        where: { shiftId: id },
      });

      // 3. Delete branch costs for this shift
      await tx.branchCost.deleteMany({
        where: { shiftId: id },
      });

      // 4. Delete cash transaction for this shift (unique, so use deleteMany for safety)
      await tx.cashTransaction.deleteMany({
        where: { shiftId: id },
      });

      // 5. Delete all orders (OrderItem, VoidedItem, OrderItemTransfer cascade)
      if (orderIds.length > 0) {
        await tx.order.deleteMany({
          where: { shiftId: id },
        });
      }

      // 6. Finally, delete the shift itself
      await tx.shift.delete({
        where: { id },
      });
    });

    console.log(`[DELETE /api/shifts/[id]] Shift ${id} deleted successfully`);

    return NextResponse.json({
      success: true,
      message: 'Shift and all related data deleted successfully',
    });
  } catch (error: any) {
    console.error('[DELETE /api/shifts/[id]] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete shift', details: error?.message },
      { status: 500 }
    );
  }
}
