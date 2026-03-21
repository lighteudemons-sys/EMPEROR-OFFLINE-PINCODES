import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Debug endpoint to find items with product cost > selling price
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build date filter
    const dateFilter: any = {};
    if (startDate && endDate) {
      dateFilter.orderTimestamp = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    // Build branch filter
    const branchFilter: any = {};
    if (branchId && branchId !== 'all') {
      branchFilter.branchId = branchId;
    }

    // Fetch sold orders
    const orders = await db.order.findMany({
      where: {
        ...dateFilter,
        ...branchFilter,
        isRefunded: false,
      },
      include: {
        items: true,
      },
    });

    // Fetch recipes and ingredients
    const recipes = await db.recipe.findMany({
      include: {
        ingredient: true,
        menuItem: true,
        menuItemVariant: true,
      },
    });

    // Fetch menu items
    const menuItems = await db.menuItem.findMany({
      select: { id: true, name: true, price: true, category: true },
    });

    // Build recipe map: menuItemId -> menuItemVariantId -> ingredients[]
    const recipeMap = new Map<string, Map<string | null, Array<{ ingredientId: string; quantity: number; costPerUnit: number }>>>();
    recipes.forEach(recipe => {
      if (!recipeMap.has(recipe.menuItemId)) {
        recipeMap.set(recipe.menuItemId, new Map());
      }
      const variantMap = recipeMap.get(recipe.menuItemId)!;
      if (!variantMap.has(recipe.menuItemVariantId)) {
        variantMap.set(recipe.menuItemVariantId, []);
      }
      variantMap.get(recipe.menuItemVariantId)!.push({
        ingredientId: recipe.ingredientId,
        quantity: recipe.quantityRequired,
        costPerUnit: recipe.ingredient?.costPerUnit || 0,
      });
    });

    // Build menu item map
    const menuItemMap = new Map<string, { name: string; price: number; category: string }>();
    menuItems.forEach(item => {
      menuItemMap.set(item.id, { name: item.name, price: item.price, category: item.category || 'Unknown' });
    });

    // Analyze each sold menu item
    const itemAnalysis = new Map<string, {
      menuItemId: string;
      name: string;
      category: string;
      sellingPrice: number;
      totalSold: number;
      totalRevenue: number;
      totalProductCost: number;
      costPerUnit: number;
      profitMargin: number;
      recipes: any[];
    }>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const menuItemId = item.menuItemId;
        const menuItemData = menuItemMap.get(menuItemId);
        
        if (!menuItemData) return;

        if (!itemAnalysis.has(menuItemId)) {
          itemAnalysis.set(menuItemId, {
            menuItemId,
            name: menuItemData.name,
            category: menuItemData.category,
            sellingPrice: menuItemData.price,
            totalSold: 0,
            totalRevenue: 0,
            totalProductCost: 0,
            costPerUnit: 0,
            profitMargin: 0,
            recipes: [],
          });
        }

        const analysis = itemAnalysis.get(menuItemId)!;
        analysis.totalSold += item.quantity;
        analysis.totalRevenue += item.subtotal || (item.quantity * item.unitPrice);

        // Calculate product cost for this item
        const variantMap = recipeMap.get(menuItemId);
        if (variantMap) {
          let ingredientMap = variantMap.get(item.menuItemVariantId);
          if (!ingredientMap) {
            ingredientMap = variantMap.get(null);
          }

          if (ingredientMap) {
            let itemCost = 0;
            const itemRecipes: any[] = [];

            ingredientMap.forEach((ing, idx) => {
              const cost = ing.quantity * ing.costPerUnit;
              itemCost += cost;
              
              // Store recipe details for the first occurrence
              if (itemRecipes.length === 0 || itemRecipes.length < 5) {
                itemRecipes.push({
                  ingredientId: ing.ingredientId,
                  quantity: ing.quantity,
                  costPerUnit: ing.costPerUnit,
                  totalCost: cost,
                });
              }
            });

            analysis.totalProductCost += itemCost * item.quantity;
            if (analysis.recipes.length === 0) {
              analysis.recipes = itemRecipes;
            }
          }
        }
      });
    });

    // Calculate per-unit costs and margins
    const results = Array.from(itemAnalysis.values()).map(item => {
      const costPerUnit = item.totalSold > 0 ? item.totalProductCost / item.totalSold : 0;
      const profitMargin = item.sellingPrice > 0 ? ((item.sellingPrice - costPerUnit) / item.sellingPrice) * 100 : 0;

      return {
        ...item,
        costPerUnit,
        profitMargin,
        // Flag problematic items
        isCostly: costPerUnit > item.sellingPrice,
        isLowMargin: profitMargin < 0 && profitMargin > -50, // Negative but not extreme
        isExtreme: costPerUnit > item.sellingPrice * 2, // Cost is more than 2x selling price
      };
    });

    // Sort by most problematic first (highest loss)
    const sortedResults = results.sort((a, b) => (a.costPerUnit - a.sellingPrice) - (b.costPerUnit - b.sellingPrice));

    // Summary statistics
    const totalRevenue = sortedResults.reduce((sum, item) => sum + item.totalRevenue, 0);
    const totalProductCost = sortedResults.reduce((sum, item) => sum + item.totalProductCost, 0);
    const netProfit = totalRevenue - totalProductCost;

    const problematicItems = sortedResults.filter(item => item.isCostly || item.isExtreme);
    const lowMarginItems = sortedResults.filter(item => item.isLowMargin);

    return NextResponse.json({
      success: true,
      summary: {
        totalRevenue,
        totalProductCost,
        netProfit,
        totalItems: sortedResults.length,
        problematicItems: problematicItems.length,
        lowMarginItems: lowMarginItems.length,
        averageProfitMargin: sortedResults.length > 0 
          ? sortedResults.reduce((sum, item) => sum + item.profitMargin, 0) / sortedResults.length 
          : 0,
      },
      problematicItems: problematicItems.map(item => ({
        menuItemId: item.menuItemId,
        name: item.name,
        category: item.category,
        sellingPrice: item.sellingPrice,
        costPerUnit: item.costPerUnit,
        profitMargin: item.profitMargin,
        totalSold: item.totalSold,
        totalRevenue: item.totalRevenue,
        totalProductCost: item.totalProductCost,
        loss: item.totalProductCost - item.totalRevenue,
        recipes: item.recipes,
      })),
      lowMarginItems: lowMarginItems.map(item => ({
        menuItemId: item.menuItemId,
        name: item.name,
        category: item.category,
        sellingPrice: item.sellingPrice,
        costPerUnit: item.costPerUnit,
        profitMargin: item.profitMargin,
        totalSold: item.totalSold,
      })),
      allItems: sortedResults.map(item => ({
        menuItemId: item.menuItemId,
        name: item.name,
        category: item.category,
        sellingPrice: item.sellingPrice,
        costPerUnit: item.costPerUnit,
        profitMargin: item.profitMargin,
        totalSold: item.totalSold,
        totalRevenue: item.totalRevenue,
        totalProductCost: item.totalProductCost,
      })),
    });
  } catch (error) {
    console.error('[Product Cost Check] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check product costs' },
      { status: 500 }
    );
  }
}
