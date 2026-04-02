import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { generateUBLXML, generateCreditNoteData, generateDocumentUUID } from '@/lib/eta/ubl-generator';
import { generateQRCodeDataURL } from '@/lib/eta/qr-generator';

/**
 * Helper function to generate ETA Credit Note for a refunded order
 */
async function generateCreditNoteForRefund(
  order: any,
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

    // Check if a Credit Note already exists
    const existingCreditNote = await db.order.findFirst({
      where: {
        originalOrderId: order.id,
        isCreditNote: true,
      },
    });

    if (existingCreditNote) {
      console.log('Credit Note already exists for this order');
      return { success: false, error: 'Credit Note already exists' };
    }

    // Calculate totals for the credit note (full refund)
    const subtotal = order.subtotal;
    const totalTax = order.taxAmount;
    const totalAmount = order.totalAmount;

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
      refundedItems: order.items.map((item: any) => ({
        name: item.itemName,
        code: item.id,
        unitType: 'EA',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        netPrice: item.subtotal,
        taxRate: 0.14,
        taxAmount: (item.subtotal * 0.14),
        totalAmount: item.subtotal * 1.14,
        itemType: 'GS1',
      })),
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
        transactionHash: `CN-${generateDocumentUUID()}`,
        synced: true,
        isCreditNote: true,
        creditNoteReason: reason,
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
    console.error('Error generating Credit Note:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      orderId,
      reason,
      username,
      password,
    } = body;

    // Validate request
    if (!orderId || !reason || !username || !password) {
      return NextResponse.json(
        { error: 'Missing required fields (orderId, reason, username, password)' },
        { status: 400 }
      );
    }

    // Find user by username first
    const user = await db.user.findFirst({
      where: {
        username: username,
        isActive: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Verify password with bcrypt
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Role-based authorization: Only ADMIN and BRANCH_MANAGER can process refunds
    if (user.role !== 'ADMIN' && user.role !== 'BRANCH_MANAGER') {
      return NextResponse.json(
        { error: 'Only Administrators and Branch Managers can process refunds' },
        { status: 403 }
      );
    }

    // Get the order to refund
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        branch: true,
        shift: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    if (order.isRefunded) {
      return NextResponse.json(
        { error: 'Order is already refunded' },
        { status: 400 }
      );
    }

    // Branch access control: ADMIN can refund any branch, BRANCH_MANAGER only their own
    if (user.role === 'BRANCH_MANAGER' && order.branchId !== user.branchId) {
      return NextResponse.json(
        { error: 'You can only refund orders from your own branch' },
        { status: 403 }
      );
    }

    // Process refund with inventory restoration
    await db.$transaction(async (tx) => {
      // Mark order as refunded
      await tx.order.update({
        where: { id: orderId },
        data: {
          isRefunded: true,
          refundReason: reason,
          refundedAt: new Date(),
        },
      });

      // Update shift to track refunds for closing report
      if (order.shiftId) {
        await tx.shift.update({
          where: { id: order.shiftId },
          data: {
            closingRefunds: {
              increment: 1,
            },
          },
        });
      }

      // Restore inventory for each item in the order
      for (const orderItem of order.items) {
        // Get recipes for the menu item, filtered by variant if present
        const recipes = await tx.recipe.findMany({
          where: {
            menuItemId: orderItem.menuItemId,
            menuItemVariantId: orderItem.menuItemVariantId || null,
          },
          include: {
            ingredient: true,
          },
        });

        // Restore inventory based on recipes
        for (const recipe of recipes) {
          const quantityToRestore = recipe.quantityRequired * orderItem.quantity;

          // Get current inventory
          const inventory = await tx.branchInventory.findUnique({
            where: {
              branchId_ingredientId: {
                branchId: order.branchId,
                ingredientId: recipe.ingredientId,
              },
            },
          });

          if (inventory) {
            const stockBefore = inventory.currentStock;
            const stockAfter = stockBefore + quantityToRestore;

            // Update inventory
            await tx.branchInventory.update({
              where: { id: inventory.id },
              data: {
                currentStock: stockAfter,
                lastModifiedAt: new Date(),
                lastModifiedBy: user.id,
              },
            });

            // Create refund transaction
            await tx.inventoryTransaction.create({
              data: {
                branchId: order.branchId,
                ingredientId: recipe.ingredientId,
                transactionType: 'REFUND',
                quantityChange: quantityToRestore,
                stockBefore,
                stockAfter,
                orderId: orderId,
                reason: `Refund for order: ${order.orderNumber}`,
                createdBy: user.id,
              },
            });
          }
        }
      }

      // Update customer statistics (deduct points and total spent)
      if (order.customerId) {
        // Calculate points to deduct (1 point per 1 EGP spent)
        const pointsToDeduct = Math.floor(order.subtotal);

        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            totalSpent: {
              decrement: order.subtotal,
            },
            orderCount: {
              decrement: 1,
            },
            loyaltyPoints: {
              decrement: pointsToDeduct,
            },
          },
        });

        // Create loyalty transaction for refund
        await tx.loyaltyTransaction.create({
          data: {
            customerId: order.customerId,
            points: -pointsToDeduct,
            type: 'REDEEMED',
            orderId: order.id,
            amount: order.subtotal,
            notes: `Refund for order #${order.orderNumber}`,
          },
        });

        // Update customer tier based on new total spent
        const updatedCustomer = await tx.customer.findUnique({
          where: { id: order.customerId },
        });

        if (updatedCustomer) {
          let newTier = 'BRONZE';
          // Update tier thresholds based on total spent (in EGP)
          if (updatedCustomer.totalSpent >= 1000) {
            newTier = 'PLATINUM';
          } else if (updatedCustomer.totalSpent >= 500) {
            newTier = 'GOLD';
          } else if (updatedCustomer.totalSpent >= 200) {
            newTier = 'SILVER';
          }

          if (updatedCustomer.tier !== newTier) {
            await tx.customer.update({
              where: { id: order.customerId },
              data: { tier: newTier },
            });
          }
        }
      }

      // Create audit log with proper action type
      await tx.auditLog.create({
        data: {
          userId: user.id,
          actionType: 'order_refunded',
          entityType: 'Order',
          entityId: orderId,
          oldValue: order.isRefunded.toString(),
          newValue: 'true',
          currentHash: `refund-${orderId}-${Date.now()}`,
          branchId: order.branchId,
        },
      });
    });

    // Generate ETA Credit Note if configured
    const creditNoteResult = await generateCreditNoteForRefund(order, reason, user.id);

    const response: any = {
      success: true,
      message: `Order #${order.orderNumber} has been refunded`,
      refund: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason,
        totalAmount: order.totalAmount,
        refundAmount: order.totalAmount, // Full refund
      },
    };

    // Include Credit Note information if generated
    if (creditNoteResult.success && creditNoteResult.creditNote) {
      response.creditNote = creditNoteResult.creditNote;
      response.message += ' and ETA Credit Note has been generated';
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Refund processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process refund', details: error.message },
      { status: 500 }
    );
  }
}
