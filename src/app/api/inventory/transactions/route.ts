import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const transactionType = searchParams.get('transactionType');
    const ingredientId = searchParams.get('ingredientId');
    const search = searchParams.get('search');

    if (!branchId) {
      return NextResponse.json(
        { error: 'Branch ID is required' },
        { status: 400 }
      );
    }

    // Build where clause with filters
    const where: any = {
      branchId,
    };

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // Add one day to include the end date
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDateTime;
      }
    }

    // Transaction type filter
    if (transactionType) {
      where.transactionType = transactionType;
    }

    // Ingredient filter
    if (ingredientId) {
      where.ingredientId = ingredientId;
    }

    // Get total count
    const total = await db.inventoryTransaction.count({ where });

    // Fetch inventory transactions with relations
    const transactions = await db.inventoryTransaction.findMany({
      where,
      include: {
        ingredient: {
          select: {
            name: true,
          },
        },
        creator: {
          select: {
            name: true,
            username: true,
          },
        },
        order: {
          select: {
            orderNumber: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit ? parseInt(limit) : 50,
      skip: offset ? parseInt(offset) : 0,
    });

    // Transform data for frontend
    let formattedTransactions = transactions.map(txn => ({
      id: txn.id,
      ingredientId: txn.ingredientId,
      ingredientName: txn.ingredient.name,
      transactionType: txn.transactionType,
      quantityChange: txn.quantityChange,
      stockBefore: txn.stockBefore,
      stockAfter: txn.stockAfter,
      orderId: txn.orderId,
      orderNumber: txn.order?.orderNumber,
      reason: txn.reason,
      createdAt: txn.createdAt,
      userName: txn.creator?.name || txn.creator?.username,
    }));

    // Filter by search term (ingredient name)
    if (search) {
      const searchLower = search.toLowerCase();
      formattedTransactions = formattedTransactions.filter(txn =>
        txn.ingredientName.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json({
      transactions: formattedTransactions,
      total,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
  } catch (error) {
    console.error('Get inventory transactions error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory transactions' },
      { status: 500 }
    );
  }
}
