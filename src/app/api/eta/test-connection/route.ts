import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/eta/test-connection
// Tests the ETA API connection (mock for now, will be real when credentials are available)
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

    // Check if certificate is uploaded
    if (!settings.certificateFile) {
      return NextResponse.json({
        success: false,
        message: 'Digital certificate not uploaded',
        needsCertificate: true,
      });
    }

    // TODO: When you have ETA credentials, implement real API connection test here
    // For now, we'll return a mock success response
    
    // Determine which environment we're testing
    const isProduction = settings.environment === 'PRODUCTION';
    const mockResponse = isProduction
      ? {
          success: true,
          message: 'Connection to production ETA API will be tested when credentials are active',
          environment: 'PRODUCTION',
          note: 'This is a placeholder - real API test will be implemented when production credentials are available',
        }
      : {
          success: true,
          message: 'Connection to ETA test API is ready (mock mode)',
          environment: 'TEST',
          note: 'This is a mock response - replace with real ETA API call when you have test credentials',
        };

    return NextResponse.json(mockResponse);
  } catch (error) {
    console.error('[ETA Test Connection] Error:', error);
    return NextResponse.json(
      { error: 'Connection test failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
