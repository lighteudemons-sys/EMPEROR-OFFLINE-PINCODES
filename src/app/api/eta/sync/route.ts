/**
 * ETA Sync API
 * 
 * Handles synchronization of pending ETA submissions when the system comes online.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ETAOfflineQueue } from '@/lib/eta/offline-queue';

/**
 * POST /api/eta/sync
 * 
 * Sync pending ETA submissions for a branch
 * 
 * Request body:
 * {
 *   branchId: string,
 *   force?: boolean  // Force retry of failed submissions
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { branchId, force = false } = body;

    if (!branchId) {
      return NextResponse.json(
        { error: 'Branch ID is required' },
        { status: 400 }
      );
    }

    // Process pending submissions
    const pendingResults = await ETAOfflineQueue.processPendingSubmissions(branchId);

    // Process failed submissions if force is true
    let failedResults = { processed: 0, successful: 0, failed: 0, errors: [] as string[] };
    if (force) {
      const failedOrders = await ETAOfflineQueue.getFailedSubmissions(branchId);
      
      for (const order of failedOrders) {
        try {
          failedResults.processed++;

          // Reset to PENDING and retry
          await db.order.update({
            where: { id: order.id },
            data: {
              etaSubmissionStatus: 'PENDING',
              etaError: null,
            },
          });
        } catch (error) {
          failedResults.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          failedResults.errors.push(`Order ${order.orderNumber}: ${errorMessage}`);
        }
      }

      // Now process the reset orders
      const retryResults = await ETAOfflineQueue.processPendingSubmissions(branchId);
      failedResults.successful = retryResults.successful;
      failedResults.failed += retryResults.failed;
      failedResults.errors = [...failedResults.errors, ...retryResults.errors];
    }

    // Get updated statistics
    const statistics = await ETAOfflineQueue.getStatistics(branchId);

    return NextResponse.json({
      success: true,
      message: `ETA sync completed`,
      results: {
        pending: pendingResults,
        failed: force ? failedResults : { processed: 0, successful: 0, failed: 0, errors: [] },
      },
      statistics,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[ETA Sync API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to sync ETA submissions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/eta/sync
 * 
 * Get ETA sync status for a branch
 * 
 * Query params:
 * - branchId: string (required)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');

    if (!branchId) {
      return NextResponse.json(
        { error: 'Branch ID is required' },
        { status: 400 }
      );
    }

    // Get pending submissions
    const pending = await ETAOfflineQueue.getPendingSubmissions(branchId);
    
    // Get failed submissions
    const failed = await ETAOfflineQueue.getFailedSubmissions(branchId);

    // Get statistics
    const statistics = await ETAOfflineQueue.getStatistics(branchId);

    // Get ETA settings
    const etaSettings = await db.branchETASettings.findUnique({
      where: { branchId },
    });

    return NextResponse.json({
      success: true,
      status: {
        configured: !!etaSettings,
        environment: etaSettings?.environment || null,
        hasPending: pending.length > 0,
        hasFailed: failed.length > 0,
        pendingCount: pending.length,
        failedCount: failed.length,
        pendingOrders: pending.map((o: any) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          etaUUID: o.etaUUID,
          documentType: o.isCreditNote ? 'credit_note' : 'receipt',
          createdAt: o.orderTimestamp,
        })),
        failedOrders: failed.map((o: any) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          etaUUID: o.etaUUID,
          documentType: o.isCreditNote ? 'credit_note' : 'receipt',
          error: o.etaError,
          createdAt: o.orderTimestamp,
        })),
      },
      statistics,
      lastSync: etaSettings?.lastSubmissionAt || null,
    });

  } catch (error) {
    console.error('[ETA Sync Status API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get ETA sync status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
