import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/cash-management/balance
 * Get current cash balance for all branches or a specific branch
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');

    // Get all branches with their cash balances (include inactive branches for cash management)
    const branches = await db.branch.findMany({
      where: branchId ? { id: branchId } : undefined, // Remove isActive filter to show all branches
      select: {
        id: true,
        branchName: true,
        isActive: true, // Include isActive status
      },
    });

    // Calculate balance for each branch
    const balances = await Promise.all(
      branches.map(async (branch) => {
        const transactions = await db.cashTransaction.findMany({
          where: { branchId: branch.id },
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
    });
  } catch (error: any) {
    console.error('[Cash Management] Get balance error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cash balance', details: error.message },
      { status: 500 }
    );
  }
}
