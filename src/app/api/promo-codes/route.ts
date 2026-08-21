import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/promo-codes - List all codes with pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const promotionId = searchParams.get('promotionId');
    const isActive = searchParams.get('isActive');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const offset = (page - 1) * limit;

    const where: any = {};
    if (promotionId) {
      where.promotionId = promotionId;
    }
    if (isActive !== null) {
      where.isActive = isActive === 'true';
    }

    // Build date filter
    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        dateFilter.gte = new Date(startDate);
      }
      if (endDate) {
        // Include the entire end date by setting it to the end of the day
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        dateFilter.lte = endOfDay;
      }
      where.createdAt = dateFilter;
    }

    const [codes, totalCount] = await Promise.all([
      db.promotionCode.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          promotion: {
            select: {
              id: true,
              name: true,
              discountType: true,
              discountValue: true,
            },
          },
        },
      }),
      db.promotionCode.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      codes,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching promo codes:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch promo codes' },
      { status: 500 }
    );
  }
}
