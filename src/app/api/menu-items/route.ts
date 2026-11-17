import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCached, invalidateCache, invalidateCachePattern, cacheKeys } from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const active = searchParams.get('active');
    const includeVariants = searchParams.get('includeVariants') === 'true';
    const branchId = searchParams.get('branchId');

    // Generate cache key based on query parameters
    const cacheKey = `menu:items:${category || 'all'}:${active || 'all'}:${includeVariants ? 'variants' : 'no-variants'}:${branchId || 'all-branches'}`;

    const menuItems = await getCached(cacheKey, async () => {
      // Build where clause
      // Phase 3.3: exclude soft-deleted items by default (unless explicitly requested via ?includeArchived=true)
      const includeArchived = searchParams.get('includeArchived') === 'true';
      const whereClause: any = {
        ...(category && category !== 'all' ? { category } : {}),
        ...(active !== null ? { isActive: active === 'true' } : {}),
        ...(includeArchived ? {} : { deletedAt: null }),
      };

      // If branchId is provided, filter menu items by branch
      // Items are available if they have NO branch assignments (all branches) OR have an assignment to this branch
      if (branchId) {
        // This is a complex filter - we'll get items and filter in code for simplicity
        // Or use a more sophisticated Prisma query
        const allMenuItems = await db.menuItem.findMany({
          where: whereClause,
          orderBy: [
            { sortOrder: 'asc' },
            { name: 'asc' },
          ],
          include: {
            branchAssignments: {
              include: {
                branch: {
                  select: { id: true, branchName: true },
                },
              },
            },
            recipes: {
              include: {
                ingredient: {
                  select: {
                    id: true,
                    name: true,
                    costPerUnit: true,
                    unit: true,
                  },
                },
              },
            },
            categoryRel: {
              select: {
                id: true,
                name: true,
                sortOrder: true,
                requiresCaptainReceipt: true,
              },
            },
            ...(includeVariants ? {
              variants: {
                include: {
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
                  recipes: {
                    include: {
                      ingredient: {
                        select: {
                          id: true,
                          name: true,
                          costPerUnit: true,
                          unit: true,
                        },
                      },
                    },
                  },
                },
                orderBy: { sortOrder: 'asc' },
              },
            } : {}),
          },
        });

        // Phase 3.1b: Filter by branch using the new availabilityMode field.
        //   - GLOBAL items: always available (unless a row exists with isActive=false for this branch)
        //   - EXPLICIT items: only available if a row exists for this branch with isActive=true
        // (This replaces the old broken logic that treated any branch assignment row
        //  as making the item "EXPLICIT", which hid GLOBAL items from branches that
        //  didn't have a price override row.)
        return allMenuItems.filter(item => {
          if (item.availabilityMode === 'GLOBAL') {
            // GLOBAL: available unless explicitly disabled for this branch
            const assignment = item.branchAssignments?.find(ba => ba.branchId === branchId);
            return !assignment || assignment.isActive;
          } else {
            // EXPLICIT: only available if a row exists for this branch AND isActive=true
            const assignment = item.branchAssignments?.find(ba => ba.branchId === branchId);
            return !!assignment && assignment.isActive;
          }
        });
      } else {
        // No branch filter, return all items (including the new fields)
        return await db.menuItem.findMany({
          where: whereClause,
          orderBy: [
            { sortOrder: 'asc' },
            { name: 'asc' },
          ],
          include: {
            // Phase 3.3: include full branch assignments (with price + isActive)
            branchAssignments: {
              include: {
                branch: {
                  select: { id: true, branchName: true },
                },
              },
            },
            recipes: {
              include: {
                ingredient: {
                  select: {
                    id: true,
                    name: true,
                    costPerUnit: true,
                    unit: true,
                  },
                },
              },
            },
            categoryRel: {
              select: {
                id: true,
                name: true,
                sortOrder: true,
                requiresCaptainReceipt: true,
              },
            },
            ...(includeVariants ? {
              variants: {
                include: {
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
                  recipes: {
                    include: {
                      ingredient: {
                        select: {
                          id: true,
                          name: true,
                          costPerUnit: true,
                          unit: true,
                        },
                      },
                    },
                  },
                },
                orderBy: { sortOrder: 'asc' },
              },
            } : {}),
          },
        });
      }
    }, 300000); // 5 minute cache

    // Calculate dynamic product cost for each menu item and its variants
    const menuItemsWithCost = menuItems.map(item => {
      // Calculate base product cost (only from base recipes where menuItemVariantId is null)
      const baseProductCost = item.recipes.reduce((total, recipe) => {
        // Skip variant-specific recipes - only count base recipes
        if (recipe.menuItemVariantId !== null) {
          return total;
        }
        const ingredientCost = recipe.quantityRequired * recipe.ingredient.costPerUnit;
        return total + ingredientCost;
      }, 0);

      // Calculate profit and margin for base item (using base price)
      const profit = item.price - baseProductCost;
      const profitMargin = item.price > 0 ? (profit / item.price) * 100 : 0;

      // Calculate costs for each variant
      const variantsWithCost = item.variants?.map(variant => {
        // Use variant-specific recipes if available, otherwise fall back to base recipes
        const variantRecipes = variant.recipes && variant.recipes.length > 0
          ? variant.recipes
          : item.recipes;

        const variantProductCost = variantRecipes.reduce((total, recipe) => {
          const ingredientCost = recipe.quantityRequired * recipe.ingredient.costPerUnit;
          return total + ingredientCost;
        }, 0);

        const variantPrice = item.price + variant.priceModifier;
        const variantProfit = variantPrice - variantProductCost;
        const variantProfitMargin = variantPrice > 0 ? (variantProfit / variantPrice) * 100 : 0;

        return {
          ...variant,
          menuItemId: item.id, // Add parent menu item ID
          productCost: parseFloat(variantProductCost.toFixed(2)),
          profit: parseFloat(variantProfit.toFixed(2)),
          profitMargin: parseFloat(variantProfitMargin.toFixed(2)),
        };
      }) || [];

      // Extract branch IDs from assignments
      const assignedBranchIds = item.branchAssignments?.map(ba => ba.branchId) || [];
      const isAvailableToAllBranches = assignedBranchIds.length === 0;

      return {
        ...item,
        productCost: parseFloat(baseProductCost.toFixed(2)),
        profit: parseFloat(profit.toFixed(2)),
        profitMargin: parseFloat(profitMargin.toFixed(2)),
        variants: variantsWithCost,
        branchIds: assignedBranchIds,
        availableToAllBranches: isAvailableToAllBranches,
      };
    });

    return NextResponse.json({ menuItems: menuItemsWithCost });
  } catch (error: any) {
    console.error('Get menu items error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch menu items' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if this is a PATCH override for updates
    if (body._method === 'PATCH') {
      return await handleUpdate(body);
    }

    // Original POST logic for creating new items
    // Phase 3.3: Added availabilityMode and branchPrices support
    const {
      name, category, categoryId, price, taxRate, isActive, sortOrder,
      hasVariants, branchIds, imagePath,
      availabilityMode, branchPrices,
    } = body;

    if (!name || !price) {
      return NextResponse.json(
        { error: 'Missing required fields: name, price' },
        { status: 400 }
      );
    }

    // Validate categoryId if provided
    let validCategoryId = null;
    if (categoryId) {
      const cat = await db.category.findUnique({ where: { id: categoryId } });
      if (!cat) {
        return NextResponse.json(
          { error: 'Category not found' },
          { status: 404 }
        );
      }
      validCategoryId = categoryId;
    }

    // Validate branchIds if provided (legacy field — for backward compatibility with existing UI)
    let validBranchIds: string[] = [];
    let isExplicit = false;
    if (branchIds && Array.isArray(branchIds) && branchIds.length > 0) {
      // Check if "all" is selected (special case)
      if (!branchIds.includes('all')) {
        // Validate each branch ID
        const branches = await db.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true },
        });
        validBranchIds = branches.map(b => b.id);
        if (validBranchIds.length > 0) {
          isExplicit = true; // has branch-specific assignments → EXPLICIT
        }
      }
      // If "all" is in the array, we leave validBranchIds empty (means available to all)
    }

    // Phase 3.3: If branchPrices is provided, it takes precedence over branchIds
    // (it carries both the assignment and the price override)
    let resolvedAvailabilityMode: 'GLOBAL' | 'EXPLICIT' = 'GLOBAL';
    if (availabilityMode === 'EXPLICIT' || availabilityMode === 'GLOBAL') {
      resolvedAvailabilityMode = availabilityMode;
    } else if (isExplicit) {
      resolvedAvailabilityMode = 'EXPLICIT';
    }

    // Build branch-assignments data from either branchPrices (new) or branchIds (legacy)
    let branchAssignmentsData: { branchId: string; price?: number; isActive?: boolean }[] = [];
    if (branchPrices && Array.isArray(branchPrices) && branchPrices.length > 0) {
      // Validate each branchId in branchPrices
      const bpBranchIds = branchPrices.map((bp: any) => bp.branchId).filter(Boolean);
      const branches = await db.branch.findMany({
        where: { id: { in: bpBranchIds } },
        select: { id: true },
      });
      const validBpBranchIds = new Set(branches.map(b => b.id));
      branchAssignmentsData = branchPrices
        .filter((bp: any) => validBpBranchIds.has(bp.branchId))
        .map((bp: any) => ({
          branchId: bp.branchId,
          price: bp.price !== undefined && bp.price !== null && bp.price !== ''
            ? Number(bp.price)
            : undefined,
          isActive: bp.isActive !== undefined ? Boolean(bp.isActive) : true,
        }));
      if (branchAssignmentsData.length > 0) {
        // Has explicit branch rows — implies EXPLICIT mode (unless availabilityMode says GLOBAL)
        if (availabilityMode !== 'GLOBAL') {
          resolvedAvailabilityMode = 'EXPLICIT';
        }
      }
    } else if (validBranchIds.length > 0) {
      // Legacy: branchIds without prices — just create availability rows
      branchAssignmentsData = validBranchIds.map(branchId => ({
        branchId,
        isActive: true,
      }));
    }

    // Create menu item
    const menuItem = await db.menuItem.create({
      data: {
        name,
        category: category || 'Other',
        categoryId: validCategoryId,
        price: parseFloat(price),
        taxRate: taxRate !== undefined ? parseFloat(taxRate) : 0.14,
        isActive: isActive !== undefined ? isActive : true,
        sortOrder: sortOrder !== undefined && sortOrder !== '' ? parseInt(sortOrder) : null,
        hasVariants: hasVariants !== undefined ? hasVariants : false,
        imagePath: imagePath || null,
        availabilityMode: resolvedAvailabilityMode,
      },
    });

    // Create branch assignments (with optional prices) if any were specified
    if (branchAssignmentsData.length > 0) {
      await db.menuItemBranch.createMany({
        data: branchAssignmentsData.map(ba => ({
          menuItemId: menuItem.id,
          branchId: ba.branchId,
          price: ba.price !== undefined ? ba.price : null,
          isActive: ba.isActive !== undefined ? ba.isActive : true,
        })),
        skipDuplicates: true,
      });
    }

    // Phase 3.3: Invalidate BOTH the admin cache and the POS cache
    // (POS cache was previously NOT invalidated, causing stale prices for up to 10 min)
    invalidateCachePattern('^menu:items:');

    return NextResponse.json({
      success: true,
      menuItem,
    });
  } catch (error: any) {
    console.error('Menu item POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process menu item request', details: error.message },
      { status: 500 }
    );
  }
}

async function handleUpdate(body: any) {
  const {
    id, name, category, categoryId, price, taxRate, isActive, sortOrder,
    hasVariants, branchIds, imagePath,
    availabilityMode, branchPrices,
  } = body;

  if (!id) {
    return NextResponse.json(
      { error: 'Menu item ID is required' },
      { status: 400 }
    );
  }

  // Check if menu item exists
  const existingItem = await db.menuItem.findUnique({
    where: { id },
  });

  if (!existingItem) {
    return NextResponse.json(
      { error: 'Menu item not found' },
      { status: 404 }
    );
  }

  // Validate categoryId if provided and not empty
  if (categoryId && categoryId.trim() !== '') {
    const cat = await db.category.findUnique({ where: { id: categoryId } });
    if (!cat) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }
  }

  // Build update data with proper validation
  const updateData: any = {};
  if (name && name.trim() !== '') updateData.name = name.trim();
  if (category && category.trim() !== '') updateData.category = category.trim();
  if (categoryId && categoryId.trim() !== '') updateData.categoryId = categoryId.trim();
  if (price !== undefined && price !== '' && !isNaN(parseFloat(price))) {
    updateData.price = parseFloat(price);
  }
  if (taxRate !== undefined && taxRate !== '' && !isNaN(parseFloat(taxRate))) {
    updateData.taxRate = parseFloat(taxRate);
  }
  if (isActive !== undefined) updateData.isActive = isActive;
  if (sortOrder !== undefined && sortOrder !== '' && !isNaN(parseInt(sortOrder))) {
    updateData.sortOrder = parseInt(sortOrder);
  }
  if (hasVariants !== undefined) updateData.hasVariants = hasVariants;
  if (imagePath !== undefined) updateData.imagePath = imagePath;
  // Phase 3.3: allow updating availabilityMode
  if (availabilityMode === 'GLOBAL' || availabilityMode === 'EXPLICIT') {
    updateData.availabilityMode = availabilityMode;
  }

  // Update menu item
  const menuItem = await db.menuItem.update({
    where: { id },
    data: updateData,
  });

  // Handle branch assignments if provided.
  // Phase 3.3: branchPrices takes precedence over branchIds (legacy).
  // Either field triggers a full replace of MenuItemBranch rows for this item.
  if (branchPrices !== undefined) {
    // New path: branchPrices (with optional price overrides)
    await db.menuItemBranch.deleteMany({
      where: { menuItemId: id },
    });

    if (Array.isArray(branchPrices) && branchPrices.length > 0) {
      const bpBranchIds = branchPrices.map((bp: any) => bp.branchId).filter(Boolean);
      const branches = await db.branch.findMany({
        where: { id: { in: bpBranchIds } },
        select: { id: true },
      });
      const validBpBranchIds = new Set(branches.map(b => b.id));
      const validAssignments = branchPrices
        .filter((bp: any) => validBpBranchIds.has(bp.branchId))
        .map((bp: any) => ({
          menuItemId: id,
          branchId: bp.branchId,
          price: bp.price !== undefined && bp.price !== null && bp.price !== ''
            ? Number(bp.price)
            : null,
          isActive: bp.isActive !== undefined ? Boolean(bp.isActive) : true,
        }));
      if (validAssignments.length > 0) {
        await db.menuItemBranch.createMany({
          data: validAssignments,
          skipDuplicates: true,
        });
      }
    }
  } else if (branchIds !== undefined) {
    // Legacy path: branchIds (just availability, no prices)
    await db.menuItemBranch.deleteMany({
      where: { menuItemId: id },
    });

    if (branchIds && Array.isArray(branchIds) && branchIds.length > 0 && !branchIds.includes('all')) {
      const branches = await db.branch.findMany({
        where: { id: { in: branchIds } },
        select: { id: true },
      });
      const validBranchIds = branches.map(b => b.id);
      if (validBranchIds.length > 0) {
        await db.menuItemBranch.createMany({
          data: validBranchIds.map(branchId => ({
            menuItemId: id,
            branchId,
            isActive: true,
            price: null,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  // Phase 3.3: Invalidate BOTH the admin cache and the POS cache
  invalidateCachePattern('^menu:items:');

  return NextResponse.json({
    success: true,
    menuItem,
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    return await handleUpdate(body);
  } catch (error: any) {
    console.error('Update menu item error:', error);
    return NextResponse.json(
      { error: 'Failed to update menu item', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Menu item ID is required' },
        { status: 400 }
      );
    }

    // Check if menu item exists
    const existingItem = await db.menuItem.findUnique({
      where: { id },
      select: { id: true, name: true, deletedAt: true },
    });

    if (!existingItem) {
      return NextResponse.json(
        { error: 'Menu item not found' },
        { status: 404 }
      );
    }

    // Phase 3.3: SOFT-DELETE instead of hard delete.
    // The OrderItem.menuItem FK is now ON DELETE RESTRICT (changed in migration),
    // so a hard delete would fail if any historical orders reference this item.
    // Soft-delete sets deletedAt = now() and isActive = false, which:
    //   - Hides the item from the POS (isActive = false filter)
    //   - Hides the item from the admin list (deletedAt IS NULL filter)
    //   - Preserves all historical OrderItem rows (no cascade)
    //   - Allows the item to be un-archived later if needed
    await db.menuItem.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    // Phase 3.3: Invalidate BOTH the admin cache and the POS cache
    invalidateCachePattern('^menu:items:');

    return NextResponse.json({
      success: true,
      message: 'Menu item archived successfully (soft-delete). Historical orders preserved.',
    });
  } catch (error: any) {
    console.error('Delete menu item error:', error);
    return NextResponse.json(
      { error: 'Failed to delete menu item' },
      { status: 500 }
    );
  }
}
