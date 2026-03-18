import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateCaptainReceipt, CaptainReceiptData } from '@/lib/escpos-encoder';

/**
 * GET /api/orders/orderId/captain-receipt
 * Generate a Captain Receipt (simplified receipt for barista)
 * Only includes items that belong to categories with requiresCaptainReceipt = true
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    console.log('[Captain Receipt] Generating captain receipt for order:', orderId);

    // Fetch order with items, categories, and branch
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            menuItem: {
              include: {
                categoryRel: true,
              },
            },
          },
        },
        branch: true,
      },
    });

    if (!order) {
      console.log('[Captain Receipt] Order not found:', orderId);
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    console.log('[Captain Receipt] Order found:', {
      orderNumber: order.orderNumber,
      branch: order.branch?.branchName,
      totalItems: order.items.length,
    });

    // Filter items that require captain receipt
    // Use the requiresCaptainReceipt field that was captured at order creation time
    // This is more reliable than checking the menuItem relationship
    const captainReceiptItems = order.items
      .filter(item => item.requiresCaptainReceipt && !item.isVoided)
      .map(item => ({
        itemName: item.itemName,
        quantity: item.quantity,
        variantName: item.variantName,
        categoryName: item.menuItem?.categoryRel?.name || 'Unknown',
      }));

    // If no items require captain receipt, return empty response
    if (captainReceiptItems.length === 0) {
      console.log('[Captain Receipt] No items require captain receipt');
      return NextResponse.json({
        success: true,
        requiresCaptainReceipt: false,
        message: 'No items require captain receipt',
      });
    }

    console.log('[Captain Receipt] Items for captain receipt:', captainReceiptItems.length);

    // Get receipt settings for logo
    let logoData: string | undefined = undefined;
    try {
      const dbSettings = await db.receiptSettings.findFirst({
        where: {
          OR: [
            { branchId: order.branchId },
            { branchId: null }
          ]
        },
        orderBy: {
          branchId: 'desc'
        }
      });

      if (dbSettings?.logoData) {
        logoData = dbSettings.logoData;
      }
    } catch (error) {
      console.error('[Captain Receipt] Failed to fetch settings:', error);
    }

    // Prepare captain receipt data
    const captainReceiptData: CaptainReceiptData = {
      storeName: 'Emperor Coffee',
      branchName: order.branch?.branchName || 'Coffee Shop',
      orderNumber: order.orderNumber,
      date: new Date(order.orderTimestamp),
      items: captainReceiptItems,
      logoData,
      fontSize: 'medium',
    };

    console.log('[Captain Receipt] Receipt data prepared');

    // Generate ESC/POS data
    const escposData = generateCaptainReceipt(captainReceiptData);

    console.log('[Captain Receipt] Generated captain receipt, size:', escposData.length);

    // Return as base64
    const base64Data = Buffer.from(escposData).toString('base64');

    return NextResponse.json({
      success: true,
      requiresCaptainReceipt: true,
      order,
      captainReceiptItems,
      escposData: base64Data,
      size: escposData.length,
    });

  } catch (error) {
    console.error('[Captain Receipt] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json(
      {
        error: 'Failed to generate captain receipt',
        message: errorMessage,
        details: errorStack,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
