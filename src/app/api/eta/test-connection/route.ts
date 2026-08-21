import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/eta/test-connection
// Tests the ETA OAuth connection by validating credentials
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { branchId } = body;

    if (!branchId) {
      return NextResponse.json(
        { error: 'branchId is required' },
        { status: 400 }
      );
    }

    // Get ETA settings for the branch
    const settings = await db.branchETASettings.findUnique({
      where: { branchId },
    });

    if (!settings) {
      return NextResponse.json(
        { error: 'ETA settings not found for this branch' },
        { status: 404 }
      );
    }

    // Check if credentials are configured
    if (!settings.clientId || !settings.clientSecret) {
      return NextResponse.json({
        success: false,
        message: 'ETA credentials not configured',
        needsConfiguration: true,
      });
    }

    // Test credentials by calling the OAuth validation endpoint
    const validationResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/eta/oauth/validate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId,
          clientId: settings.clientId,
          clientSecret: settings.clientSecret,
          environment: settings.environment,
        }),
      }
    );

    const validationData = await validationResponse.json();

    if (!validationResponse.ok) {
      return NextResponse.json({
        success: false,
        message: validationData.error || 'Failed to validate credentials',
        details: validationData.details,
      });
    }

    // Add additional information about certificate
    const hasCertificate = !!settings.certificateFile;
    const certificateStatus = hasCertificate
      ? 'Digital certificate uploaded'
      : 'Digital certificate not uploaded (required for production)';

    return NextResponse.json({
      success: true,
      message: validationData.message,
      environment: settings.environment,
      certificateStatus,
      hasCertificate,
      additionalInfo: {
        clientIdConfigured: !!settings.clientId,
        clientSecretConfigured: !!settings.clientSecret,
        tokenManagementReady: true,
      },
    });
  } catch (error) {
    console.error('[ETA Test Connection] Error:', error);
    return NextResponse.json(
      {
        error: 'Connection test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
