import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Assign courier to order
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { courierId } = body;

    if (!courierId) {
      return NextResponse.json(
        { error: 'Courier ID is required' },
        { status: 400 }
      );
    }

    // Check if order exists
    const existingOrder = await db.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Check if courier exists and is active
    const courier = await db.courier.findUnique({
      where: { id: courierId },
    });

    if (!courier) {
      return NextResponse.json(
        { error: 'Courier not found' },
        { status: 404 }
      );
    }

    if (!courier.isActive) {
      return NextResponse.json(
        { error: 'Courier is not active' },
        { status: 400 }
      );
    }

    // Update order with courier
    const updatedOrder = await db.order.update({
      where: { id },
      data: {
        courierId: courierId,
        status: 'ASSIGNED', // Automatically set status to ASSIGNED when courier is assigned
        updatedAt: new Date(),
      },
      include: {
        courier: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        deliveryArea: {
          select: {
            id: true,
            name: true,
            fee: true,
          },
        },
        items: true,
      },
    });

    return NextResponse.json({
      success: true,
      order: updatedOrder,
    });
  } catch (error: any) {
    console.error('Assign courier error:', error);
    return NextResponse.json(
      { error: 'Failed to assign courier' },
      { status: 500 }
    );
  }
}
