/**
 * OAuth Credentials Validation API
 *
 * POST /api/eta/oauth/validate
 *
 * Validate ETA OAuth credentials by attempting to obtain an access token
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { OAuthTokenManager } from '@/lib/eta/oauth-manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { branchId, clientId, clientSecret, environment } = body;

    // Either use branchId to fetch settings, or use provided credentials
    let settings;

    if (branchId) {
      // Get settings from database
      settings = await db.branchETASettings.findUnique({
        where: { branchId },
      });

      if (!settings) {
        return NextResponse.json(
          { error: 'ETA settings not found for this branch' },
          { status: 404 }
        );
      }

      if (!settings.clientId || !settings.clientSecret) {
        return NextResponse.json({
          success: false,
          message: 'ETA credentials not configured',
          needsConfiguration: true,
        });
      }
    } else if (clientId && clientSecret && environment) {
      // Use provided credentials
      settings = {
        clientId,
        clientSecret,
        environment,
      } as any;
    } else {
      return NextResponse.json(
        {
          error: 'Either branchId or clientId, clientSecret, and environment are required',
        },
        { status: 400 }
      );
    }

    // Create OAuth token manager
    const tokenManager = new OAuthTokenManager({
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      environment: (settings.environment || environment) as 'TEST' | 'PRODUCTION',
    });

    // Test credentials by requesting a token
    const testResult = await tokenManager.testCredentials();

    // If successful and we have a branchId, update the last token refresh time
    if (testResult.success && branchId) {
      try {
        await db.branchETASettings.update({
          where: { branchId },
          data: {
            lastTokenRefreshAt: new Date(),
          },
        });
      } catch (updateError) {
        console.warn('[OAuth Validate] Failed to update lastTokenRefreshAt:', updateError);
        // Don't fail the request if this update fails
      }
    }

    return NextResponse.json({
      success: testResult.success,
      message: testResult.message,
      environment: settings.environment,
    });
  } catch (error) {
    console.error('[OAuth Validate API] error:', error);

    // Provide more detailed error messages
    let errorMessage = 'Failed to validate credentials';
    let errorDetails = error instanceof Error ? error.message : 'Unknown error';

    // Check for common OAuth errors
    if (errorDetails.includes('ECONNREFUSED') || errorDetails.includes('fetch failed')) {
      errorMessage = 'Cannot connect to ETA OAuth server. Please check your internet connection.';
    } else if (errorDetails.includes('401') || errorDetails.includes('invalid')) {
      errorMessage = 'Invalid client credentials. Please check your Client ID and Secret.';
    } else if (errorDetails.includes('403') || errorDetails.includes('forbidden')) {
      errorMessage = 'Access forbidden. Your account may not have the required permissions.';
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 }
    );
  }
}
