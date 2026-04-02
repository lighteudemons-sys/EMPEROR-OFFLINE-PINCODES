import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/business-days/list?branchId=xxx&limit=xxx&offset=xxx
// Get list of business days for a branch
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const limit = parseInt(searchParams.get('limit') || '30');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!branchId) {
      return NextResponse.json({
        success: false,
        error: 'Branch ID is required'
      }, { status: 400 });
    }

    const whereClause: any = { branchId };
    whereClause.isOpen = false; // Only show closed days

    const [businessDays, totalCount] = await Promise.all([
      db.businessDay.findMany({
        where: whereClause,
        include: {
          openedByUser: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          closedByUser: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          branch: {
            select: {
              id: true,
              branchName: true,
            },
          },
          shifts: {
            select: {
              id: true,
              cashier: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
              isClosed: true,
            },
          },
        },
        orderBy: {
          openedAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      db.businessDay.count({ where: whereClause }),
    ]);

    // Recalculate sales for each business day to exclude refunded orders
    const businessDayIds = businessDays.map(bd => bd.id);
    const shiftsForDays = await db.shift.findMany({
      where: {
        dayId: { in: businessDayIds }
      },
      include: {
        orders: {
          select: {
            id: true,
            subtotal: true,
            isRefunded: true,
          }
        }
      }
    });

    // Create a map of dayId to recalculated sales
    const recalculatedSales = new Map<string, number>();
    businessDays.forEach(bd => {
      const dayShifts = shiftsForDays.filter(s => s.dayId === bd.id);
      const allOrders = dayShifts.flatMap(s => s.orders);
      // Calculate sales excluding refunded orders
      const sales = allOrders
        .filter(o => !o.isRefunded)
        .reduce((sum, o) => sum + o.subtotal, 0);
      recalculatedSales.set(bd.id, sales);
    });

    // Update business days with recalculated sales
    const businessDaysWithCorrectSales = businessDays.map(bd => ({
      ...bd,
      totalSales: recalculatedSales.get(bd.id) ?? bd.totalSales,
    }));

    return NextResponse.json({
      success: true,
      businessDays: businessDaysWithCorrectSales,
      pagination: {
        total: totalCount,
        limit,
        offset,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    console.error('[Business Days List Error]', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch business days',
      details: error.message,
    }, { status: 500 });
  }
}
