import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

// Validation schema for updating a promo code
const updateCodeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  isActive: z.boolean().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
});

// GET /api/promo-codes/[id] - Get a single promo code
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Code ID is required' },
        { status: 400 }
      );
    }

    const code = await db.promotionCode.findUnique({
      where: { id },
      include: {
        promotion: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Promo code not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      code,
    });
  } catch (error) {
    console.error('Error fetching promo code:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch promo code' },
      { status: 500 }
    );
  }
}

// PUT /api/promo-codes/[id] - Update a promo code
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Code ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = updateCodeSchema.parse(body);

    // Check if code exists
    const existingCode = await db.promotionCode.findUnique({
      where: { id },
    });

    if (!existingCode) {
      return NextResponse.json(
        { success: false, error: 'Promo code not found' },
        { status: 404 }
      );
    }

    // Check if the new code already exists (if code is being changed)
    if (validatedData.code && validatedData.code !== existingCode.code) {
      const duplicateCode = await db.promotionCode.findFirst({
        where: {
          code: validatedData.code.toUpperCase(),
          id: { not: id },
        },
      });

      if (duplicateCode) {
        return NextResponse.json(
          { success: false, error: 'Code already exists' },
          { status: 400 }
        );
      }
    }

    // Update the code
    const updatedCode = await db.promotionCode.update({
      where: { id },
      data: {
        code: validatedData.code.toUpperCase(),
        ...(validatedData.isActive !== undefined && { isActive: validatedData.isActive }),
        ...(validatedData.maxUses !== undefined && { maxUses: validatedData.maxUses }),
      },
    });

    return NextResponse.json({
      success: true,
      code: updatedCode,
    });
  } catch (error) {
    console.error('Error updating promo code:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to update promo code' },
      { status: 500 }
    );
  }
}

// DELETE /api/promo-codes/[id] - Delete a promo code
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Code ID is required' },
        { status: 400 }
      );
    }

    // Check if code has been used
    const code = await db.promotionCode.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            usageLogs: true,
          },
        },
      },
    });

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Promo code not found' },
        { status: 404 }
      );
    }

    if (code._count.usageLogs > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete a code that has been used. Deactivate it instead.',
        },
        { status: 400 }
      );
    }

    // Delete the code
    await db.promotionCode.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Promo code deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting promo code:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete promo code' },
      { status: 500 }
    );
  }
}
