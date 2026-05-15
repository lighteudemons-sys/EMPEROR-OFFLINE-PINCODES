import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/cash-management/transactions
 * Get cash transactions with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const type = searchParams.get('type'); // SHIFT_CLOSING or WITHDRAWAL
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};

    if (branchId) {
      where.branchId = branchId;
    }
    if (type) {
      where.type = type;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDateTime;
      }
    }

    const transactions = await db.cashTransaction.findMany({
      where,
      include: {
        branch: {
          select: { id: true, branchName: true },
        },
        creator: {
          select: { id: true, username: true, name: true },
        },
        shift: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            cashier: {
              select: { id: true, username: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await db.cashTransaction.count({ where });

    return NextResponse.json({
      success: true,
      transactions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + transactions.length < total,
      },
    });
  } catch (error: any) {
    console.error('[Cash Management] Get transactions error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transactions', details: error.message },
      { status: 500 }
    );
  }
}
