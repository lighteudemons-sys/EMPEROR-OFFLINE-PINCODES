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

    const offset = (page - 1) * limit;

    const where: any = {};
    if (promotionId) {
      where.promotionId = promotionId;
    }
    if (isActive !== null) {
      where.isActive = isActive === 'true';
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
