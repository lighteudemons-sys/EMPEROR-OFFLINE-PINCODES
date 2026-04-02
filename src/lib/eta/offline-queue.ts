/**
 * ETA Offline Submission Queue
 * 
 * Manages ETA document submissions when the system is offline.
 * Queues documents for submission when connection is restored.
 */

import { db } from '@/lib/db';

export interface ETADocumentQueue {
  id: string;
  orderId: string;
  orderNumber: number;
  branchId: string;
  documentType: 'receipt' | 'credit_note' | 'debit_note';
  etaUUID: string;
  xmlContent: string;
  status: 'PENDING' | 'SUBMITTING' | 'SUCCESS' | 'FAILED';
  retryCount: number;
  maxRetries: number;
  lastRetryAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  submittedAt?: Date;
  etaResponse?: string;
}

export class ETAOfflineQueue {
  /**
   * Queue a document for ETA submission
   */
  static async queueDocument(params: {
    orderId: string;
    orderNumber: number;
    branchId: string;
    documentType: 'receipt' | 'credit_note' | 'debit_note';
    etaUUID: string;
    xmlContent: string;
  }): Promise<ETADocumentQueue> {
    const queueEntry = {
      id: `eta-queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      branchId: params.branchId,
      documentType: params.documentType,
      etaUUID: params.etaUUID,
      xmlContent: params.xmlContent,
      status: 'PENDING' as const,
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
    };

    // Store in database (we'll use a JSON field or create a new model)
    // For now, we'll update the order with submission status
    await db.order.update({
      where: { id: params.orderId },
      data: {
        etaSubmissionStatus: 'PENDING',
        etaError: null, // Clear any previous errors
      },
    });

    // In a full implementation, this would be stored in a separate ETAQueue table
    // For now, we'll track pending submissions by querying orders with PENDING status

    console.log(`[ETAOfflineQueue] Queued ${params.documentType} for order ${params.orderNumber}`, {
      etaUUID: params.etaUUID,
      orderId: params.orderId,
    });

    return queueEntry as ETADocumentQueue;
  }

  /**
   * Get all pending ETA submissions for a branch
   */
  static async getPendingSubmissions(branchId: string): Promise<any[]> {
    const pendingOrders = await db.order.findMany({
      where: {
        branchId,
        etaSubmissionStatus: 'PENDING',
        etaUUID: { not: null },
      },
      include: {
        branch: {
          include: {
            etaSettings: true,
          },
        },
        items: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return pendingOrders;
  }

  /**
   * Get failed ETA submissions that can be retried
   */
  static async getFailedSubmissions(branchId: string): Promise<any[]> {
    // For now, we'll query orders with REJECTED status
    // In a full implementation, we'd track retry counts in a queue table
    const failedOrders = await db.order.findMany({
      where: {
        branchId,
        etaSubmissionStatus: 'REJECTED',
        etaUUID: { not: null },
      },
      include: {
        branch: {
          include: {
            etaSettings: true,
          },
        },
        items: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return failedOrders;
  }

  /**
   * Process pending ETA submissions for a branch
   */
  static async processPendingSubmissions(branchId: string): Promise<{
    processed: number;
    successful: number;
    failed: number;
    errors: string[];
  }> {
    const pendingOrders = await this.getPendingSubmissions(branchId);
    
    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const order of pendingOrders) {
      try {
        results.processed++;

        // Generate UBL XML
        const { generateUBLXML } = await import('@/lib/eta/ubl-generator');
        const { generateQRCodeDataURL } = await import('@/lib/eta/qr-generator');
        const { generateDocumentUUID } = await import('@/lib/eta/ubl-generator');

        // Build document data from order
        const documentData = await this.buildDocumentDataFromOrder(order);
        
        // Generate XML
        const xml = generateUBLXML(documentData);

        // Generate QR code
        const qrCode = generateQRCodeDataURL(order.etaUUID!);

        // Update order to SUBMITTED (in mock mode, we'll accept it)
        await db.order.update({
          where: { id: order.id },
          data: {
            etaSubmissionStatus: 'SUBMITTED',
            etaSubmittedAt: new Date(),
            etaQRCode: qrCode,
            etaResponse: JSON.stringify({
              status: 'SUBMITTED',
              uuid: order.etaUUID,
              submissionDate: new Date().toISOString(),
              environment: 'TEST',
            }),
          },
        });

        // In real implementation, submit to ETA API here
        // For now, mark as accepted
        await db.order.update({
          where: { id: order.id },
          data: {
            etaSubmissionStatus: 'ACCEPTED',
            etaAcceptedAt: new Date(),
          },
        });

        results.successful++;

        console.log(`[ETAOfflineQueue] Successfully processed order ${order.orderNumber}`);
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Order ${order.orderNumber}: ${errorMessage}`);

        // Update order with error
        await db.order.update({
          where: { id: order.id },
          data: {
            etaSubmissionStatus: 'REJECTED',
            etaError: errorMessage,
          },
        });

        console.error(`[ETAOfflineQueue] Failed to process order ${order.orderNumber}:`, error);
      }
    }

    return results;
  }

  /**
   * Build ETA document data from order
   */
  private static async buildDocumentDataFromOrder(order: any): Promise<any> {
    const etaSettings = order.branch.etaSettings;
    
    if (!etaSettings) {
      throw new Error('ETA settings not configured for branch');
    }

    // Determine document type
    const documentType = order.isCreditNote ? '383' : '389'; // Credit Note or Receipt

    // Build line items
    const lineItems = order.items.map((item: any) => ({
      name: item.itemName,
      code: item.id,
      unitType: 'EA',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      netPrice: item.subtotal,
      taxRate: order.taxEnabled ? 0.14 : 0,
      taxAmount: item.subtotal * (order.taxEnabled ? 0.14 : 0),
      totalAmount: item.subtotal * (order.taxEnabled ? 1.14 : 1),
      itemType: 'GS1',
    }));

    // Build buyer info if customer exists
    let buyer = undefined;
    if (order.customerId) {
      const customer = await db.customer.findUnique({
        where: { id: order.customerId },
      });
      if (customer) {
        buyer = {
          name: customer.name,
          phone: customer.phone,
          email: customer.email || undefined,
        };
      }
    }

    return {
      documentType: { type: documentType },
      documentUuid: order.etaUUID,
      issueDate: new Date(order.orderTimestamp),
      currency: 'EGP',
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
      buyer,
      lineItems,
      subtotal: order.subtotal,
      totalTaxAmount: order.taxAmount,
      discountAmount: order.promoDiscount + order.manualDiscountAmount,
      totalAmount: order.totalAmount,
      paymentMethods: [{
        method: order.paymentMethod,
        amount: order.totalAmount,
        referenceNumber: order.cardReferenceNumber || undefined,
      }],
      notes: order.isCreditNote ? order.creditNoteReason : undefined,
      originalDocumentUuid: order.isCreditNote ? order.originalOrderUUID : undefined,
      creditReason: order.isCreditNote ? order.creditNoteReason : undefined,
    };
  }

  /**
   * Get ETA submission statistics for a branch
   */
  static async getStatistics(branchId: string): Promise<{
    pending: number;
    submitted: number;
    accepted: number;
    rejected: number;
    creditNoteIssued: number;
  }> {
    const stats = await db.order.groupBy({
      by: ['etaSubmissionStatus'],
      where: {
        branchId,
        etaUUID: { not: null },
      },
      _count: true,
    });

    return {
      pending: stats.find(s => s.etaSubmissionStatus === 'PENDING')?._count || 0,
      submitted: stats.find(s => s.etaSubmissionStatus === 'SUBMITTED')?._count || 0,
      accepted: stats.find(s => s.etaSubmissionStatus === 'ACCEPTED')?._count || 0,
      rejected: stats.find(s => s.etaSubmissionStatus === 'REJECTED')?._count || 0,
      creditNoteIssued: stats.find(s => s.etaSubmissionStatus === 'CREDIT_NOTE_ISSUED')?._count || 0,
    };
  }
}

export default ETAOfflineQueue;
