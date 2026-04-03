// Migration endpoint to populate BranchInventory.costPerUnit from Ingredient.costPerUnit
// This ensures existing branch inventory gets the correct pricing

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST() {
  try {
    // Get all BranchInventory records
    const branchInventories = await db.branchInventory.findMany({
      include: {
        ingredient: true
      }
    });

    let updatedCount = 0;

    // Update each BranchInventory with the ingredient's costPerUnit
    for (const inventory of branchInventories) {
      if (inventory.costPerUnit === 0 && inventory.ingredient.costPerUnit > 0) {
        await db.branchInventory.update({
          where: { id: inventory.id },
          data: {
            costPerUnit: inventory.ingredient.costPerUnit
          }
        });
        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration completed. Updated ${updatedCount} records.`
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    );
  }
}
