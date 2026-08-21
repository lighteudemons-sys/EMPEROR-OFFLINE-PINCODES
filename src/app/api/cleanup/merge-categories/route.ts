import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    console.log('[Merge Categories] Starting safe merge...');

    const allCategories = await db.costCategory.findMany({
      orderBy: [
        { name: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    console.log('[Merge Categories] Found', allCategories.length, 'total cost categories');

    const groupedCategories: Record<string, typeof allCategories> = {};
    for (const category of allCategories) {
      if (!groupedCategories[category.name]) {
        groupedCategories[category.name] = [];
      }
      groupedCategories[category.name].push(category);
    }

    let mergedCategories = 0;
    let reassignedCosts = 0;
    let deletedDuplicates = 0;
    const errors: string[] = [];

    for (const [name, categories] of Object.entries(groupedCategories)) {
      if (categories.length <= 1) continue;

      console.log('[Merge Categories] Processing duplicates for:', name, 'Count:', categories.length);

      let globalCategory = categories.find(c => c.branchId === null);

      if (!globalCategory) {
        const firstCategory = categories[0];
        globalCategory = await db.costCategory.update({
          where: { id: firstCategory.id },
          data: { branchId: null },
        });
        console.log('[Merge Categories] Made first category global:', globalCategory.id);
        mergedCategories++;
      } else {
        console.log('[Merge Categories] Found existing global category:', globalCategory.id);
      }

      const duplicateCategories = categories.filter(c => c.id !== globalCategory.id);

      for (const duplicate of duplicateCategories) {
        try {
          const costsInDuplicate = await db.branchCost.findMany({
            where: { costCategoryId: duplicate.id },
          });

          if (costsInDuplicate.length > 0) {
            console.log('[Merge Categories] Reassigning', costsInDuplicate.length, 'costs from category', duplicate.id, 'to global category', globalCategory.id);

            await db.branchCost.updateMany({
              where: { costCategoryId: duplicate.id },
              data: { costCategoryId: globalCategory.id },
            });

            reassignedCosts += costsInDuplicate.length;
          }

          await db.costCategory.delete({
            where: { id: duplicate.id },
          });

          deletedDuplicates++;
          console.log('[Merge Categories] Deleted duplicate category:', duplicate.id);
        } catch (error: any) {
          const errorMsg = 'Failed to merge category ' + duplicate.id + ': ' + error.message;
          console.error('[Merge Categories]', errorMsg);
          errors.push(errorMsg);
        }
      }

      console.log('[Merge Categories] Merged category:', name, '- kept 1, deleted', duplicateCategories.length);
    }

    console.log('[Merge Categories] Merge completed:', {
      mergedCategories,
      reassignedCosts,
      deletedDuplicates,
      errors: errors.length,
    });

    return NextResponse.json({
      success: true,
      message: 'Duplicate categories merged safely - no data lost',
      summary: {
        totalCategories: allCategories.length,
        duplicateGroupsProcessed: Object.entries(groupedCategories).filter(([_, cats]) => cats.length > 1).length,
        globalCategoriesCreated: mergedCategories,
        costsReassigned: reassignedCosts,
        duplicateCategoriesDeleted: deletedDuplicates,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[Merge Categories] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Merge failed',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
