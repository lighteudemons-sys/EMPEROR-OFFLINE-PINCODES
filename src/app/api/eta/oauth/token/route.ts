/**
 * OAuth Token Management API
 *
 * Endpoints:
 * - GET /api/eta/oauth/token?branchId={branchId} - Get current token status
 * - POST /api/eta/oauth/token - Refresh the access token
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  OAuthTokenManager,
  validateToken,
  formatTokenExpiration,
} from '@/lib/eta/oauth-manager';

/**
 * GET /api/eta/oauth/token?branchId={branchId}
 *
 * Get the current OAuth token status for a branch
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');

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

    // Validate current token
    const validation = validateToken(
      settings.accessToken,
      settings.accessTokenExpiresAt
    );

    return NextResponse.json({
      success: true,
      hasToken: !!settings.accessToken,
      tokenStatus: {
        isValid: validation.isValid,
        isExpired: validation.isExpired,
        willExpireSoon: validation.willExpireSoon,
        expiresIn: validation.expiresIn,
        expiresInFormatted: validation.expiresIn
          ? formatTokenExpiration(validation.expiresIn)
          : null,
        message: validation.message,
      },
      tokenInfo: {
        lastRefreshed: settings.lastTokenRefreshAt,
        refreshCount: settings.tokenRefreshCount,
      },
    });
  } catch (error) {
    console.error('[OAuth Token API] GET error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get token status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/eta/oauth/token
 *
 * Refresh the OAuth access token for a branch
 */
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

    // Create OAuth token manager
    const tokenManager = new OAuthTokenManager({
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      environment: settings.environment as 'TEST' | 'PRODUCTION',
    });

    // Get a valid token (will refresh if needed)
    const { token, expiresAt, wasRefreshed } = await tokenManager.getValidToken(
      settings.accessToken,
      settings.accessTokenExpiresAt
    );

    // Update settings with new token info
    const updatedSettings = await db.branchETASettings.update({
      where: { branchId },
      data: {
        accessToken: token,
        accessTokenExpiresAt: expiresAt,
        lastTokenRefreshAt: new Date(),
        tokenRefreshCount: { increment: wasRefreshed ? 1 : 0 },
      },
    });

    // Validate the new token
    const validation = validateToken(token, expiresAt);

    return NextResponse.json({
      success: true,
      wasRefreshed,
      tokenStatus: {
        isValid: validation.isValid,
        isExpired: validation.isExpired,
        willExpireSoon: validation.willExpireSoon,
        expiresIn: validation.expiresIn,
        expiresInFormatted: validation.expiresIn
          ? formatTokenExpiration(validation.expiresIn)
          : null,
        message: validation.message,
      },
      tokenInfo: {
        lastRefreshed: updatedSettings.lastTokenRefreshAt,
        refreshCount: updatedSettings.tokenRefreshCount,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[OAuth Token API] POST error:', error);
    return NextResponse.json(
      {
        error: 'Failed to refresh token',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
