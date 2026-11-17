import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCached } from '@/lib/cache';
import {
  isItemAvailableInBranch,
  resolveBranchPrice,
  toNumber,
  type MenuItemForResolution,
} from '@/lib/menu-pricing';

/**
 * Ultra-lightweight Menu Items API for POS Interface
 *
 * This endpoint returns ONLY the essential data needed for the POS:
 * - id, name, category, price, hasVariants, imagePath, sortOrder
 * - Category name and sortOrder
 * - NO recipes, NO ingredient data, NO variant details
 *
 * This reduces data transfer by ~90% compared to the full menu items API
 *
 * BRANCH PRICING (Phase 3.1b):
 * - When branchId is provided, this endpoint resolves the branch-specific price
 *   for each item (falling back to MenuItem.price if no override exists).
 * - When branchId is provided, items are also filtered by branch availability
 *   (GLOBAL items with isActive=false override for this branch are hidden,
 *    EXPLICIT items not listed for this branch are hidden).
 * - The cashier UI receives the resolved price as a plain number in the `price`
 *   field — no client-side change needed.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const branchId = searchParams.get('branchId');

    // Cache key
    const cacheKey = `menu:items:pos:${category || 'all'}:${branchId || 'all-branches'}`;

    const menuItems = await getCached(cacheKey, async () => {
      const items = await db.menuItem.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          ...(category && category !== 'all' ? { category } : {}),
          // Phase 3.1b: availability filtering respects the new availabilityMode field.
          //
          // OLD (broken) behavior: any branch assignment row made the item "EXPLICIT"
          // (only available in listed branches). This broke GLOBAL items that had price
          // overrides for some branches — they became invisible to other branches.
          //
          // NEW (correct) behavior:
          //   - GLOBAL items: ALWAYS returned (available everywhere). Per-branch
          //     isActive=false overrides are applied in JS below via isItemAvailableInBranch().
          //   - EXPLICIT items: only returned if they have a branch assignment row for
          //     THIS branch (then isActive is checked in JS).
          ...(branchId ? {
            OR: [
              { availabilityMode: 'GLOBAL' },
              { availabilityMode: 'EXPLICIT', branchAssignments: { some: { branchId } } },
            ],
          } : {}),
        },
        select: {
          id: true,
          name: true,
          category: true,
          categoryId: true,
          price: true,
          taxRate: true,
          hasVariants: true,
          sortOrder: true,
          availabilityMode: true,
          // Include branch assignments for the requested branch (at most 1 row per branch)
          // so we can resolve the override price and isActive flag in JS.
          ...(branchId ? {
            branchAssignments: {
              where: { branchId },
              select: {
                branchId: true,
                price: true,
                isActive: true,
              },
            },
          } : {}),
          // REMOVED: imagePath - causes 400-450 MB data transfer
          // POS interface on touch monitors doesn't need images
          // Include variants with essential data (variant type, option, price modifier)
          variants: {
            select: {
              id: true,
              priceModifier: true,
              sortOrder: true,
              isActive: true,
              // variantType and variantOption are at the SAME level (not nested)
              variantType: {
                select: {
                  id: true,
                  name: true,
                  isCustomInput: true,
                  isActive: true,
                },
              },
              variantOption: {
                select: {
                  id: true,
                  name: true,
                  sortOrder: true,
                  isActive: true,
                },
              },
            },
            where: {
              isActive: true,
            },
            orderBy: [
              { sortOrder: 'asc' },
            ],
          },
          categoryRel: {
            select: {
              id: true,
              name: true,
              sortOrder: true,
              requiresCaptainReceipt: true,
              // REMOVED: imagePath - causes 400+ MB data transfer
              // POS interface on touch monitors doesn't need category images
            },
          },
        },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      });

      // If no branchId, return items as-is (no branch resolution needed)
      if (!branchId) {
        return items.map(item => ({
          ...item,
          price: item.price, // global Float, already a number
        }));
      }

      // Branch-specific resolution:
      // 1. Filter out items that are not available in this branch (per-branch isActive=false)
      // 2. Resolve the branch-specific price (override or global fallback)
      const resolved = items
        .filter((item): item is typeof item & { branchAssignments: any[] } => {
          // Apply the helper to determine availability
          const menuItemForResolution: MenuItemForResolution = {
            price: item.price,
            isActive: item.isActive,
            deletedAt: item.deletedAt,
            availabilityMode: item.availabilityMode,
            branchAssignments: (item as any).branchAssignments || [],
          };
          return isItemAvailableInBranch(menuItemForResolution, branchId);
        })
        .map(item => {
          const menuItemForResolution: MenuItemForResolution = {
            price: item.price,
            isActive: item.isActive,
            deletedAt: item.deletedAt,
            availabilityMode: item.availabilityMode,
            branchAssignments: (item as any).branchAssignments || [],
          };
          const resolvedPrice = resolveBranchPrice(menuItemForResolution, branchId);
          // Strip branchAssignments from the response — cashier doesn't need it
          // (it was only included for resolution purposes)
          const { branchAssignments, ...itemWithoutAssignments } = item as any;
          return {
            ...itemWithoutAssignments,
            price: resolvedPrice, // plain number, branch-resolved
            priceIsOverridden: resolvedPrice !== item.price, // for UI hints if needed
          };
        });

      return resolved;
    }, 600000); // 10 minute cache for POS

    return NextResponse.json({
      success: true,
      menuItems
    }, {
        headers: {
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('Get POS menu items error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch menu items' },
      { status: 500 }
    );
  }
}
