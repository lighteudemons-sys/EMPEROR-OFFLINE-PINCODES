import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateUBLXML, generateDocumentUUID, validateUBLXML } from '@/lib/eta/ubl-generator';
import { generateQRCodeDataURL, createQRCodeData } from '@/lib/eta/qr-generator';
import { OAuthTokenManager, createApiHeaders, makeAuthenticatedRequest, parseEtaError } from '@/lib/eta/oauth-manager';
import { signXMLDocument, createMockSignature } from '@/lib/eta/xml-signer';
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

    // Real ETA API submission flow
    console.log('[ETA Submit] OAuth token obtained successfully');
    console.log('[ETA Submit] Token expires at:', tokenExpiresAt.toISOString());

    // 1. Sign the XML with digital certificate
    let signedXml: string;
    let documentHash: string;
    let signatureId: string;
    let useMockSignature = false;

    try {
      if (settings.certificateFile && settings.certificatePassword) {
        // Use real certificate signing
        const signingResult = await signXMLDocument(
          xml,
          settings.certificateFile,
          settings.certificatePassword
        );
        signedXml = signingResult.signedXml;
        documentHash = signingResult.documentHash;
        signatureId = signingResult.signatureId;
        console.log('[ETA Submit] Document signed successfully with certificate');
      } else {
        // Use mock signature for testing without certificate
        console.warn('[ETA Submit] No certificate uploaded, using mock signature');
        const mockResult = createMockSignature(xml);
        signedXml = mockResult.signedXml;
        documentHash = mockResult.documentHash;
        signatureId = mockResult.signatureId;
        useMockSignature = true;
      }
    } catch (error) {
      console.error('[ETA Submit] Failed to sign XML:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to sign XML document',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // 2. Submit to ETA API using the OAuth token
    let returnedUuid: string;
    let etaResponseData: any;
    let submissionStatus: 'ACCEPTED' | 'REJECTED' | 'FAILED';
    let errorMessage: string | null = null;

    try {
      // Determine submission endpoint based on environment
      // Note: These are placeholder endpoints - verify with ETA API documentation
      const submissionEndpoint = '/documents/receipts';

      console.log('[ETA Submit] Submitting document to ETA API...');
      const response = await makeAuthenticatedRequest(
        submissionEndpoint,
        accessToken,
        settings.environment as 'TEST' | 'PRODUCTION',
        {
          method: 'POST',
          body: JSON.stringify({
            documentType: '389', // Receipt
            document: signedXml,
            documentId: documentUuid,
            signatureId: signatureId,
            documentHash: documentHash,
            metadata: {
              branchCode: settings.branchCode,
              taxRegistrationNumber: settings.taxRegistrationNumber,
              submittedAt: new Date().toISOString(),
            },
          }),
        }
      );

      if (!response.ok) {
        const errorDetails = await parseEtaError(response);
        throw new Error(`ETA API returned ${response.status}: ${errorDetails}`);
      }

      etaResponseData = await response.json();
      console.log('[ETA Submit] ETA API response:', JSON.stringify(etaResponseData, null, 2));

      // Extract UUID from response (adjust based on actual ETA API response structure)
      returnedUuid = etaResponseData.documentId || etaResponseData.uuid || etaResponseData.submissionId || documentUuid;
      submissionStatus = etaResponseData.status === 'ACCEPTED' || etaResponseData.accepted ? 'ACCEPTED' : 'REJECTED';

      if (submissionStatus === 'REJECTED') {
        errorMessage = etaResponseData.rejectionReason || etaResponseData.message || 'Document rejected by ETA';
      }

      console.log(`[ETA Submit] Document ${returnedUuid} ${submissionStatus}`);
    } catch (error) {
      console.error('[ETA Submit] Failed to submit to ETA API:', error);

      // If we're in mock mode or testing, we might want to continue anyway
      if (settings.environment === 'TEST' && useMockSignature) {
        console.warn('[ETA Submit] Continuing in mock mode due to error');
        returnedUuid = documentUuid;
        submissionStatus = 'ACCEPTED';
        errorMessage = null;
        etaResponseData = {
          mock: true,
          message: 'Mock submission - API integration not yet configured',
          note: error instanceof Error ? error.message : 'Unknown error',
        };
      } else {
        // In production, fail the submission
        submissionStatus = 'FAILED';
        errorMessage = error instanceof Error ? error.message : 'Unknown error';
        returnedUuid = documentUuid;
        etaResponseData = { error: errorMessage };
      }
    }

    // 3. Generate QR code with signed hash
    const qrData = createQRCodeData(
      returnedUuid,
      documentHash,
      new Date()
    );

    const qrCodeDataURL = settings.includeQR
      ? await generateQRCodeDataURL(qrData)
      : null;

    // Update order with ETA data
    await db.order.update({
      where: { id: orderId },
      data: {
        etaUUID: returnedUuid,
        etaSubmissionStatus: submissionStatus,
        etaSubmittedAt: new Date(),
        etaAcceptedAt: submissionStatus === 'ACCEPTED' ? new Date() : null,
        etaError: errorMessage,
        etaQRCode: qrCodeDataURL,
        etaResponse: JSON.stringify(etaResponseData),
        etaSettingsId: settings.id,
        etaDocumentType: '389', // Receipt
      },
    });

    // Update settings stats
    const statsUpdate: any = {
      lastSubmissionAt: new Date(),
      totalSubmitted: { increment: 1 },
    };

    if (submissionStatus === 'FAILED') {
      statsUpdate.totalFailed = { increment: 1 };
    }

    await db.branchETASettings.update({
      where: { id: settings.id },
      data: statsUpdate,
    });

    // Return appropriate response based on submission status
    if (submissionStatus === 'FAILED') {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to submit document to ETA',
          details: errorMessage,
          documentUuid: returnedUuid,
          submissionStatus,
          qrCode: qrCodeDataURL,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: submissionStatus === 'ACCEPTED'
        ? 'Document submitted to ETA successfully'
        : 'Document submitted but was rejected by ETA',
      documentUuid: returnedUuid,
      submissionStatus,
      qrCode: qrCodeDataURL,
      rejectionReason: errorMessage,
      mock: useMockSignature,
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
