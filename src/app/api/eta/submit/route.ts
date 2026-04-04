import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateUBLXML, generateDocumentUUID, validateUBLXML } from '@/lib/eta/ubl-generator';
import { generateQRCodeDataURL, createQRCodeData } from '@/lib/eta/qr-generator';
import { OAuthTokenManager, createApiHeaders } from '@/lib/eta/oauth-manager';
import { z } from 'zod';

const submitRequestSchema = z.object({
  orderId: z.string().cuid(),
  branchId: z.string().cuid(),
});

// POST /api/eta/submit
// Submit a document to Egyptian Tax Authority ETA system
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, branchId } = submitRequestSchema.parse(body);

    // Get the order with all necessary data
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        branch: true,
        cashier: true,
        customer: true,
        items: {
          include: {
            menuItem: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Get ETA settings for the branch
    const settings = await db.branchETASettings.findUnique({
      where: { branchId },
    });

    if (!settings) {
      return NextResponse.json(
        { error: 'ETA settings not configured for this branch' },
        { status: 400 }
      );
    }

    // Check if ETA is active for this branch
    if (!settings.isActive) {
      return NextResponse.json({
        success: false,
        error: 'ETA integration is disabled for this branch',
      });
    }

    // Generate document UUID if not already set
    const documentUuid = order.etaUUID || generateDocumentUUID();

    // Build customer info
    const customer = order.customer ? {
      name: order.customer.name,
      taxRegistrationNumber: undefined, // Will need to add to customer schema
      address: order.customerAddress?.streetAddress,
      phone: order.customer.phone,
    } : undefined;

    // Build line items
    const lineItems = order.items.map((item) => {
      const taxRate = order.taxEnabled ? order.taxRate : 0;
      const taxAmount = item.subtotal * taxRate;
      
      return {
        name: item.menuItem.name,
        code: undefined, // Could add barcode field to MenuItem
        unitType: 'EA', // Each item
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        netPrice: item.subtotal,
        taxRate,
        taxAmount,
        totalAmount: item.subtotal + taxAmount,
        discountAmount: 0, // Line-level discounts if any
        itemType: 'GS1', // Global Product Identifier
      };
    });

    // Build payment data
    const paymentMethods = [
      {
        method: order.paymentMethod,
        amount: order.totalAmount,
        referenceNumber: order.cardReferenceNumber || undefined,
      },
    ];

    // Calculate totals
    const totalTaxAmount = order.taxEnabled ? order.taxAmount : 0;
    const totalDiscountAmount = (order.loyaltyDiscount || 0) + (order.promoDiscount || 0) + (order.manualDiscountAmount || 0);

    // Build document data
    const documentData = {
      documentType: { type: '389' as const }, // 389 = Receipt
      documentUuid,
      issueDate: new Date(order.orderTimestamp),
      currency: 'EGP',
      seller: {
        companyName: settings.companyName,
        taxRegistrationNumber: settings.taxRegistrationNumber,
        branchCode: settings.branchCode,
        commercialRegister: settings.commercialRegister || undefined,
        address: settings.address,
        city: settings.city,
        governorate: settings.governorate,
        postalCode: settings.postalCode || undefined,
        phone: settings.phone,
        email: settings.email || undefined,
      },
      buyer: customer,
      lineItems,
      subtotal: order.subtotal,
      totalTaxAmount,
      discountAmount: totalDiscountAmount,
      totalAmount: order.totalAmount,
      paymentMethods,
      notes: order.notes || undefined,
    };

    // Generate UBL XML
    const xml = generateUBLXML(documentData);

    // Validate XML
    const validation = validateUBLXML(xml);
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: 'Generated XML validation failed',
        errors: validation.errors,
      });
    }

    // Get OAuth access token
    const tokenManager = new OAuthTokenManager({
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      environment: settings.environment as 'TEST' | 'PRODUCTION',
    });

    // Get a valid access token (will refresh if needed)
    let accessToken: string;
    let tokenExpiresAt: Date;
    try {
      const tokenResult = await tokenManager.getValidToken(
        settings.accessToken,
        settings.accessTokenExpiresAt
      );
      accessToken = tokenResult.token;
      tokenExpiresAt = tokenResult.expiresAt;

      // Update settings with new token info if refreshed
      if (tokenResult.wasRefreshed) {
        await db.branchETASettings.update({
          where: { branchId },
          data: {
            accessToken: accessToken,
            accessTokenExpiresAt: tokenExpiresAt,
            lastTokenRefreshAt: new Date(),
            tokenRefreshCount: { increment: 1 },
          },
        });
      }
    } catch (error) {
      console.error('[ETA Submit] Failed to get OAuth token:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to obtain OAuth access token',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // TODO: Real ETA API submission flow (requires actual ETA API endpoints):
    // 1. Sign the XML with your digital certificate
    // 2. Calculate the hash of the signed document
    // 3. Submit to ETA API using the OAuth token:
    //    const response = await fetch(`${getApiBaseUrl(settings.environment)}/documents`, {
    //      method: 'POST',
    //      headers: createApiHeaders(accessToken),
    //      body: JSON.stringify({ document: signedXml, ... })
    //    });
    // 4. Get the UUID from ETA response
    // 5. Generate QR code with signed hash
    // 6. Update order with ETA data

    // For now, we'll simulate the submission with proper OAuth token management
    console.log('[ETA Submit] OAuth token obtained successfully');
    console.log('[ETA Submit] Token expires at:', tokenExpiresAt.toISOString());

    const mockSubmissionResult = {
      success: true,
      message: 'Document ready for ETA submission (OAuth token obtained, awaiting real API integration)',
      documentUuid,
      submissionStatus: 'SUBMITTED',
      note: 'OAuth token management is implemented. To complete real submission, integrate with ETA document submission endpoints.',
      tokenInfo: {
        obtained: true,
        expiresAt: tokenExpiresAt.toISOString(),
      },
    };

    // Generate QR code (mock hash for now)
    const qrData = createQRCodeData(
      documentUuid,
      'MOCK_SIGNED_HASH_' + documentUuid.slice(0, 8), // Mock signed hash
      new Date()
    );
    
    const qrCodeDataURL = settings.includeQR 
      ? await generateQRCodeDataURL(qrData)
      : null;

    // Update order with ETA data
    const updatedOrder = await db.order.update({
      where: { id: orderId },
      data: {
        etaUUID: documentUuid,
        etaSubmissionStatus: 'SUBMITTED',
        etaSubmittedAt: new Date(),
        etaQRCode: qrCodeDataURL,
        etaResponse: JSON.stringify({
          mock: true,
          message: 'Mock submission - replace with real ETA API response when credentials available',
        }),
        etaSettingsId: settings.id,
      },
    });

    // Update settings stats
    await db.branchETASettings.update({
      where: { id: settings.id },
      data: {
        lastSubmissionAt: new Date(),
        totalSubmitted: { increment: 1 },
      },
    });

    return NextResponse.json({
      success: true,
      message: mockSubmissionResult.message,
      documentUuid,
      submissionStatus: 'SUBMITTED',
      qrCode: qrCodeDataURL,
      note: mockSubmissionResult.note,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('[ETA Submit] Error:', error);
    
    // Try to update order with error
    try {
      const { orderId } = await request.json();
      await db.order.update({
        where: { id: orderId },
        data: {
          etaSubmissionStatus: 'FAILED',
          etaError: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    } catch (updateError) {
      console.error('[ETA Submit] Failed to update order with error:', updateError);
    }

    return NextResponse.json(
      { error: 'Failed to submit document to ETA', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
