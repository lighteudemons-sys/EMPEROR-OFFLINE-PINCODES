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

/**
 * Determine the appropriate ETA document type based on order and customer
 * 
 * Document Types:
 * - 381: E-Invoice (B2B) - For VAT-registered business customers with TRN
 * - 388: Simplified Invoice (B2C) - For large B2C transactions (≥50,000 EGP)
 * - 389: Receipt (B2C) - Standard B2C transactions
 * 
 * @param order - The order object
 * @param customer - The customer object (optional)
 * @returns The appropriate document type code
 */
function determineDocumentType(order: any, customer?: any): '381' | '388' | '389' {
  // 381 = B2B Invoice (for VAT-registered B2B customers)
  if (customer?.isVatRegistered && customer.taxRegistrationNumber) {
    console.log('[ETA Submit] Using document type 381 (B2B Invoice) for VAT-registered customer');
    return '381';
  }
  
  // 388 = Simplified Invoice (for B2C with required details, large transactions)
  if (customer && order.totalAmount >= 50000) {
    console.log('[ETA Submit] Using document type 388 (Simplified Invoice) for large B2C transaction');
    return '388';
  }
  
  // 389 = Receipt (standard B2C)
  console.log('[ETA Submit] Using document type 389 (Receipt) for standard B2C transaction');
  return '389';
}

/**
 * Validate B2B E-Invoice requirements
 * 
 * B2B invoices (document type 381) require:
 * - Customer Tax Registration Number (TRN) - MANDATORY
 * - Customer Name - MANDATORY
 * - Customer Address - MANDATORY
 * - Product codes for line items - MANDATORY
 * - Valid TRN format (9 digits)
 * 
 * @param documentType - The document type being submitted
 * @param customer - The customer object
 * @param lineItems - The line items
 * @returns Validation result with errors if any
 */
function validateB2BRequirements(
  documentType: string,
  customer?: any,
  lineItems?: any[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Only validate B2B invoices (381)
  if (documentType !== '381') {
    return { valid: true, errors: [] };
  }
  
  // Customer TRN is MANDATORY for B2B
  if (!customer?.taxRegistrationNumber) {
    errors.push('Customer Tax Registration Number (TRN) is required for B2B invoices');
  } else {
    // Validate TRN format (Egyptian TRN is 9 digits)
    const trnRegex = /^[0-9]{9}$/;
    if (!trnRegex.test(customer.taxRegistrationNumber)) {
      errors.push('Invalid Egyptian Tax Registration Number format (must be 9 digits)');
    }
  }
  
  // Customer name is MANDATORY for B2B
  if (!customer?.name) {
    errors.push('Customer name is required for B2B invoices');
  }
  
  // Customer address is MANDATORY for B2B
  if (!customer?.billingAddress && !customer?.address) {
    errors.push('Customer billing address is required for B2B invoices');
  }
  
  // Line items require product codes for B2B
  if (lineItems) {
    const itemsWithoutCode = lineItems.filter(item => !item.code && !item.productCode);
    if (itemsWithoutCode.length > 0) {
      errors.push(`${itemsWithoutCode.length} line items missing product codes (required for B2B invoices)`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

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

    // Build customer info with B2B support
    const customer = order.customer ? {
      name: order.customer.name,
      taxRegistrationNumber: order.customer.taxRegistrationNumber || undefined, // B2B TRN
      address: order.customer.billingAddress || order.customerAddress?.streetAddress || undefined, // Prefer billing address for B2B
      phone: order.customer.phone,
      email: order.customer.email || undefined,
      isVatRegistered: order.customer.isVatRegistered || false,
    } : undefined;

    // Build line items with product codes
    const lineItems = order.items.map((item) => {
      const taxRate = order.taxEnabled ? order.taxRate : 0;
      const taxAmount = item.subtotal * taxRate;
      
      return {
        name: item.menuItem.name,
        code: item.menuItem.productCode || item.menuItem.id, // Use product code for B2B compliance
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

    // Determine document type based on customer and transaction
    const documentType = determineDocumentType(order, order.customer);

    // Validate B2B requirements if applicable
    const b2bValidation = validateB2BRequirements(documentType, customer, lineItems);
    if (!b2bValidation.valid) {
      return NextResponse.json({
        success: false,
        error: 'B2B E-Invoice validation failed',
        errors: b2bValidation.errors,
      }, { status: 400 });
    }

    // Build document data
    const documentData = {
      documentType: { type: documentType },
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
      // Determine submission endpoint based on document type
      // 389 = Receipt, 388 = Invoice, etc.
      const submissionEndpoint = documentData.documentType.type === '389'
        ? '/documents/receipts'
        : '/documents/invoices';

      console.log(`[ETA Submit] Submitting document to ETA API at: ${submissionEndpoint}`);
      console.log(`[ETA Submit] Document UUID: ${documentUuid}`);
      console.log(`[ETA Submit] Document hash: ${documentHash}`);

      // Prepare submission payload according to ETA API specification
      const submissionPayload = {
        document: signedXml,
        documentType: documentData.documentType.type,
        documentId: documentUuid,
        signatureId: signatureId,
        documentHash: documentHash,
        submissionMetadata: {
          branchCode: settings.branchCode,
          taxRegistrationNumber: settings.taxRegistrationNumber,
          companyName: settings.companyName,
          submittedAt: new Date().toISOString(),
          environment: settings.environment,
        },
      };

      const response = await makeAuthenticatedRequest(
        submissionEndpoint,
        accessToken,
        settings.environment as 'TEST' | 'PRODUCTION',
        {
          method: 'POST',
          body: JSON.stringify(submissionPayload),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorDetails = await parseEtaError(response);
        console.error(`[ETA Submit] API error ${response.status}:`, errorDetails);

        // Parse detailed error response
        let errorJson = null;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            errorJson = await response.json();
          }
        } catch (e) {
          console.warn('[ETA Submit] Could not parse error response as JSON');
        }

        throw new Error(
          `ETA API returned ${response.status}: ${errorDetails}${errorJson ? ` (Code: ${errorJson.code || 'N/A'})` : ''}`
        );
      }

      etaResponseData = await response.json();
      console.log('[ETA Submit] ETA API response:', JSON.stringify(etaResponseData, null, 2));

      // Extract UUID and status from response
      // Handle different possible response formats from ETA API
      returnedUuid = etaResponseData.documentId
        || etaResponseData.uuid
        || etaResponseData.submissionId
        || etaResponseData.receiptId
        || etaResponseData.invoiceId
        || documentUuid;

      // Determine submission status
      const responseStatus = etaResponseData.status
        || etaResponseData.acceptanceStatus
        || etaResponseData.submissionStatus;

      if (responseStatus === 'ACCEPTED' || responseStatus === 'accepted' || etaResponseData.accepted === true) {
        submissionStatus = 'ACCEPTED';
      } else if (responseStatus === 'REJECTED' || responseStatus === 'rejected' || etaResponseData.rejected === true) {
        submissionStatus = 'REJECTED';
      } else if (responseStatus === 'FAILED' || responseStatus === 'failed') {
        submissionStatus = 'FAILED';
      } else {
        // Default to ACCEPTED if status is 2xx and not explicitly rejected
        submissionStatus = 'ACCEPTED';
      }

      if (submissionStatus === 'REJECTED' || submissionStatus === 'FAILED') {
        errorMessage = etaResponseData.rejectionReason
          || etaResponseData.error
          || etaResponseData.message
          || etaResponseData.details
          || `Document ${submissionStatus.toLowerCase()} by ETA`;
      }

      console.log(`[ETA Submit] Document ${returnedUuid} ${submissionStatus}`);
      if (errorMessage) {
        console.log(`[ETA Submit] Error message: ${errorMessage}`);
      }
    } catch (error) {
      console.error('[ETA Submit] Failed to submit to ETA API:', error);

      // If we're in TEST environment and using mock signature, continue with mock submission
      if (settings.environment === 'TEST' && useMockSignature) {
        console.warn('[ETA Submit] Continuing in mock mode (TEST environment with mock signature)');
        returnedUuid = documentUuid;
        submissionStatus = 'ACCEPTED';
        errorMessage = null;
        etaResponseData = {
          mock: true,
          documentId: documentUuid,
          status: 'ACCEPTED',
          message: 'Mock submission - TEST environment with mock signature',
          note: 'To use real API submission, upload a valid digital certificate',
          originalError: error instanceof Error ? error.message : 'Unknown error',
        };
      } else {
        // In PRODUCTION or with real certificate, fail the submission
        submissionStatus = 'FAILED';
        errorMessage = error instanceof Error ? error.message : 'Unknown error';
        returnedUuid = documentUuid;
        etaResponseData = {
          error: errorMessage,
          status: 'FAILED',
          timestamp: new Date().toISOString(),
        };
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
        etaDocumentType: documentType, // Use the determined document type (381, 388, or 389)
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
