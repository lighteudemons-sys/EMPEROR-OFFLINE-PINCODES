import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      branchId,
      ingredientId,
      quantity,
      pricePerUnit,
      totalCost,
      supplier,
      userId,
    } = body;

    // Validate request
    if (
      branchId === undefined || branchId === null || branchId === '' ||
      ingredientId === undefined || ingredientId === null || ingredientId === '' ||
      quantity === undefined || quantity === null || isNaN(quantity) ||
      pricePerUnit === undefined || pricePerUnit === null || isNaN(pricePerUnit) ||
      userId === undefined || userId === null || userId === ''
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (quantity <= 0 || pricePerUnit < 0) {
      return NextResponse.json(
        { error: 'Quantity and price must be positive' },
        { status: 400 }
      );
    }

    // Get ingredient info
    const ingredient = await db.ingredient.findUnique({
      where: { id: ingredientId },
    });

    if (!ingredient) {
      return NextResponse.json(
        { error: 'Ingredient not found' },
        { status: 404 }
      );
    }

    // Get current inventory
    const inventory = await db.branchInventory.findUnique({
      where: {
        branchId_ingredientId: {
          branchId,
          ingredientId,
        },
      },
    });

    const stockBefore = inventory?.currentStock || 0;
    const oldPricePerUnit = inventory?.costPerUnit || ingredient.costPerUnit || 0;
    const stockAfter = stockBefore + quantity;

    // Calculate weighted average price
    // Formula: (Old Stock * Old Price + New Stock * New Price) / Total Stock
    let newPricePerUnit = pricePerUnit;
    if (stockBefore > 0 && oldPricePerUnit > 0) {
      const oldValue = stockBefore * oldPricePerUnit;
      const newValue = quantity * pricePerUnit;
      const totalValue = oldValue + newValue;
      newPricePerUnit = totalValue / stockAfter;
    }

    // Create restock transaction
    const result = await db.$transaction(async (tx) => {
      // Update or create inventory with weighted average price
      if (inventory) {
        await tx.branchInventory.update({
          where: { id: inventory.id },
          data: {
            currentStock: stockAfter,
            costPerUnit: newPricePerUnit, // Update branch-specific price
            lastRestockAt: new Date(),
            lastModifiedAt: new Date(),
          },
        });
      } else {
        await tx.branchInventory.create({
          data: {
            branchId,
            ingredientId,
            currentStock: stockAfter,
            costPerUnit: pricePerUnit, // Use purchase price for new inventory
            lastRestockAt: new Date(),
            lastModifiedAt: new Date(),
          },
        });
      }

      // Create inventory transaction
      await tx.inventoryTransaction.create({
        data: {
          branchId,
          ingredientId,
          transactionType: 'RESTOCK',
          quantityChange: quantity,
          stockBefore,
          stockAfter,
          reason: supplier ? `Supplier: ${supplier} (Price: ${pricePerUnit.toFixed(2)} ${'/unit'})` : `Manual restock (Price: ${pricePerUnit.toFixed(2)} ${'/unit'})`,
          createdBy: userId,
        },
      });

      return { stockBefore, stockAfter, newPricePerUnit, oldPricePerUnit };
    });

    return NextResponse.json({
      success: true,
      message: `Restocked ${quantity} ${ingredient.unit} of ${ingredient.name}. New price: ${result.newPricePerUnit.toFixed(2)} ${'/unit'}`,
      restock: {
        ingredient: ingredient.name,
        quantity,
        unit: ingredient.unit,
        pricePerUnit,
        totalCost,
        supplier,
        stockBefore,
        stockAfter,
        oldPricePerUnit: result.oldPricePerUnit,
        newPricePerUnit: result.newPricePerUnit,
      },
    });
  } catch (error: any) {
    console.error('Restock error:', error);
    return NextResponse.json(
      { error: 'Failed to process restock', details: error.message },
      { status: 500 }
    );
  }
}
