import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Helper: build the date filter clause used by both balance and transactions APIs.
 * Matches records that have a transactionDate in range, OR records without
 * transactionDate whose createdAt falls in range (backward compat).
 */
function buildDateFilter(startDate: string | null, endDate: string | null): any {
  if (!startDate && !endDate) return undefined;

  if (startDate && endDate) {
    const startDateTime = new Date(startDate);
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999);

    return {
      OR: [
        { transactionDate: { gte: startDateTime, lte: endDateTime } },
        { transactionDate: null, createdAt: { gte: startDateTime, lte: endDateTime } },
      ],
    };
  }

  if (startDate) {
    const startDateTime = new Date(startDate);
    return {
      OR: [
        { transactionDate: { gte: startDateTime } },
        { transactionDate: null, createdAt: { gte: startDateTime } },
      ],
    };
  }

  // endDate only
  const endDateTime = new Date(endDate!);
  endDateTime.setHours(23, 59, 59, 999);
  return {
    OR: [
      { transactionDate: { lte: endDateTime } },
      { transactionDate: null, createdAt: { lte: endDateTime } },
    ],
  };
}

/**
 * GET /api/cash-management/balance
 * Get current cash balance for all branches or a specific branch.
 * Supports optional date-range filtering via startDate & endDate query params.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const dateFilter = buildDateFilter(startDate, endDate);
    const isFiltered = !!dateFilter;

    // Get all branches with their cash balances (include inactive branches for cash management)
    const branches = await db.branch.findMany({
      where: branchId ? { id: branchId } : undefined,
      select: {
        id: true,
        branchName: true,
        isActive: true,
      },
    });

    // Calculate balance for each branch
    const balances = await Promise.all(
      branches.map(async (branch) => {
        const txWhere: any = { branchId: branch.id };
        if (dateFilter) {
          txWhere.AND = [dateFilter];
        }

        const transactions = await db.cashTransaction.findMany({
          where: txWhere,
          select: {
            type: true,
            amount: true,
          },
        });

        const totalIn = transactions
          .filter(t => t.type === 'SHIFT_CLOSING')
          .reduce((sum, t) => sum + t.amount, 0);

        const totalOut = transactions
          .filter(t => t.type === 'WITHDRAWAL')
          .reduce((sum, t) => sum + t.amount, 0);

        const currentBalance = totalIn - totalOut;
        const transactionCount = transactions.length;

        return {
          branchId: branch.id,
          branchName: branch.branchName,
          isActive: branch.isActive,
          totalIn,
          totalOut,
          currentBalance,
          transactionCount,
        };
      })
    );

    // Calculate overall total
    const grandTotal = balances.reduce((sum, b) => sum + b.currentBalance, 0);

    return NextResponse.json({
      success: true,
      balances,
      grandTotal,
      filtered: isFiltered,
    });
  } catch (error: any) {
    console.error('[Cash Management] Get balance error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cash balance', details: error.message },
      { status: 500 }
    );
  }
}