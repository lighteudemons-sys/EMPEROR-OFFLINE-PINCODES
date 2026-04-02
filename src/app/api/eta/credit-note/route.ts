/**
 * Egyptian Tax Authority (ETA) Credit Note API
 * 
 * This API handles the creation and submission of Credit Notes for refunds
 * in compliance with Egyptian E-Receipt regulations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateUBLXML, generateCreditNoteData, generateDocumentUUID } from '@/lib/eta/ubl-generator';
import { generateQRCodeDataURL } from '@/lib/eta/qr-generator';

/**
 * POST /api/eta/credit-note
 * 
 * Create and submit a Credit Note for a refunded order
 * 
 * Request body:
 * {
 *   orderId: string,           // The order being refunded
 *   reason: string,            // Reason for the refund (required)
 *   refundedItems: Array<{     // Items being refunded
 *     orderItemId: string,
 *     quantity: number,        // Quantity being refunded
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, reason, refundedItems } = body;

    // Validate required fields
    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Refund reason is required for Credit Note' },
        { status: 400 }
      );
    }

    if (!refundedItems || !Array.isArray(refundedItems) || refundedItems.length === 0) {
      return NextResponse.json(
        { error: 'Refunded items are required' },
        { status: 400 }
      );
    }

    // Fetch the original order
    const originalOrder = await db.order.findUnique({
      where: { id: orderId },
      include: {
        branch: {
          include: {
            etaSettings: true,
          },
        },
        cashier: true,
        customer: true,
        items: true,
      },
    });

    if (!originalOrder) {
      return NextResponse.json(
        { error: 'Original order not found' },
        { status: 404 }
      );
    }

    // Check if the order has ETA settings configured
    if (!originalOrder.branch.etaSettings) {
      return NextResponse.json(
        { error: 'ETA settings not configured for this branch. Please configure ETA settings first.' },
        { status: 400 }
      );
    }

    // Check if the original order has been submitted to ETA
    if (!originalOrder.etaUUID) {
      return NextResponse.json(
        { error: 'Original order has not been submitted to ETA. Cannot create Credit Note.' },
        { status: 400 }
      );
    }

    // Check if a Credit Note already exists for this order
    const existingCreditNote = await db.order.findFirst({
      where: {
        originalOrderId: orderId,
        isCreditNote: true,
      },
    });

    if (existingCreditNote) {
      return NextResponse.json(
        {
          error: 'Credit Note already exists for this order',
          creditNoteId: existingCreditNote.id,
          creditNoteUUID: existingCreditNote.etaUUID,
        },
        { status: 400 }
      );
    }

    // Calculate totals for the credit note
    let subtotal = 0;
    let totalTax = 0;
    const creditNoteItems: any[] = [];

    for (const refundedItem of refundedItems) {
      const orderItem = originalOrder.items.find(
        (item) => item.id === refundedItem.orderItemId
      );

      if (!orderItem) {
        return NextResponse.json(
          { error: `Order item ${refundedItem.orderItemId} not found` },
          { status: 400 }
        );
      }

      // Calculate proportional amounts based on refunded quantity
      const itemSubtotal = (orderItem.subtotal / orderItem.quantity) * refundedItem.quantity;
      const itemTax = (itemSubtotal * 0.14); // Assuming 14% VAT - should be calculated from actual tax rate
      const itemTotal = itemSubtotal + itemTax;

      subtotal += itemSubtotal;
      totalTax += itemTax;

      creditNoteItems.push({
        name: orderItem.itemName,
        code: orderItem.id, // Use order item ID as code
        unitType: 'EA', // Each
        quantity: refundedItem.quantity,
        unitPrice: orderItem.unitPrice,
        netPrice: itemSubtotal,
        taxRate: 0.14, // Should be calculated from actual tax rate
        taxAmount: itemTax,
        totalAmount: itemTotal,
        itemType: 'GS1', // Default item type
      });
    }

    const totalAmount = subtotal + totalTax;

    // Generate Credit Note data
    const creditNoteData = generateCreditNoteData({
      originalDocumentUuid: originalOrder.etaUUID,
      originalOrderNumber: originalOrder.orderNumber.toString(),
      reason: reason,
      issueDate: new Date(),
      seller: {
        companyName: originalOrder.branch.etaSettings.companyName,
        taxRegistrationNumber: originalOrder.branch.etaSettings.taxRegistrationNumber,
        branchCode: originalOrder.branch.etaSettings.branchCode,
        commercialRegister: originalOrder.branch.etaSettings.commercialRegister || undefined,
        address: originalOrder.branch.etaSettings.address,
        city: originalOrder.branch.etaSettings.city,
        governorate: originalOrder.branch.etaSettings.governorate,
        postalCode: originalOrder.branch.etaSettings.postalCode || undefined,
        phone: originalOrder.branch.etaSettings.phone,
        email: originalOrder.branch.etaSettings.email || undefined,
      },
      buyer: originalOrder.customer ? {
        name: originalOrder.customer.name,
        phone: originalOrder.customer.phone,
        email: originalOrder.customer.email || undefined,
      } : undefined,
      refundedItems: creditNoteItems,
      subtotal: subtotal,
      totalTaxAmount: totalTax,
      totalAmount: totalAmount,
      paymentMethod: {
        method: originalOrder.paymentMethod,
        amount: totalAmount,
        referenceNumber: originalOrder.cardReferenceNumber || undefined,
      },
    });

    // Generate UBL XML
    const xml = generateUBLXML(creditNoteData);

    // Generate QR Code
    const qrCodeData = generateQRCodeDataURL(creditNoteData.documentUuid);

    // Create Credit Note order record
    const creditNoteOrder = await db.order.create({
      data: {
        branchId: originalOrder.branchId,
        orderNumber: originalOrder.orderNumber, // Use same order number for reference
        cashierId: originalOrder.cashierId,
        subtotal: subtotal,
        taxAmount: totalTax,
        taxEnabled: true,
        totalAmount: totalAmount,
        paymentMethod: 'credit_note', // Special payment method for credit notes
        orderType: 'credit_note', // Special order type
        transactionHash: `CN-${generateDocumentUUID()}`,
        synced: true, // Credit notes are synced immediately
        isCreditNote: true,
        creditNoteReason: reason,
        originalOrderUUID: originalOrder.etaUUID,
        originalOrderId: originalOrder.id,
        // ETA fields
        etaUUID: creditNoteData.documentUuid,
        etaSubmissionStatus: 'PENDING',
        etaSubmittedAt: new Date(),
        etaQRCode: qrCodeData,
        etaDocumentType: '383', // Credit Note
        etaSettingsId: originalOrder.branch.etaSettings.id,
      },
    });

    // Update original order to reflect that it has a credit note
    await db.order.update({
      where: { id: originalOrder.id },
      data: {
        etaSubmissionStatus: 'CREDIT_NOTE_ISSUED',
      },
    });

    // Update ETA settings statistics
    await db.branchETASettings.update({
      where: { id: originalOrder.branch.etaSettings.id },
      data: {
        totalSubmitted: { increment: 1 },
        lastSubmissionAt: new Date(),
      },
    });

    // In a real implementation, you would:
    // 1. Sign the XML with the digital certificate
    // 2. Submit to ETA API
    // 3. Handle the response
    // For now, we'll mark it as accepted in mock mode
    await db.order.update({
      where: { id: creditNoteOrder.id },
      data: {
        etaSubmissionStatus: 'ACCEPTED',
        etaAcceptedAt: new Date(),
        etaResponse: JSON.stringify({
          status: 'ACCEPTED',
          uuid: creditNoteData.documentUuid,
          submissionDate: new Date().toISOString(),
          environment: originalOrder.branch.etaSettings.environment,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      creditNote: {
        id: creditNoteOrder.id,
        uuid: creditNoteOrder.etaUUID,
        status: creditNoteOrder.etaSubmissionStatus,
        originalOrderId: originalOrder.id,
        originalOrderNumber: originalOrder.orderNumber,
        subtotal: creditNoteOrder.subtotal,
        taxAmount: creditNoteOrder.taxAmount,
        totalAmount: creditNoteOrder.totalAmount,
        reason: creditNoteOrder.creditNoteReason,
        qrCode: creditNoteOrder.etaQRCode,
        submittedAt: creditNoteOrder.etaSubmittedAt,
        acceptedAt: creditNoteOrder.etaAcceptedAt,
      },
      xml: xml, // Include XML for reference
    });

  } catch (error) {
    console.error('Error creating Credit Note:', error);
    return NextResponse.json(
      {
        error: 'Failed to create Credit Note',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/eta/credit-note
 * 
 * List all Credit Notes for a branch
 * 
 * Query params:
 * - branchId: string (optional) - Filter by branch
 * - originalOrderId: string (optional) - Filter by original order
 * - status: string (optional) - Filter by submission status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const originalOrderId = searchParams.get('originalOrderId');
    const status = searchParams.get('status');

    const where: any = {
      isCreditNote: true,
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (originalOrderId) {
      where.originalOrderId = originalOrderId;
    }

    if (status) {
      where.etaSubmissionStatus = status;
    }

    const creditNotes = await db.order.findMany({
      where,
      include: {
        branch: {
          include: {
            etaSettings: true,
          },
        },
        cashier: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        originalOrder: {
          select: {
            id: true,
            orderNumber: true,
            orderTimestamp: true,
            totalAmount: true,
            etaUUID: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      creditNotes: creditNotes.map((cn) => ({
        id: cn.id,
        uuid: cn.etaUUID,
        status: cn.etaSubmissionStatus,
        branchId: cn.branchId,
        branchName: cn.branch.branchName,
        cashier: cn.cashier,
        reason: cn.creditNoteReason,
        subtotal: cn.subtotal,
        taxAmount: cn.taxAmount,
        totalAmount: cn.totalAmount,
        submittedAt: cn.etaSubmittedAt,
        acceptedAt: cn.etaAcceptedAt,
        originalOrder: cn.originalOrder,
        qrCode: cn.etaQRCode,
      })),
    });

  } catch (error) {
    console.error('Error fetching Credit Notes:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch Credit Notes',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
