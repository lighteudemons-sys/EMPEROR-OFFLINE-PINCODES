import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Get all recipes for offline caching
 * Returns recipes with ingredient details for inventory deduction
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const branchId = searchParams.get('branchId');

    // Fetch all menu items for this branch (or all if no branch specified)
    // Phase 3.1b: use availabilityMode to filter correctly:
    //   - GLOBAL items are available everywhere (even with price override rows for other branches)
    //   - EXPLICIT items are only available in branches with a row
    const menuItemIds = branchId
      ? (
          await db.menuItem.findMany({
            where: {
              isActive: true,
              deletedAt: null,
              OR: [
                { availabilityMode: 'GLOBAL' },
                { availabilityMode: 'EXPLICIT', branchAssignments: { some: { branchId } } },
              ],
            },
            select: { id: true },
          })
        ).map((item) => item.id)
      : null;

    // Fetch all recipes (or filtered by branch menu items)
    const recipes = await db.recipe.findMany({
      where: menuItemIds
        ? {
            menuItemId: { in: menuItemIds },
          }
        : undefined,
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
        ingredient: {
          select: {
            id: true,
            name: true,
            unit: true,
          },
        },
        variant: {
          select: {
            id: true,
            menuItemId: true,
            variantType: {
              select: {
                id: true,
                name: true,
                isCustomInput: true,
              },
            },
            variantOption: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        menuItem: {
          name: 'asc',
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        recipes,
        count: recipes.length,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[Recipes/Offline] Error fetching recipes:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch recipes',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
