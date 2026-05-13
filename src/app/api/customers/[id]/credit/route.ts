import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Get credit transactions and balance for a customer
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const customerId = params.id;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get customer with current credit balance
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        creditLimit: true,
        creditBalance: true,
        customerType: true,
        isVatRegistered: true,
        taxRegistrationNumber: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Get credit transactions
    const transactions = await db.creditTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Get total transaction count
    const totalCount = await db.creditTransaction.count({
      where: { customerId },
    });

    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        creditLimit: customer.creditLimit || 0,
        creditBalance: customer.creditBalance || 0,
        availableCredit: (customer.creditLimit || 0) - (customer.creditBalance || 0),
        customerType: customer.customerType,
        isVatRegistered: customer.isVatRegistered,
        taxRegistrationNumber: customer.taxRegistrationNumber,
      },
      transactions,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error) {
    console.error('Get credit info error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch credit information' },
      { status: 500 }
    );
  }
}

// POST - Record a credit transaction (payment or adjustment)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const customerId = params.id;
    const body = await request.json();
    const {
      type,
      amount,
      orderId,
      referenceNumber,
      notes,
      createdBy,
    } = body;

    // Validate required fields
    if (!type || !amount || !createdBy) {
      return NextResponse.json(
        { success: false, error: 'Type, amount, and createdBy are required' },
        { status: 400 }
      );
    }

    // Validate transaction type
    const validTypes = ['CREDIT_PURCHASE', 'CREDIT_PAYMENT', 'CREDIT_ADJUSTMENT', 'CREDIT_REFUND'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid transaction type' },
        { status: 400 }
      );
    }

    // Get customer
    const customer = await db.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Customer not found' },
        { status: 404 }
      );
    }

    // For B2B customers, verify customer type
    if (customer.customerType === 'B2C' && type === 'CREDIT_PURCHASE') {
      return NextResponse.json(
        { success: false, error: 'B2C customers cannot use credit purchases' },
        { status: 400 }
      );
    }

    const previousBalance = customer.creditBalance || 0;
    let newBalance = previousBalance;
    let transactionAmount = Math.abs(amount);

    // Calculate new balance based on transaction type
    switch (type) {
      case 'CREDIT_PURCHASE':
        // Add to balance (customer owes more)
        newBalance = previousBalance + transactionAmount;
        break;
      case 'CREDIT_PAYMENT':
        // Reduce balance (customer pays off debt)
        newBalance = previousBalance - transactionAmount;
        break;
      case 'CREDIT_ADJUSTMENT':
        // Use amount as signed value (positive adds, negative reduces)
        newBalance = previousBalance + amount;
        transactionAmount = amount; // Keep sign for adjustments
        break;
      case 'CREDIT_REFUND':
        // Refund reduces outstanding balance
        newBalance = previousBalance - transactionAmount;
        break;
    }

    // Check credit limit for purchases
    if (type === 'CREDIT_PURCHASE' && customer.creditLimit) {
      if (newBalance > customer.creditLimit) {
        return NextResponse.json(
          {
            success: false,
            error: `Credit limit exceeded. Available: ${customer.creditLimit - previousBalance}, Attempted: ${transactionAmount}`,
          },
          { status: 400 }
        );
      }
    }

    // Prevent negative balance (unless it's a refund or adjustment)
    if (newBalance < 0 && type !== 'CREDIT_REFUND' && type !== 'CREDIT_ADJUSTMENT') {
      return NextResponse.json(
        { success: false, error: 'Payment exceeds outstanding balance' },
        { status: 400 }
      );
    }

    // Create transaction and update customer balance in a transaction
    const result = await db.$transaction(async (tx) => {
      // Create credit transaction
      const transaction = await tx.creditTransaction.create({
        data: {
          customerId,
          amount: transactionAmount,
          type,
          orderId,
          referenceNumber,
          notes,
          previousBalance,
          newBalance,
          createdBy,
        },
      });

      // Update customer credit balance
      await tx.customer.update({
        where: { id: customerId },
        data: { creditBalance: newBalance },
      });

      return transaction;
    });

    return NextResponse.json({
      success: true,
      transaction: result,
      message: type === 'CREDIT_PAYMENT' ? 'Payment recorded successfully' : 'Transaction recorded successfully',
    });
  } catch (error) {
    console.error('Create credit transaction error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record credit transaction' },
      { status: 500 }
    );
  }
}
