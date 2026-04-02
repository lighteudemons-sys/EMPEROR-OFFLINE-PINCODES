import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/sync/upload
 * 
 * Receives batch of changes from a branch and applies them to the central database.
 * Handles idempotency and versioning to prevent duplicate updates.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { branchId, records } = body;

    if (!branchId || !Array.isArray(records)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request: branchId and records array are required' },
        { status: 400 }
      );
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each record in a transaction
    for (const record of records) {
      const { entityType, entityId, operation, payload, retryCount } = record;

      try {
        // Check idempotency key to prevent duplicate processing
        const idempotencyKey = `${branchId}-${entityType}-${entityId}-${operation}-${payload.version || 1}`;
        
        const existingKey = await db.idempotencyKey.findUnique({
          where: { key: idempotencyKey }
        });

        if (existingKey) {
          // Already processed, return success
          results.push({
            entityType,
            entityId,
            success: true,
            skipped: true,
            reason: 'Already processed'
          });
          successCount++;
          continue;
        }

        // Process the operation
        const result = await processRecord(entityType, entityId, operation, payload);
        
        // Record idempotency key
        await db.idempotencyKey.create({
          data: {
            key: idempotencyKey,
            branchId,
            processedAt: new Date()
          }
        });

        results.push({
          entityType,
          entityId,
          success: true,
          data: result
        });
        successCount++;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to process record ${entityType}:${entityId}`, error);
        
        results.push({
          entityType,
          entityId,
          success: false,
          error: errorMessage
        });
        errorCount++;
      }
    }

    // Log sync history
    await db.syncHistory.create({
      data: {
        branchId,
        syncDirection: 'TO_SERVER',
        recordsAffected: records.length,
        syncStartedAt: new Date(),
        syncCompletedAt: new Date(),
        status: errorCount === 0 ? 'SUCCESS' : 'PARTIAL'
      }
    });

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: records.length,
        success: successCount,
        error: errorCount
      }
    });

  } catch (error) {
    console.error('Sync upload failed:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Process a single sync record based on entity type and operation
 */
async function processRecord(
  entityType: string,
  entityId: string,
  operation: 'CREATE' | 'UPDATE' | 'DELETE',
  payload: any
): Promise<any> {
  // Map entity types to Prisma models
  const modelMap: Record<string, any> = {
    'User': db.user,
    'Branch': db.branch,
    'Order': db.order,
    'OrderItem': db.orderItem,
    'Shift': db.shift,
    'BusinessDay': db.businessDay,
    'Customer': db.customer,
    'CustomerAddress': db.customerAddress,
    'MenuItem': db.menuItem,
    'Category': db.category,
    'BranchInventory': db.branchInventory,
    'Ingredient': db.ingredient,
    'DailyExpense': db.dailyExpense,
    'Promotion': db.promotion,
    'PromoCode': db.promoCode,
    'Notification': db.notification,
    'Table': db.table,
    'Courier': db.courier,
    'DeliveryArea': db.deliveryArea,
    'BranchETASettings': db.branchETASettings,
    'VoidedItem': db.voidedItem
  };

  const model = modelMap[entityType];
  if (!model) {
    throw new Error(`Unknown entity type: ${entityType}`);
  }

  // Remove sync-specific fields from payload
  const { synced, syncedAt, version, deletedAt, ...data } = payload;

  switch (operation) {
    case 'CREATE':
      return await model.create({
        data: {
          ...data,
          id: entityId // Use the ID from the branch
        }
      });

    case 'UPDATE':
      return await model.update({
        where: { id: entityId },
        data: data
      });

    case 'DELETE':
      if (deletedAt) {
        // Soft delete
        return await model.update({
          where: { id: entityId },
          data: { deletedAt: new Date(deletedAt) }
        });
      } else {
        // Hard delete
        return await model.delete({
          where: { id: entityId }
        });
      }

    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}
