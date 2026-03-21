import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const branchId = searchParams.get('branchId');
    const type = searchParams.get('type');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Start date and end date are required' },
        { status: 400 }
      );
    }

    // Build where clause for filtering
    const whereConditions: any = {
      orderTimestamp: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
      OR: [
        { promoDiscount: { gt: 0 } },
        { manualDiscountAmount: { gt: 0 } },
      ],
    };

    if (branchId && branchId !== 'all') {
      whereConditions.branchId = branchId;
    }

    // Filter by discount type
    if (type === 'manual') {
      whereConditions.AND = [
        { manualDiscountAmount: { gt: 0 } },
      ];
    } else if (type === 'promo') {
      whereConditions.AND = [
        { promoDiscount: { gt: 0 } },
      ];
    }

    // Fetch orders with discounts
    const orders = await db.order.findMany({
      where: whereConditions,
      include: {
        cashier: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        branch: {
          select: {
            id: true,
            branchName: true,
          },
        },
      },
      orderBy: {
        orderTimestamp: 'desc',
      },
    });

    // Process discounts into CSV format
    const csvHeaders = [
      'Order #',
      'Date',
      'Time',
      'Type',
      'Code / Percent',
      'Comment',
      'Discount Amount',
      'Subtotal',
      'Total',
      'Cashier',
      'Branch',
    ];

    const csvRows: string[] = [];

    for (const order of orders) {
      // Manual discount
      if (order.manualDiscountAmount && order.manualDiscountAmount > 0) {
        const date = new Date(order.orderTimestamp);
        csvRows.push([
          order.orderNumber.toString(),
          date.toLocaleDateString('en-US'),
          date.toLocaleTimeString('en-US'),
          'Manual',
          `${order.manualDiscountPercent}%`,
          order.manualDiscountComment || '',
          order.manualDiscountAmount.toFixed(2),
          (order.subtotal || 0).toFixed(2),
          order.totalAmount.toFixed(2),
          order.cashier?.name || order.cashier?.username || 'Unknown',
          order.branch?.branchName || 'Unknown',
        ].join(','));
      }

      // Promo discount
      if (order.promoDiscount && order.promoDiscount > 0) {
        const date = new Date(order.orderTimestamp);
        csvRows.push([
          order.orderNumber.toString(),
          date.toLocaleDateString('en-US'),
          date.toLocaleTimeString('en-US'),
          'Promo Code',
          order.promoCode || '',
          '',
          order.promoDiscount.toFixed(2),
          (order.subtotal || 0).toFixed(2),
          order.totalAmount.toFixed(2),
          order.cashier?.name || order.cashier?.username || 'Unknown',
          order.branch?.branchName || 'Unknown',
        ].join(','));
      }
    }

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    // Create response with CSV file
    const buffer = Buffer.from(csvContent, 'utf-8');
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="discounts-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Failed to export discounts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to export discounts' },
      { status: 500 }
    );
  }
}
