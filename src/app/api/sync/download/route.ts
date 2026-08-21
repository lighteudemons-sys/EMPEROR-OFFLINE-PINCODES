import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/sync/download
 * 
 * Returns updates from the central server for a specific branch since the last sync.
 * Supports pagination and filtering by entity type.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const since = searchParams.get('since');
    const entityType = searchParams.get('entityType');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');

    if (!branchId) {
      return NextResponse.json(
        { success: false, error: 'branchId is required' },
        { status: 400 }
      );
    }

    const sinceDate = since ? new Date(since) : new Date(0);
    const skip = (page - 1) * limit;

    // Get all updates since the last sync
    // We'll check multiple tables for changes
    const updates = await fetchUpdates(branchId, sinceDate, entityType, skip, limit);

    // Log sync history
    await db.syncHistory.create({
      data: {
        branchId,
        syncDirection: 'FROM_SERVER',
        recordsAffected: updates.length,
        syncStartedAt: new Date(),
        syncCompletedAt: new Date(),
        status: 'SUCCESS'
      }
    });

    return NextResponse.json({
      success: true,
      updates,
      pagination: {
        page,
        limit,
        total: updates.length,
        hasMore: updates.length === limit
      }
    });

  } catch (error) {
    console.error('Sync download failed:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Fetch updates from multiple tables
 */
async function fetchUpdates(
  branchId: string,
  since: Date,
  entityTypeFilter: string | null,
  skip: number,
  limit: number
): Promise<Array<{ entityType: string; entityId: string; operation: string; data: any; version: number }>> {
  const updates: Array<{ entityType: string; entityId: string; operation: string; data: any; version: number }> = [];

  // Define which tables to check and how to query them
  const tables = [
    { name: 'User', model: db.user },
    { name: 'Branch', model: db.branch },
    { name: 'Order', model: db.order },
    { name: 'OrderItem', model: db.orderItem },
    { name: 'Shift', model: db.shift },
    { name: 'BusinessDay', model: db.businessDay },
    { name: 'Customer', model: db.customer },
    { name: 'CustomerAddress', model: db.customerAddress },
    { name: 'MenuItem', model: db.menuItem },
    { name: 'Category', model: db.category },
    { name: 'BranchInventory', model: db.branchInventory },
    { name: 'Ingredient', model: db.ingredient },
    { name: 'DailyExpense', model: db.dailyExpense },
    { name: 'Promotion', model: db.promotion },
    { name: 'PromoCode', model: db.promoCode },
    { name: 'Notification', model: db.notification },
    { name: 'Table', model: db.table },
    { name: 'Courier', model: db.courier },
    { name: 'DeliveryArea', model: db.deliveryArea },
    { name: 'BranchETASettings', model: db.branchETASettings },
    { name: 'VoidedItem', model: db.voidedItem }
  ];

  for (const table of tables) {
    // Skip if entity type filter is set and doesn't match
    if (entityTypeFilter && table.name !== entityTypeFilter) {
      continue;
    }

    try {
      // Get records updated or created since the last sync
      const records = await (table.model as any).findMany({
        where: {
          OR: [
            { updatedAt: { gte: since } },
            { createdAt: { gte: since } }
          ],
          // For branch-specific data, filter by branchId
          ...(shouldFilterByBranch(table.name) ? { branchId } : {})
        },
        take: limit,
        orderBy: { updatedAt: 'asc' }
      });

      for (const record of records) {
        // Determine operation based on deletedAt
        const operation = (record as any).deletedAt ? 'DELETE' : 'UPDATE';
        
        updates.push({
          entityType: table.name,
          entityId: (record as any).id,
          operation,
          data: record,
          version: (record as any).version || 1
        });

        // Stop if we've reached the limit
        if (updates.length >= limit) {
          break;
        }
      }

      // Stop if we've reached the limit
      if (updates.length >= limit) {
        break;
      }
    } catch (error) {
      console.error(`Failed to fetch updates for ${table.name}:`, error);
      // Continue with other tables
    }
  }

  return updates;
}

/**
 * Check if a table should be filtered by branchId
 */
function shouldFilterByBranch(entityType: string): boolean {
  const branchFilteredEntities = [
    'Order',
    'OrderItem',
    'Shift',
    'BusinessDay',
    'BranchInventory',
    'DailyExpense',
    'CustomerAddress',
    'Table',
    'Courier',
    'Notification',
    'BranchETASettings'
  ];

  return branchFilteredEntities.includes(entityType);
}
