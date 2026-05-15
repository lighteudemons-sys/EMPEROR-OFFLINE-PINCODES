import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/cash-management/deposit
 * Record a manual cash deposit into the safe
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { branchId, amount, description, createdBy } = body;

    // Validation
    if (!branchId || !amount || !createdBy) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: branchId, amount, createdBy' },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    // Verify branch exists
    const branch = await db.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      return NextResponse.json(
        { success: false, error: 'Branch not found' },
        { status: 404 }
      );
    }

    // Verify user exists
    const user = await db.user.findUnique({
      where: { id: createdBy },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify user is admin
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
      return NextResponse.json(
        { success: false, error: 'Only admins and managers can record deposits' },
        { status: 403 }
      );
    }

    // Create deposit transaction
    const deposit = await db.cashTransaction.create({
      data: {
        branchId,
        type: 'SHIFT_CLOSING', // Use SHIFT_CLOSING type for cash IN (both automatic and manual)
        amount: parseFloat(amount.toString()),
        description: description || 'Manual cash deposit (from bank/card orders)',
        createdBy,
      },
      include: {
        branch: {
          select: { id: true, branchName: true },
        },
        creator: {
          select: { id: true, username: true, name: true },
        },
      },
    });

    // Get current balance
    const transactions = await db.cashTransaction.findMany({
      where: { branchId },
      select: {
        type: true,
        amount: true,
      },
    });

    const newBalance = transactions.reduce((sum, t) => {
      return t.type === 'SHIFT_CLOSING' ? sum + t.amount : sum - t.amount;
    }, 0);

    return NextResponse.json({
      success: true,
      deposit,
      newBalance,
    });
  } catch (error: any) {
    console.error('[Cash Management] Deposit error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record deposit', details: error.message },
      { status: 500 }
    );
  }
}
