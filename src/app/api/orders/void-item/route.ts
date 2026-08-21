import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logItemVoided } from '@/lib/audit-logger';
import { generateUBLXML, generateCreditNoteData, generateDocumentUUID } from '@/lib/eta/ubl-generator';
import { generateQRCodeDataURL } from '@/lib/eta/qr-generator';

/**
 * Helper function to generate ETA Credit Note for voided order items
 */
async function generateCreditNoteForVoidedItems(
  order: any,
  voidedItems: {
    orderItemId: string;
    quantity: number;
    unitPrice: number;
    itemName: string;
    taxRate: number;
  }[],
  reason: string,
  userId: string
): Promise<{ success: boolean; creditNote?: any; error?: string }> {
  try {
    // Check if ETA is configured for the branch
    const etaSettings = await db.branchETASettings.findUnique({
      where: { branchId: order.branchId },
    });

    if (!etaSettings) {
      console.log('ETA settings not configured for branch, skipping Credit Note generation');
      return { success: false, error: 'ETA settings not configured' };
    }

    // Check if the original order has been submitted and accepted by ETA
    // Don't generate Credit Note for orders that are still PENDING (offline orders)
    if (!order.etaUUID) {
      console.log('Original order not submitted to ETA, skipping Credit Note generation');
      return { success: false, error: 'Original order not submitted to ETA' };
    }

    if (order.etaSubmissionStatus !== 'ACCEPTED' && order.etaSubmissionStatus !== 'CREDIT_NOTE_ISSUED') {
      console.log(`Original order ETA status is ${order.etaSubmissionStatus}, skipping Credit Note generation. Order must be ACCEPTED first.`);
      return { success: false, error: `Original order ETA status is ${order.etaSubmissionStatus}. Cannot generate Credit Note until order is accepted by ETA.` };
    }

    // Calculate totals for the credit note
    let subtotal = 0;
    let totalTax = 0;

    const refundedItems = voidedItems.map((item) => {
      const itemSubtotal = item.unitPrice * item.quantity;
      const itemTax = itemSubtotal * item.taxRate;
      const itemTotal = itemSubtotal + itemTax;

      subtotal += itemSubtotal;
      totalTax += itemTax;

      return {
        name: item.itemName,
        code: item.orderItemId,
        unitType: 'EA',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        netPrice: itemSubtotal,
        taxRate: item.taxRate,
        taxAmount: itemTax,
        totalAmount: itemTotal,
        itemType: 'GS1',
      };
    });

    const totalAmount = subtotal + totalTax;

    // Generate Credit Note data
    const creditNoteData = generateCreditNoteData({
      originalDocumentUuid: order.etaUUID,
      originalOrderNumber: order.orderNumber.toString(),
      reason: reason,
      issueDate: new Date(),
      seller: {
        companyName: etaSettings.companyName,
        taxRegistrationNumber: etaSettings.taxRegistrationNumber,
        branchCode: etaSettings.branchCode,
        commercialRegister: etaSettings.commercialRegister || undefined,
        address: etaSettings.address,
        city: etaSettings.city,
        governorate: etaSettings.governorate,
        postalCode: etaSettings.postalCode || undefined,
        phone: etaSettings.phone,
        email: etaSettings.email || undefined,
      },
      buyer: order.customerId ? {
        name: (await db.customer.findUnique({ where: { id: order.customerId } }))?.name,
      } : undefined,
      refundedItems: refundedItems,
      subtotal: subtotal,
      totalTaxAmount: totalTax,
      totalAmount: totalAmount,
      paymentMethod: {
        method: order.paymentMethod,
        amount: totalAmount,
        referenceNumber: order.cardReferenceNumber || undefined,
      },
    });

    // Generate UBL XML
    const xml = generateUBLXML(creditNoteData);

    // Generate QR Code
    const qrCodeData = generateQRCodeDataURL(creditNoteData.documentUuid);

    // Create Credit Note order record
    const creditNoteOrder = await db.order.create({
      data: {
        branchId: order.branchId,
        orderNumber: order.orderNumber,
        cashierId: userId,
        subtotal: subtotal,
        taxAmount: totalTax,
        taxEnabled: true,
        totalAmount: totalAmount,
        paymentMethod: 'credit_note',
        orderType: 'credit_note',
        transactionHash: `CN-VOID-${generateDocumentUUID()}`,
        synced: true,
        isCreditNote: true,
        creditNoteReason: `Voided items: ${reason}`,
        originalOrderUUID: order.etaUUID,
        originalOrderId: order.id,
        // ETA fields
        etaUUID: creditNoteData.documentUuid,
        etaSubmissionStatus: 'PENDING',
        etaSubmittedAt: new Date(),
        etaQRCode: qrCodeData,
        etaDocumentType: '383',
        etaSettingsId: etaSettings.id,
      },
    });

    // Update original order to reflect that it has a credit note
    await db.order.update({
      where: { id: order.id },
      data: {
        etaSubmissionStatus: 'CREDIT_NOTE_ISSUED',
      },
    });

    // Update ETA settings statistics
    await db.branchETASettings.update({
      where: { id: etaSettings.id },
      data: {
        totalSubmitted: { increment: 1 },
        lastSubmissionAt: new Date(),
      },
    });

    // Mark as accepted in mock mode
    await db.order.update({
      where: { id: creditNoteOrder.id },
      data: {
        etaSubmissionStatus: 'ACCEPTED',
        etaAcceptedAt: new Date(),
        etaResponse: JSON.stringify({
          status: 'ACCEPTED',
          uuid: creditNoteData.documentUuid,
          submissionDate: new Date().toISOString(),
          environment: etaSettings.environment,
        }),
      },
    });

    return {
      success: true,
      creditNote: {
        id: creditNoteOrder.id,
        uuid: creditNoteOrder.etaUUID,
        status: creditNoteOrder.etaSubmissionStatus,
        totalAmount: creditNoteOrder.totalAmount,
        reason: creditNoteOrder.creditNoteReason,
      },
    };
  } catch (error) {
    console.error('Error generating Credit Note for voided items:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Void a specific order item (not the entire order)
 * This allows voiding part of an order, e.g., void 1 of 2 coffees
 * Can only be done during an active shift
 */
export async function POST(request: NextRequest) {
  try {
    const { orderItemId, userCode, pin, username, password, reason, quantity } = await request.json();

    // Validate required fields - accept either userCode+PIN or username+password
    if (!orderItemId || !reason || !quantity) {
      return NextResponse.json(
        { error: 'Missing required fields: orderItemId, reason, quantity' },
        { status: 400 }
      );
    }

    // Validate quantity is positive
    if (quantity <= 0) {
      return NextResponse.json(
        { error: 'Quantity to void must be greater than 0' },
        { status: 400 }
      );
    }

    // Get the order item with order and user info
    const orderItem = await db.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        order: {
          include: {
            cashier: true,
            branch: true,
            shift: true,
          },
        },
      },
    });

    if (!orderItem) {
      return NextResponse.json(
        { error: 'Order item not found' },
        { status: 404 }
      );
    }

    if (orderItem.order.isRefunded) {
      return NextResponse.json(
        { error: 'Cannot void items from a refunded order' },
        { status: 400 }
      );
    }

    // Check if quantity to void exceeds original quantity
    if (quantity > orderItem.quantity) {
      return NextResponse.json(
        { error: `Cannot void more than ${orderItem.quantity} items` },
        { status: 400 }
      );
    }

    // Try User Code + PIN first
    let user = null;
    if (userCode && pin) {
      user = await db.user.findFirst({
        where: {
          userCode: userCode,
          isActive: true,
        },
      });
      
      if (user) {
        const bcrypt = await import('bcryptjs');
        const isValidPin = await bcrypt.compare(pin, user.pin);
        
        if (isValidPin) {
          console.log('[Void Item] Authenticated via User Code + PIN');
        } else {
          user = null;
        }
      }
    }

    // Fallback to username + password if User Code + PIN failed
    if (!user && username && password) {
      user = await db.user.findFirst({
        where: {
          username: username,
          isActive: true,
        },
      });

      if (user) {
        const bcrypt = await import('bcryptjs');
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        
        if (isValidPassword) {
          console.log('[Void Item] Authenticated via Username + Password');
        } else {
          user = null;
        }
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid User Code + PIN or Username + Password' },
        { status: 401 }
      );
    }

    // Role-based authorization: Only ADMIN and BRANCH_MANAGER can void items
    if (user.role !== 'ADMIN' && user.role !== 'BRANCH_MANAGER') {
      return NextResponse.json(
        { error: 'Only Administrators and Branch Managers can void items' },
        { status: 403 }
      );
    }

    // Branch access control: ADMIN can void any branch, BRANCH_MANAGER only their own
    if (user.role === 'BRANCH_MANAGER' && orderItem.order.branchId !== user.branchId) {
      return NextResponse.json(
        { error: 'You can only void items from your own branch' },
        { status: 403 }
      );
    }

    // Process void in transaction
    // Calculate values before transaction for return statement
    const remainingQuantity = orderItem.quantity - quantity;

    await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderItem.orderId },
        include: {
          items: true,
          branch: true,
          shift: true,
        },
      });

      // Calculate voided amount
      const voidedSubtotal = orderItem.unitPrice * quantity;

      // Get the shift for tracking voided items
      const shift = order?.shift;

      if (remainingQuantity === 0) {
        // Full void - mark item as voided
        await tx.orderItem.update({
          where: { id: orderItemId },
          data: {
            quantity: 0,
            subtotal: 0,
            isVoided: true,
            voidedAt: new Date(),
            voidReason: reason,
            voidedBy: userCode,
          },
        });

        // Update order totals
        const orderItems = await tx.orderItem.findMany({
          where: { orderId: orderItem.orderId },
        });

        const newSubtotal = orderItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
        const newTotalAmount = newSubtotal + (orderItem.order.deliveryFee || 0);

        await tx.order.update({
          where: { id: orderItem.orderId },
          data: {
            subtotal: newSubtotal,
            totalAmount: newTotalAmount,
          },
        });

        // Update shift to track voided items for closing report
        if (shift) {
          await tx.shift.update({
            where: { id: shift.id },
            data: {
              closingVoidedItems: {
                increment: 1,
              },
            },
          });
        }

        // Log audit log for voided item
        await tx.auditLog.create({
          data: {
            userId: user.id,
            actionType: 'item_voided',
            entityType: 'OrderItem',
            entityId: orderItemId,
            oldValue: `${orderItem.quantity}x ${orderItem.menuItem?.name || orderItem.itemName}`,
            newValue: `Voided ${quantity}x - ${reason}`,
            branchId: orderItem.order.branchId,
            ipAddress: null,
            previousHash: null,
            currentHash: `void-${orderItemId}-${Date.now()}`,
          },
        });
      } else {
        // Partial void - reduce quantity and subtotal
        const newSubtotal = orderItem.unitPrice * remainingQuantity;
        const unitPrice = orderItem.unitPrice;

        // Update the order item
        await tx.orderItem.update({
          where: { id: orderItemId },
          data: {
            quantity: remainingQuantity,
            subtotal: newSubtotal,
          },
        });

        // Create a voided item record for tracking
        await tx.voidedItem.create({
          data: {
            orderItemId,
            orderQuantity: orderItem.quantity,
            voidedQuantity: quantity,
            remainingQuantity,
            unitPrice,
            voidedSubtotal,
            reason,
            voidedBy: userCode,
            voidedAt: new Date(),
          },
        });

        // Update order totals
        const orderItems = await tx.orderItem.findMany({
          where: { orderId: orderItem.orderId },
        });

        const newOrderSubtotal = orderItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
        const newTotalAmount = newOrderSubtotal + (orderItem.order.deliveryFee || 0);

        await tx.order.update({
          where: { id: orderItem.orderId },
          data: {
            subtotal: newOrderSubtotal,
            totalAmount: newTotalAmount,
          },
        });

        // Update shift to track voided items for closing report
        if (shift) {
          await tx.shift.update({
            where: { id: shift.id },
            data: {
              closingVoidedItems: {
                increment: 1,
              },
            },
          });
        }

        // Log audit log for partial void
        await tx.auditLog.create({
          data: {
            userId: user.id,
            actionType: 'item_voided',
            entityType: 'OrderItem',
            entityId: orderItemId,
            oldValue: `${orderItem.quantity}x ${orderItem.menuItem?.name || orderItem.itemName}`,
            newValue: `Voided ${quantity}x - ${reason}`,
            branchId: orderItem.order.branchId,
            ipAddress: null,
            previousHash: null,
            currentHash: `void-${orderItemId}-${Date.now()}`,
          },
        });
      }
    });

    // Check if order has been submitted to ETA and generate Credit Note if needed
    let creditNoteResult: { success: boolean; creditNote?: any; error?: string } = { success: false };

    // Only generate Credit Note if order has been ACCEPTED by ETA
    // Don't generate for PENDING orders (offline orders that haven't synced yet)
    if (orderItem.order.etaUUID && 
        (orderItem.order.etaSubmissionStatus === 'ACCEPTED' || 
         orderItem.order.etaSubmissionStatus === 'CREDIT_NOTE_ISSUED')) {
      // Order has been submitted and accepted by ETA, generate Credit Note
      const taxRate = orderItem.order.taxEnabled ? 0.14 : 0; // 14% VAT if enabled

      creditNoteResult = await generateCreditNoteForVoidedItems(
        orderItem.order,
        [
          {
            orderItemId: orderItemId,
            quantity: quantity,
            unitPrice: orderItem.unitPrice,
            itemName: orderItem.itemName,
            taxRate: taxRate,
          },
        ],
        reason,
        user.id
      );
    }

    const response: any = {
      success: true,
      message: `${quantity} item(s) voided successfully`,
      remainingQuantity: remainingQuantity,
      updatedSubtotal: orderItem.unitPrice * remainingQuantity,
      updatedTotalAmount: (orderItem.unitPrice * remainingQuantity) + (orderItem.order.deliveryFee || 0),
    };

    // Include Credit Note information if generated
    if (creditNoteResult.success && creditNoteResult.creditNote) {
      response.creditNote = creditNoteResult.creditNote;
      response.message += ' and ETA Credit Note has been generated';
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Void item error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to void item',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
