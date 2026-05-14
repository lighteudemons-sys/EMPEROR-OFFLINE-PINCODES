import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { ingredientId, quantityRequired } = body;

    if (!ingredientId || !quantityRequired) {
      return NextResponse.json(
        { error: 'ingredientId and quantityRequired are required' },
        { status: 400 }
      );
    }

    const recipe = await db.recipe.findUnique({
      where: { id },
    });

    if (!recipe) {
      return NextResponse.json(
        { error: 'Recipe not found' },
        { status: 404 }
      );
    }

    const updatedRecipe = await db.recipe.update({
      where: { id },
      data: {
        ingredientId,
        quantityRequired: parseFloat(quantityRequired),
        version: recipe.version + 1,
      },
    });

    return NextResponse.json(
      { recipe: updatedRecipe, message: 'Recipe updated successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating recipe:', error);
    return NextResponse.json(
      { error: 'Failed to update recipe' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // In Next.js 16, params is a Promise and must be awaited
    const { id } = await params;

    await db.recipe.delete({
      where: { id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error deleting recipe:', error);
    return NextResponse.json(
      { error: 'Failed to delete recipe' },
      { status: 500 }
    );
  }
}
