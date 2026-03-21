/**
 * Batch Push API Endpoint
 * Handles multiple sync operations in a single request
 * Optimized for offline-first sync where branches may queue many operations
 * Version: 0.2.1 - Fixed order-shift linking with detailed logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SyncDirection, SyncStatus } from '@prisma/client';
import { createSyncHistory } from '@/lib/sync-utils';
import { conflictManager, ConflictType, ResolutionStrategy } from '@/lib/sync/conflict-manager';

// Operation types
const OperationType = {
  CREATE_ORDER: 'CREATE_ORDER',
  UPDATE_ORDER: 'UPDATE_ORDER',
  CREATE_INVENTORY: 'CREATE_INVENTORY',
  UPDATE_INVENTORY: 'UPDATE_INVENTORY',
  CREATE_WASTE: 'CREATE_WASTE',
  CREATE_SHIFT: 'CREATE_SHIFT',
  UPDATE_SHIFT: 'UPDATE_SHIFT',
  CLOSE_SHIFT: 'CLOSE_SHIFT',
  OPEN_BUSINESS_DAY: 'OPEN_BUSINESS_DAY',
  CLOSE_BUSINESS_DAY: 'CLOSE_BUSINESS_DAY',
  CREATE_CUSTOMER: 'CREATE_CUSTOMER',
  UPDATE_CUSTOMER: 'UPDATE_CUSTOMER',
  UPDATE_USER: 'UPDATE_USER',
  CREATE_DAILY_EXPENSE: 'CREATE_DAILY_EXPENSE',
  CREATE_VOIDED_ITEM: 'CREATE_VOIDED_ITEM',
  CREATE_PROMO_CODE: 'CREATE_PROMO_CODE',
  USE_PROMO_CODE: 'USE_PROMO_CODE',
  CREATE_LOYALTY_TRANSACTION: 'CREATE_LOYALTY_TRANSACTION',
  CREATE_TABLE: 'CREATE_TABLE',
  UPDATE_TABLE: 'UPDATE_TABLE',
  CLOSE_TABLE: 'CLOSE_TABLE',
  CREATE_INVENTORY_TRANSACTION: 'CREATE_INVENTORY_TRANSACTION',
  CREATE_INGREDIENT: 'CREATE_INGREDIENT',
  UPDATE_INGREDIENT: 'UPDATE_INGREDIENT',
  CREATE_MENU_ITEM: 'CREATE_MENU_ITEM',
  UPDATE_MENU_ITEM: 'UPDATE_MENU_ITEM',
  CREATE_TRANSFER: 'CREATE_TRANSFER',
  CREATE_PURCHASE_ORDER: 'CREATE_PURCHASE_ORDER',
  UPDATE_PURCHASE_ORDER: 'UPDATE_PURCHASE_ORDER',
  CREATE_RECEIPT_SETTINGS: 'CREATE_RECEIPT_SETTINGS',
  UPDATE_RECEIPT_SETTINGS: 'UPDATE_RECEIPT_SETTINGS',
} as const;

type OperationTypeType = typeof OperationType[keyof typeof OperationType];

interface SyncOperation {
  type: OperationTypeType;
  data: any;
  timestamp: number;
  idempotencyKey?: string; // Optional: for idempotency checking
}

interface BatchPushRequest {
  branchId: string;
  operations: SyncOperation[];
}

/**
 * Get priority level for an operation
 * Lower values indicate higher priority
 */
function getOperationPriority(type: OperationTypeType): number {
  // Use the OperationType constant values as keys to ensure type safety
  const priorityMap: Record<OperationTypeType, number> = {
    // HIGHEST (0) - Business days must exist first (shifts depend on them)
    'OPEN_BUSINESS_DAY': 0,

    // HIGH (1) - Shifts depend on business days
    'CREATE_SHIFT': 1,
    'UPDATE_SHIFT': 1,

    // MEDIUM (2) - Orders depend on shifts
    'CREATE_ORDER': 2,
    'UPDATE_ORDER': 2,

    // LOW (3) - Close operations and others
    'CLOSE_SHIFT': 3,
    'CLOSE_BUSINESS_DAY': 3,
    'CREATE_CUSTOMER': 3,
    'UPDATE_CUSTOMER': 3,
    'CREATE_TABLE': 3,
    'UPDATE_TABLE': 3,
    'CLOSE_TABLE': 3,

    // LOWER (4) - Inventory, menu, transfers, logs
    'CREATE_INGREDIENT': 4,
    'UPDATE_INGREDIENT': 4,
    'CREATE_MENU_ITEM': 4,
    'UPDATE_MENU_ITEM': 4,
    'UPDATE_INVENTORY': 4,
    'CREATE_INVENTORY_TRANSACTION': 4,
    'CREATE_TRANSFER': 4,
    'CREATE_PURCHASE_ORDER': 4,
    'UPDATE_PURCHASE_ORDER': 4,
    'CREATE_WASTE': 4,
    'CREATE_DAILY_EXPENSE': 4,
    'CREATE_VOIDED_ITEM': 4,
    'CREATE_PROMO_CODE': 4,
    'USE_PROMO_CODE': 4,
    'CREATE_LOYALTY_TRANSACTION': 4,
    'CREATE_RECEIPT_SETTINGS': 4,
    'UPDATE_RECEIPT_SETTINGS': 4,
    'UPDATE_USER': 4,
  };

  const priority = priorityMap[type];
  if (priority === undefined) {
    addLog(`[BatchPush] WARNING: Operation type "${type}" not found in priority map, using default priority 4`);
    addLog(`[BatchPush] Available priority keys: ` + JSON.stringify(Object.keys(priorityMap)));
  }
  
  return priority ?? 4; // Default to lower priority
}

/**
 * In-memory cache for mapping temporary IDs to real IDs during batch processing.
 * This ensures that multiple operations referencing the same temp ID use the same real ID.
 */
const tempIdToRealIdMap = new Map<string, string>();

/**
 * In-memory log collector for debugging sync operations
 */
const syncLogs: string[] = [];

function addLog(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  syncLogs.push(logMessage);
  console.log(logMessage);
}

/**
 * Safely deduct inventory with atomic operation to prevent race conditions
 * Uses optimistic concurrency control for SQLite
 */
async function safeInventoryDeduct(
  tx: any,
  branchId: string,
  ingredientId: string,
  quantityToDeduct: number,
  orderId: string,
  createdBy: string,
  ingredientName: string
) {
  const quantityToDeductAbs = Math.abs(quantityToDeduct);

  // Check current stock first
  const inventory = await tx.branchInventory.findUnique({
    where: {
      branchId_ingredientId: {
        branchId,
        ingredientId,
      },
    },
  });

  const currentStock = inventory?.currentStock || 0;

  if (currentStock < quantityToDeductAbs) {
    addLog(`[Inventory] Warning: Insufficient inventory for ${ingredientName}. Current stock: ${currentStock}, Required: ${quantityToDeductAbs}. Allowing deduction (may go negative)`);
    // Allow deduction even if insufficient stock (same behavior as online orders)
    // The stock tracking system will flag low stock alerts
  }

  // Update inventory using upsert to handle missing records
  const stockBefore = currentStock;
  const stockAfter = currentStock - quantityToDeductAbs;

  // Use upsert to create the record if it doesn't exist
  await tx.branchInventory.upsert({
    where: {
      branchId_ingredientId: {
        branchId,
        ingredientId,
      },
    },
    create: {
      branchId,
      ingredientId,
      currentStock: stockAfter,
      reservedStock: 0,
      lastModifiedAt: new Date(),
    },
    update: {
      currentStock: stockAfter,
      lastModifiedAt: new Date(),
    },
  });

  // Create inventory transaction record
  await tx.inventoryTransaction.create({
    data: {
      branchId,
      ingredientId,
      transactionType: 'SALE',
      quantityChange: -quantityToDeductAbs,
      stockBefore,
      stockAfter,
      orderId,
      createdBy,
    },
  });

  addLog(`[Inventory] Deducted ${quantityToDeductAbs} ${inventory?.unit || ''} of ${ingredientName} (stock: ${stockBefore} → ${stockAfter})`);
}

export async function POST(request: NextRequest) {
  syncLogs.length = 0; // Clear logs at start
  addLog('[BatchPush] Starting batch push request...');
  addLog('[BatchPush] Version: 0.3.0 - CRITICAL FIX: Allow duplicate order numbers from different shifts (timestamp-based duplicate detection)');

  // Clear the temp ID mapping at the start of each request
  tempIdToRealIdMap.clear();

  try {
    const body: BatchPushRequest = await request.json();
    const { branchId, operations } = body;

    addLog('[BatchPush] Received request:' + JSON.stringify({
      branchId,
      operationsCount: operations?.length || 0,
      operationTypes: operations?.map(op => op.type)
    }));

    if (!branchId) {
      return NextResponse.json(
        { error: 'Branch ID is required' },
        { status: 400 }
      );
    }

    if (!operations || !Array.isArray(operations)) {
      return NextResponse.json(
        { error: 'Operations array is required' },
        { status: 400 }
      );
    }

    // Verify branch exists
    const branch = await db.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      return NextResponse.json(
        { error: 'Branch not found' },
        { status: 404 }
      );
    }

    const results = {
      processed: 0,
      failed: 0,
      failedIds: [] as string[],
      errors: [] as string[],
      conflictsDetected: 0,
      conflictsResolved: 0,
      idMappings: {} as Record<string, string>, // Temp ID -> Real ID mappings
    };

    // Sort operations by priority (lower priority = higher priority)
    // This ensures critical operations (orders, payments) sync first
    addLog('[BatchPush] Operations before sort:' + operations.map((op, i) => `${i + 1}. ${op.type} (priority ${getOperationPriority(op.type)})`).join(', '));
    
    const sortedOperations = [...operations].sort((a, b) => {
      const priorityA = getOperationPriority(a.type);
      const priorityB = getOperationPriority(b.type);
      const priorityDiff = priorityA - priorityB;

      // If priorities differ, sort by priority
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // Same priority: sort by timestamp (older first)
      return a.timestamp - b.timestamp;
    });
    
    addLog('[BatchPush] Operations after sort:' + sortedOperations.map((op, i) => `${i + 1}. ${op.type} (priority ${getOperationPriority(op.type)})`).join(', '));

    addLog(`[BatchPush] Processing ${sortedOperations.length} operations in priority order`);

    // Process operations
    for (let i = 0; i < sortedOperations.length; i++) {
      const operation = sortedOperations[i];

      addLog(`[BatchPush] Processing operation ${i + 1}/${sortedOperations.length}: ${operation.type}`);

      try {
        await processOperation(operation, branchId);

        // Record idempotency key after successful processing
        if (operation.idempotencyKey) {
          await recordIdempotencyKey(operation.idempotencyKey, branchId);
        }

        results.processed++;
        addLog(`[BatchPush] Successfully processed operation ${i + 1}: ${operation.type}`);
      } catch (error) {
        results.failed++;
        results.failedIds.push(`op-${i}`);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`${operation.type}: ${errorMessage}`);
        console.error(`[BatchPush] Failed to process operation ${i + 1} (${operation.type}):`, error);
      }
    }

    addLog(`[BatchPush] Finished processing all operations. Processed: ${results.processed}, Failed: ${results.failed}`);

    // CRITICAL: Post-sync order linking
    // After all operations are committed, link any orders that were created during closed shifts
    // but weren't linked because the shift closed before the order was visible in the database
    addLog('[BatchPush] Starting post-sync order linking...');
    addLog(`[BatchPush] Current tempIdToRealMap entries: ` + JSON.stringify(Array.from(tempIdToRealIdMap.entries())));
    
    // Track which shift IDs were actually closed in this batch
    const closedShiftIdsInThisBatch: string[] = [];
    addLog(`[BatchPush] Checking operations to find shifts closed in this batch...`);
    
    sortedOperations.forEach((op, index) => {
      if (op.type === 'CLOSE_SHIFT' && op.data && op.data.id) {
        // If the operation has a temp ID, use the mapped real ID
        const shiftId = op.data.id.startsWith('temp-') 
          ? tempIdToRealIdMap.get(op.data.id) || op.data.id
          : op.data.id;
        
        if (shiftId && !shiftId.startsWith('temp-')) {
          closedShiftIdsInThisBatch.push(shiftId);
          addLog(`[BatchPush] Shift ${shiftId} was closed in operation ${index + 1}`);
        }
      }
    });
    
    addLog(`[BatchPush] Shifts closed in this batch (${closedShiftIdsInThisBatch.length}): ` + JSON.stringify(closedShiftIdsInThisBatch));
    
    if (closedShiftIdsInThisBatch.length > 0) {
      addLog(`[BatchPush] Found ${closedShiftIdsInThisBatch.length} shifts closed in this batch, checking for unlinked orders...`);
      
      for (const shiftId of closedShiftIdsInThisBatch) {
        const shift = await db.shift.findUnique({
          where: { id: shiftId },
          select: {
            id: true,
            startTime: true,
            endTime: true,
            branchId: true,
            cashierId: true,
            isClosed: true,
          },
        });

        if (shift && shift.isClosed && shift.startTime && shift.endTime) {
          const shiftEndTime = shift.endTime || new Date();
          addLog(`[BatchPush] Post-sync: Checking shift ${shiftId} (${shift.startTime.toISOString()} - ${shiftEndTime.toISOString()}) for unlinked orders`);
          
          await linkUnlinkedOrdersToShift(
            shiftId,
            shift.cashierId,
            shift.startTime,
            shiftEndTime
          );
        }
      }
    } else {
      addLog('[BatchPush] No shifts were closed in this batch, skipping post-sync linking');
    }

    // Auto-resolve any conflicts that were detected
    const autoResolvedConflicts = await conflictManager.autoResolveConflicts();
    results.conflictsResolved = autoResolvedConflicts.length;
    results.conflictsDetected = conflictManager.getAllConflicts().length;

    // Copy temp ID mappings from the in-memory map to results
    // This allows the frontend to update its localStorage with the real IDs
    tempIdToRealIdMap.forEach((realId, tempId) => {
      results.idMappings[tempId] = realId;
    });
    addLog(`[BatchPush] Generated ${Object.keys(results.idMappings).length} ID mappings: ` + JSON.stringify(results.idMappings));

    addLog(`[BatchPush] Returning response:` + JSON.stringify({
      success: results.failed === 0,
      processed: results.processed,
      failed: results.failed,
      conflictsDetected: results.conflictsDetected,
      conflictsResolved: results.conflictsResolved,
    }));

    // Record sync history if any operations were processed
    if (results.processed > 0) {
      const syncHistoryId = await createSyncHistory(
        branchId,
        SyncDirection.UP,
        results.processed
      );

      // Update sync history with completion details
      if (results.failed > 0 || results.conflictsDetected > 0) {
        await db.syncHistory.update({
          where: { id: syncHistoryId },
          data: {
            syncCompletedAt: new Date(),
            status: results.failed === results.processed ? SyncStatus.FAILED : SyncStatus.PARTIAL,
            errorDetails: results.errors.join('; ') + (results.conflictsDetected > 0 ? ` | ${results.conflictsDetected} conflicts detected, ${results.conflictsResolved} resolved` : '')
          }
        });
      }
    }

    return NextResponse.json({
      success: results.failed === 0,
      processed: results.processed,
      failed: results.failed,
      failedIds: results.failedIds,
      errors: results.errors,
      conflictsDetected: results.conflictsDetected,
      conflictsResolved: results.conflictsResolved,
      conflictStats: conflictManager.getConflictStats(),
      idMappings: results.idMappings, // Return ID mappings for frontend to update localStorage
      logs: syncLogs, // Return debug logs
    });

    addLog('[BatchPush] Response sent successfully');
  } catch (error) {
    console.error('[BatchPush] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  } finally {
    // Clear the temp ID mapping after request completes
    tempIdToRealIdMap.clear();
  }
}

/**
 * Check if an operation with this idempotency key has already been processed
 * This prevents duplicate operations from being executed multiple times
 */
async function checkIdempotencyKey(idempotencyKey: string, branchId: string): Promise<boolean> {
  try {
    const existing = await db.idempotencyKey.findUnique({
      where: { key: idempotencyKey }
    });
    return !!existing;
  } catch (error) {
    // If the table doesn't exist yet (schema not pushed), return false
    console.warn('[Idempotency] Could not check idempotency key:', error);
    return false;
  }
}

/**
 * Record that an operation with this idempotency key has been processed
 */
async function recordIdempotencyKey(idempotencyKey: string, branchId: string): Promise<void> {
  try {
    await db.idempotencyKey.create({
      data: { key: idempotencyKey, branchId }
    });
    console.log(`[Idempotency] Recorded idempotency key: ${idempotencyKey}`);
  } catch (error) {
    // If the table doesn't exist yet (schema not pushed), log and continue
    console.warn('[Idempotency] Could not record idempotency key:', error);
  }
}

/**
 * Process individual sync operation
 */
async function processOperation(operation: SyncOperation, branchId: string): Promise<void> {
  // Check idempotency key to prevent duplicate processing
  if (operation.idempotencyKey) {
    const alreadyProcessed = await checkIdempotencyKey(operation.idempotencyKey, branchId);
    if (alreadyProcessed) {
      console.log(`[Idempotency] Skipping already processed operation: ${operation.idempotencyKey}`);
      return;
    }
  }

  switch (operation.type) {
    case OperationType.CREATE_ORDER:
      await createOrder(operation.data, branchId);
      break;

    case OperationType.UPDATE_ORDER:
      await updateOrder(operation.data, branchId);
      break;

    case OperationType.CREATE_INVENTORY:
      await createInventory(operation.data, branchId);
      break;

    case OperationType.UPDATE_INVENTORY:
      await updateInventory(operation.data, branchId);
      break;

    case OperationType.CREATE_WASTE:
      await createWaste(operation.data, branchId);
      break;

    case OperationType.CREATE_SHIFT:
      await createShift(operation.data, branchId);
      break;

    case OperationType.UPDATE_SHIFT:
      await updateShift(operation.data, branchId);
      break;

    case OperationType.CLOSE_SHIFT:
      addLog(`[BatchPush] About to call closeShift for operation ${operation.id}`);
      console.log(`[BatchPush] About to call closeShift for operation ${operation.id}`, JSON.stringify(operation.data, null, 2));
      await closeShift(operation.data, branchId);
      addLog(`[BatchPush] closeShift completed for operation ${operation.id}`);
      break;

    case OperationType.OPEN_BUSINESS_DAY:
      await openBusinessDay(operation.data, branchId);
      break;

    case OperationType.CLOSE_BUSINESS_DAY:
      await closeBusinessDay(operation.data, branchId);
      break;

    case OperationType.CREATE_CUSTOMER:
      await createCustomer(operation.data, branchId);
      break;

    case OperationType.UPDATE_USER:
      await updateUser(operation.data);
      break;

    case OperationType.CREATE_DAILY_EXPENSE:
      await createDailyExpense(operation.data, branchId);
      break;

    case OperationType.CREATE_VOIDED_ITEM:
      await createVoidedItem(operation.data, branchId);
      break;

    case OperationType.CREATE_PROMO_CODE:
      await createPromoCode(operation.data, branchId);
      break;

    case OperationType.USE_PROMO_CODE:
      await handleUsePromoCode(operation.data, branchId);
      break;

    case OperationType.CREATE_LOYALTY_TRANSACTION:
      await createLoyaltyTransaction(operation.data);
      break;

    case OperationType.CREATE_TABLE:
      await createTable(operation.data, branchId);
      break;

    case OperationType.UPDATE_TABLE:
      await updateTable(operation.data, branchId);
      break;

    case OperationType.CLOSE_TABLE:
      await closeTable(operation.data, branchId);
      break;

    case OperationType.CREATE_INVENTORY_TRANSACTION:
      await createInventoryTransaction(operation.data, branchId);
      break;

    case OperationType.UPDATE_CUSTOMER:
      await updateCustomer(operation.data, branchId);
      break;

    case OperationType.CREATE_INGREDIENT:
      await createIngredient(operation.data, branchId);
      break;

    case OperationType.UPDATE_INGREDIENT:
      await updateIngredient(operation.data, branchId);
      break;

    case OperationType.CREATE_MENU_ITEM:
      await createMenuItem(operation.data, branchId);
      break;

    case OperationType.UPDATE_MENU_ITEM:
      await updateMenuItem(operation.data, branchId);
      break;

    case OperationType.CREATE_TRANSFER:
      await createTransfer(operation.data, branchId);
      break;

    case OperationType.CREATE_PURCHASE_ORDER:
      await createPurchaseOrder(operation.data, branchId);
      break;

    case OperationType.UPDATE_PURCHASE_ORDER:
      await updatePurchaseOrder(operation.data, branchId);
      break;

    case OperationType.CREATE_RECEIPT_SETTINGS:
      await createReceiptSettings(operation.data);
      break;

    case OperationType.UPDATE_RECEIPT_SETTINGS:
      await updateReceiptSettings(operation.data);
      break;

    default:
      throw new Error(`Unknown operation type: ${operation.type}`);
  }
}

/**
 * Create order with validation and idempotency check
 * Note: Prisma automatically handles transactions for nested creates (order + items)
 */
async function createOrder(data: any, branchId: string): Promise<void> {
  addLog('[BatchPush] Creating order with data:' + JSON.stringify(data, null, 2));

  // Extract items - check multiple possible locations
  let orderItems: any[] | undefined;

  if (data._offlineData?.items && Array.isArray(data._offlineData.items)) {
    // Offline orders have items in _offlineData.items
    orderItems = data._offlineData.items;
    console.log('[BatchPush] Extracted items from _offlineData.items:', orderItems.length, 'items');
  } else if (data.items && Array.isArray(data.items)) {
    // Online orders have items directly in data.items
    orderItems = data.items;
    console.log('[BatchPush] Extracted items from data.items:', orderItems.length, 'items');
  }

  // Validate that we have items
  if (!orderItems || orderItems.length === 0) {
    throw new Error(`No items found in order data. Order number: ${data.orderNumber}`);
  }

  // Phase 1: Validation & Pre-checks
  addLog('[BatchPush] Phase 1: Validation and Pre-checks for order');
  addLog(`[BatchPush] Order number: ${data.orderNumber}, orderTimestamp: ${data.orderTimestamp || data.createdAt}`);

  // Extract subtotal from either _offlineData or data directly
  const subtotal = data._offlineData?.subtotal !== undefined ? data._offlineData.subtotal :
                   data.subtotal !== undefined ? data.subtotal : undefined;

  // Handle shiftId - check if it's a temp ID and map to real ID
  // IMPORTANT: Do this BEFORE duplicate checking to ensure we check against the correct shiftId
  let shiftId = data.shiftId || null;
  addLog(`[BatchPush] Initial shiftId: ${shiftId}`);

  if (shiftId && shiftId.startsWith('temp-')) {
    const realShiftId = tempIdToRealIdMap.get(shiftId);
    if (realShiftId) {
      shiftId = realShiftId;
      addLog(`[BatchPush] Mapped temp shift ID ${data.shiftId} to real ID ${realShiftId} for order`);
    } else {
      // Temp shift ID not mapped yet, don't set shiftId for now
      addLog(`[BatchPush] WARNING: Temp shift ID ${shiftId} not mapped yet, not linking order to shift`);
      addLog(`[BatchPush] Available mappings: ` + JSON.stringify(Array.from(tempIdToRealIdMap.entries())));
      shiftId = null;
    }
  }

  // Get the order timestamp
  const orderTimestamp = data.orderTimestamp ? new Date(data.orderTimestamp) : new Date(data.createdAt);

  // Check for duplicate order using the MAPPED shiftId
  // This prevents violating the unique constraint (branchId, shiftId, orderNumber)
  if (shiftId) {
    const duplicateOrder = await db.order.findFirst({
      where: {
        branchId,
        shiftId,
        orderNumber: data.orderNumber
      }
    });

    if (duplicateOrder) {
      addLog(`[BatchPush] Order ${data.orderNumber} already exists in database for shift ${shiftId} with ID ${duplicateOrder.id}, skipping creation`);
      addLog(`[BatchPush] Existing order: timestamp=${duplicateOrder.orderTimestamp.toISOString()}, shiftId=${duplicateOrder.shiftId}`);
      return; // Skip creation if true duplicate
    }
  } else {
    // No shiftId - check by branchId and orderNumber only
    const duplicateOrder = await db.order.findFirst({
      where: {
        branchId,
        orderNumber: data.orderNumber
      }
    });

    if (duplicateOrder) {
      // Check if this is truly a duplicate or just an order number from a different shift/day
      // If the timestamps are very different (more than 1 hour), it's likely a new shift starting fresh
      const timeDiff = Math.abs(duplicateOrder.orderTimestamp.getTime() - orderTimestamp.getTime());
      const oneHourInMs = 60 * 60 * 1000; // 1 hour in milliseconds

      if (timeDiff > oneHourInMs) {
        addLog(`[BatchPush] Order ${data.orderNumber} exists in DB but timestamp is ${Math.floor(timeDiff / 1000 / 60)} minutes apart - treating as new order from different shift`);
        addLog(`[BatchPush] Existing order: timestamp=${duplicateOrder.orderTimestamp.toISOString()}, shiftId=${duplicateOrder.shiftId}`);
        addLog(`[BatchPush] New order: timestamp=${orderTimestamp.toISOString()}`);
        // Don't return - continue with creation
      } else {
        addLog(`[BatchPush] Order ${data.orderNumber} already exists in database with ID ${duplicateOrder.id} (${Math.floor(timeDiff / 1000)}s difference), skipping creation`);
        addLog(`[BatchPush] Existing order details: shiftId=${duplicateOrder.shiftId}, orderTimestamp=${duplicateOrder.orderTimestamp.toISOString()}`);
        return; // Skip creation if true duplicate
      }
    }
  }

  // Handle customerId - check if it's a temp ID and map to real ID
  let customerId = data.customerId || null;
  if (customerId && customerId.startsWith('temp-')) {
    const realCustomerId = tempIdToRealIdMap.get(customerId);
    if (realCustomerId) {
      customerId = realCustomerId;
      console.log(`[BatchPush] Mapped temp customer ID ${data.customerId} to real ID ${realCustomerId} for order`);
    } else {
      // Temp customer ID not mapped yet, don't set customerId for now
      console.warn(`[BatchPush] Temp customer ID ${customerId} not mapped yet, not linking order to customer`);
      customerId = null;
    }
  }

  // Prepare order data - only include fields that exist in the Order model
  const orderData: any = {
    branchId,
    orderNumber: data.orderNumber,
    cashierId: data.cashierId, // cashierId is required
    customerId: customerId, // Use mapped customerId (or null if temp ID not mapped yet)
    orderType: data.orderType,
    totalAmount: data.totalAmount,
    paymentMethod: data.paymentMethod || null,
    paymentMethodDetail: data.paymentMethodDetail || null,
    shiftId: shiftId, // Use mapped shiftId (or null if temp ID not mapped yet)
    isRefunded: data.isRefunded || false,
    refundReason: data.refundReason || null,
    transactionHash: data.transactionHash || generateTransactionHash(data, branchId, data.orderNumber, data.totalAmount, data.cashierId, data.createdAt),
    orderTimestamp: data.orderTimestamp ? new Date(data.orderTimestamp) : new Date(data.createdAt),
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
    synced: true, // Mark as synced since this is coming from the sync API
    // Include discount fields from offline orders
    promoCodeId: data.promoCodeId || null,
    promoDiscount: data.promoDiscount || 0,
    manualDiscountPercent: data.manualDiscountPercent || 0,
    manualDiscountAmount: data.manualDiscountAmount || 0,
    manualDiscountComment: data.manualDiscountComment || null,
  };

  // Add subtotal if available
  if (subtotal !== undefined) {
    orderData.subtotal = subtotal;
  } else {
    console.log(`[BatchPush] WARNING: No subtotal found for order ${data.orderNumber}`);
  }

  // Add delivery-specific fields if available
  if (data.deliveryAddress) {
    orderData.deliveryAddress = data.deliveryAddress;
  }
  if (data.deliveryAreaId) {
    orderData.deliveryAreaId = data.deliveryAreaId;
  }
  if (data.deliveryFee !== undefined) {
    orderData.deliveryFee = data.deliveryFee;
  }
  if (data.courierId) {
    orderData.courierId = data.courierId;
  }

  // Helper function to generate transaction hash if not provided
  function generateTransactionHash(data: any, branchId: string, orderNumber: number, totalAmount: number, cashierId: string, createdAt: string) {
    return Buffer.from(
      `${branchId}-${orderNumber}-${totalAmount}-${cashierId || 'unknown'}-${Date.now()}`
    ).toString('base64');
  }

  // Only use provided ID if it's not a temporary ID
  if (!data.id || !data.id.startsWith('temp-')) {
    orderData.id = data.id;
  }

  addLog(`[BatchPush] Creating order with shiftId: ${shiftId}, orderNumber: ${data.orderNumber}`);
  addLog(`[BatchPush] Order data before creation: shiftId=${shiftId}, orderTimestamp=${orderData.orderTimestamp}, totalAmount=${orderData.totalAmount}, itemsCount=${orderItems.length}`);

  // Create order with inventory deduction in a transaction
  const createdOrder = await db.$transaction(async (tx) => {
    // Create order
    const newOrder = await tx.order.create({
      data: {
        ...orderData,
        items: {
          create: orderItems.map((item: any) => ({
            menuItemId: item.menuItemId,
            itemName: item.itemName || item.name || 'Unknown',
            quantity: item.quantity,
            menuItemVariantId: item.menuItemVariantId || null,
            variantName: item.variantName || null,
            customVariantValue: item.customVariantValue || null,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal || (item.quantity * item.unitPrice),
            recipeVersion: item.recipeVersion || 1,
          })),
        },
      },
    });

    // Apply inventory deductions from offline data
    const inventoryDeductions = data._offlineData?.inventoryDeductions || [];
    if (inventoryDeductions.length > 0) {
      addLog(`[BatchPush] Applying ${inventoryDeductions.length} inventory deductions for offline order`);

      for (const deduction of inventoryDeductions) {
        await safeInventoryDeduct(
          tx,
          branchId,
          deduction.ingredientId,
          deduction.quantityChange,
          newOrder.id,
          data.cashierId,
          deduction.ingredientName
        );
      }
    } else {
      addLog(`[BatchPush] No inventory deductions found in offline data`);
    }

    return newOrder;
  }).catch((transactionError) => {
    addLog(`[BatchPush] Transaction failed for order ${data.orderNumber}: ${transactionError instanceof Error ? transactionError.message : String(transactionError)}`);
    throw transactionError;
  });

  addLog(`[BatchPush] Order created successfully: orderId=${createdOrder.id}, orderNumber=${createdOrder.orderNumber}, shiftId=${createdOrder.shiftId}, orderTimestamp=${createdOrder.orderTimestamp}, totalAmount=${createdOrder.totalAmount}`);

  // Award loyalty points if customer is linked
  // Points should be based on subtotal (not including delivery fees)
  if (customerId && customerId !== null && !customerId.startsWith('temp-')) {
    try {
      // Use subtotal for loyalty points (excludes delivery fees)
      const pointsAmount = subtotal || data.subtotal || 0;

      addLog(`[BatchPush] Checking loyalty points award: customerId=${customerId}, pointsAmount=${pointsAmount}, orderNumber=${data.orderNumber}`);

      if (pointsAmount > 0) {
        addLog(`[BatchPush] Awarding loyalty points for customer ${customerId} from order ${createdOrder.id}, amount: ${pointsAmount}`);

        // Import loyalty logic
        const { awardLoyaltyPoints } = await import('@/lib/loyalty-utils');
        const loyaltyResult = await awardLoyaltyPoints(customerId, createdOrder.id, pointsAmount);

        addLog(`[BatchPush] Loyalty points awarded successfully: pointsEarned=${loyaltyResult.pointsEarned}, totalPoints=${loyaltyResult.totalPoints}`);
      } else {
        addLog('[BatchPush] Points amount is 0 or negative, skipping loyalty points');
      }
    } catch (loyaltyError) {
      addLog(`[BatchPush] Error awarding loyalty points: ${loyaltyError instanceof Error ? loyaltyError.message : 'Unknown error'}`);
      // Don't fail the order if loyalty fails
    }
  } else {
    addLog('[BatchPush] No customer linked to order or customer has temp ID, skipping loyalty points');
  }
}

/**
 * Update order
 */
async function updateOrder(data: any, branchId: string): Promise<void> {
  // Update order basic info - only include fields that exist in the Order model
  const updateData: any = {
    paymentMethod: data.paymentMethod,
    paymentMethodDetail: data.paymentMethodDetail || null,
    isRefunded: data.isRefunded || false,
    refundReason: data.refundReason || null,
    updatedAt: new Date(data.updatedAt),
  };

  // Only update shiftId if it's provided
  if (data.shiftId !== undefined) {
    let shiftId = data.shiftId;
    // Map temp shift ID to real ID if needed
    if (shiftId && shiftId.startsWith('temp-')) {
      const realShiftId = tempIdToRealIdMap.get(shiftId);
      if (realShiftId) {
        shiftId = realShiftId;
        console.log(`[BatchPush] Mapped temp shift ID ${data.shiftId} to real ID ${realShiftId} for order update`);
      } else {
        // Temp shift ID not mapped, set to null
        console.warn(`[BatchPush] Temp shift ID ${shiftId} not mapped yet, not updating shiftId`);
        shiftId = null;
      }
    }
    updateData.shiftId = shiftId;
  }

  // Update order if customerId is provided
  if (data.customerId !== undefined) {
    updateData.customerId = data.customerId;
  }
  
  // Update order if customerAddressId is provided
  if (data.customerAddressId !== undefined) {
    updateData.customerAddressId = data.customerAddressId;
  }
  
  // Update order if courierId is provided
  if (data.courierId !== undefined) {
    updateData.courierId = data.courierId;
  }
  
  // Update order if deliveryAddress is provided
  if (data.deliveryAddress !== undefined) {
    updateData.deliveryAddress = data.deliveryAddress;
  }
  
  // Update order if deliveryAreaId is provided
  if (data.deliveryAreaId !== undefined) {
    updateData.deliveryAreaId = data.deliveryAreaId;
  }
  
  // Update order if deliveryFee is provided
  if (data.deliveryFee !== undefined) {
    updateData.deliveryFee = data.deliveryFee;
  }

  await db.order.update({
    where: { id: data.id },
    data: updateData,
  });

  // Update order items if provided
  if (data.items && Array.isArray(data.items)) {
    // Delete existing items
    await db.orderItem.deleteMany({
      where: { orderId: data.id },
    });

    // Create new items
    await db.orderItem.createMany({
      data: data.items.map((item: any) => ({
        orderId: data.id,
        menuItemId: item.menuItemId,
        itemName: item.itemName || item.name || 'Unknown',
        quantity: item.quantity,
        menuItemVariantId: item.menuItemVariantId || null,
        variantName: item.variantName || null,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal || (item.quantity * item.unitPrice),
        recipeVersion: item.recipeVersion || 1,
      })),
    });
  }
}

/**
 * Create inventory
 */
async function createInventory(data: any, branchId: string): Promise<void> {
  await db.inventory.create({
    data: {
      id: data.id,
      branchId,
      ingredientId: data.ingredientId,
      quantity: data.quantity,
      unit: data.unit,
      reorderLevel: data.reorderLevel,
      lastRestockedAt: data.lastRestockedAt ? new Date(data.lastRestockedAt) : null,
      version: data.version || 1,
    },
  });
}

/**
 * Update inventory
 */
async function updateInventory(data: any, branchId: string): Promise<void> {
  await db.inventory.update({
    where: { id: data.id },
    data: {
      quantity: data.quantity,
      lastRestockedAt: data.lastRestockedAt ? new Date(data.lastRestockedAt) : null,
      version: (data.version || 0) + 1,
    },
  });
}

/**
 * Create waste log
 */
async function createWaste(data: any, branchId: string): Promise<void> {
  await db.wasteLog.create({
    data: {
      id: data.id,
      branchId,
      menuItemId: data.menuItemId || null,
      ingredientId: data.ingredientId || null,
      quantity: data.quantity,
      reason: data.reason,
      cost: data.cost || 0,
      notes: data.notes || null,
      recordedBy: data.recordedBy,
      createdAt: new Date(data.createdAt),
    },
  });
}

/**
 * Create customer
 */
async function createCustomer(data: any, branchId: string): Promise<void> {
  console.log('[BatchPush] Creating customer with data:', JSON.stringify(data, null, 2));

  // Check if this is a temp ID that's already mapped
  if (data.id && data.id.startsWith('temp-')) {
    const existingRealId = tempIdToRealIdMap.get(data.id);
    if (existingRealId) {
      console.log(`[BatchPush] Temp customer ID ${data.id} already mapped to ${existingRealId}, skipping creation`);
      return;
    }
  }

  // Check if customer already exists by phone number
  const existingCustomer = await db.customer.findFirst({
    where: {
      phone: data.phone,
    },
  });

  let customerId: string;

  if (existingCustomer) {
    // Customer exists, use their ID
    customerId = existingCustomer.id;
    console.log(`[BatchPush] Customer with phone ${data.phone} already exists: ${customerId}`);

    // Create addresses if they don't exist
    if (data.addresses && Array.isArray(data.addresses)) {
      for (const addr of data.addresses) {
        // Check if address already exists for this customer
        const existingAddress = await db.customerAddress.findFirst({
          where: {
            customerId,
            streetAddress: addr.streetAddress,
          },
        });

        if (!existingAddress) {
          await db.customerAddress.create({
            data: {
              customerId,
              building: addr.building || null,
              streetAddress: addr.streetAddress,
              floor: addr.floor || null,
              apartment: addr.apartment || null,
              deliveryAreaId: addr.deliveryAreaId || null,
              isDefault: addr.isDefault || false,
            },
          });
          console.log(`[BatchPush] Created address for existing customer ${customerId}`);
        }
      }
    }
  } else {
    // Create new customer
    const customerData: any = {
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      branchId: data.branchId || branchId,
      notes: data.notes || null,
    };

    // Only use provided ID if it's not a temporary ID
    if (data.id && !data.id.startsWith('temp-')) {
      customerData.id = data.id;
    }

    const createdCustomer = await db.customer.create({
      data: {
        ...customerData,
        addresses: data.addresses ? {
          create: data.addresses.map((addr: any) => ({
            building: addr.building || null,
            streetAddress: addr.streetAddress,
            floor: addr.floor || null,
            apartment: addr.apartment || null,
            deliveryAreaId: addr.deliveryAreaId || null,
            isDefault: addr.isDefault || false,
          })),
        } : undefined,
      },
      include: {
        addresses: true,
      },
    });

    customerId = createdCustomer.id;
    console.log('[BatchPush] Customer created successfully:', createdCustomer);
  }

  // Map temp ID to real ID for future operations
  if (data.id && data.id.startsWith('temp-')) {
    tempIdToRealIdMap.set(data.id, customerId);
    console.log(`[BatchPush] Mapped temp customer ID ${data.id} to real ID ${customerId}`);
  }
}

/**
 * Create shift
 * Includes deduplication logic to prevent duplicate shifts when syncing offline data multiple times
 * FIX: Links orders created offline with temp shift ID to the real shift ID
 */
async function createShift(data: any, branchId: string): Promise<void> {
  addLog('[BatchPush] Creating shift with data:' + JSON.stringify(data, null, 2));
  addLog('[BatchPush] Current tempIdToRealIdMap entries before shift creation: ' + JSON.stringify(Array.from(tempIdToRealIdMap.entries())));

  // Validate required fields
  if (!data.cashierId || data.cashierId === 'all') {
    throw new Error('Invalid cashierId: cannot be empty or "all"');
  }

  // Validate and parse startTime
  let startTime: Date;
  if (!data.startTime) {
    throw new Error('Missing startTime');
  }

  const parsedStartTime = new Date(data.startTime);
  if (isNaN(parsedStartTime.getTime())) {
    throw new Error(`Invalid startTime: ${data.startTime}`);
  }
  startTime = parsedStartTime;

  // Parse endTime if provided
  let endTime: Date | null = null;
  if (data.endTime) {
    const parsedEndTime = new Date(data.endTime);
    if (!isNaN(parsedEndTime.getTime())) {
      endTime = parsedEndTime;
    }
  }

  // If this has a temporary ID, check if we already mapped it
  if (data.id && data.id.startsWith('temp-')) {
    const existingRealId = tempIdToRealIdMap.get(data.id);
    if (existingRealId) {
      console.log(`[BatchPush] Temp ID ${data.id} already mapped to ${existingRealId}, skipping creation`);
      return;
    }
  }

  // Check for duplicate shift by matching branchId, cashierId, and startTime (within 5 minutes)
  // This prevents creating duplicate shifts when the same offline shift syncs multiple times
  // Using 5-minute window to handle reasonable offline periods
  const timeWindowStart = new Date(startTime.getTime() - 300000); // 5 minutes before
  const timeWindowEnd = new Date(startTime.getTime() + 300000);   // 5 minutes after

  addLog(`[BatchPush] Checking for duplicate shift with branchId=${branchId}, cashierId=${data.cashierId}, startTime=${startTime.toISOString()}, window=[${timeWindowStart.toISOString()}, ${timeWindowEnd.toISOString()}]`);

  const existingShift = await db.shift.findFirst({
    where: {
      branchId,
      cashierId: data.cashierId,
      startTime: {
        gte: timeWindowStart,
        lte: timeWindowEnd,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existingShift) {
    addLog(`[BatchPush] Found existing shift ${existingShift.id} matching criteria, skipping creation`);
    // Map the temp ID to the existing real ID for future operations
    if (data.id && data.id.startsWith('temp-')) {
      tempIdToRealIdMap.set(data.id, existingShift.id);
    }
    return;
  }

  // If this is an offline-created shift with tempId, don't specify id - let Prisma generate one
  const shiftData: any = {
    branchId,
    cashierId: data.cashierId,
    startTime,
    endTime,
    isClosed: data.isClosed || false,
    openingCash: data.openingCash || 0,
    closingCash: data.closingCash || 0,
    notes: data.notes || null,
  };

  // Handle dayId - link shift to business day
  if (data.dayId) {
    addLog('[BatchPush] Processing dayId for shift: ' + data.dayId);
    if (data.dayId.startsWith('temp-')) {
      // Map temp business day ID to real ID
      const realDayId = tempIdToRealIdMap.get(data.dayId);
      if (realDayId) {
        shiftData.dayId = realDayId;
        addLog(`[BatchPush] Mapped temp business day ID ${data.dayId} to real ID ${realDayId} for shift`);
      } else {
        addLog(`[BatchPush] WARNING: Could not map temp business day ID ${data.dayId}, shift will not be linked to business day`);
        addLog(`[BatchPush] WARNING: Available mappings: ` + JSON.stringify(Array.from(tempIdToRealIdMap.entries())));
      }
    } else {
      // Use the real business day ID directly
      shiftData.dayId = data.dayId;
      addLog(`[BatchPush] Using real business day ID ${data.dayId} for shift`);
    }
  } else {
    addLog('[BatchPush] WARNING: No dayId provided for shift, shift will not be linked to business day');
  }

  // Only use provided ID if it's not a temporary ID
  if (!data.id || !data.id.startsWith('temp-')) {
    shiftData.id = data.id;
  }

  // Create the shift
  const newShift = await db.shift.create({ data: shiftData });

  addLog(`[BatchPush] Shift created successfully with ID: ${newShift.id} and dayId: ${newShift.dayId}`);

  // Map the temp ID to the new real ID for future operations (like closeShift)
  if (data.id && data.id.startsWith('temp-')) {
    tempIdToRealIdMap.set(data.id, newShift.id);
    addLog(`[BatchPush] Mapped temp ID ${data.id} to real ID ${newShift.id}`);
  }

  // CRITICAL FIX: Link any orders that were created BEFORE this shift with temp ID
  // This handles the case where CREATE_ORDER runs BEFORE CREATE_SHIFT in the same batch
  if (data.startTime && data.id && data.id.startsWith('temp-')) {
    addLog(`[BatchPush] Looking for unlinked orders created with temp shift ID ${data.id}...`);
    
    const shiftStartTime = new Date(data.startTime);
    const shiftEndTime = data.endTime ? new Date(data.endTime) : new Date();

    const unlinkedOrders = await db.order.findMany({
      where: {
        branchId,
        cashierId: data.cashierId,
        shiftId: null,
        orderTimestamp: {
          gte: shiftStartTime,
          lte: shiftEndTime,
        },
        isRefunded: false,
      },
      select: {
        id: true,
        orderNumber: true,
        orderTimestamp: true,
        subtotal: true,
      },
    });

    if (unlinkedOrders.length > 0) {
      addLog(`[BatchPush] Found ${unlinkedOrders.length} unlinked orders created before this shift, linking them now...`);
      
      await db.order.updateMany({
        where: {
          id: { in: unlinkedOrders.map(o => o.id) },
        },
        data: { shiftId: newShift.id },
      });

      addLog(`[BatchPush] Linked ${unlinkedOrders.length} orders to shift ${newShift.id}:`, unlinkedOrders.map(o => o.orderNumber));
    } else {
      addLog(`[BatchPush] No unlinked orders found for this shift`);
    }
  }
}

/**
 * Update shift
 */
async function updateShift(data: any, branchId: string): Promise<void> {
  await db.shift.update({
    where: { id: data.id },
    data: {
      endTime: data.endTime ? new Date(data.endTime) : null,
      closingCash: data.closingCash,
      notes: data.notes,
    },
  });
}

/**
 * Link unlinked orders to a shift
 * This function can be called from multiple places (createShift, closeShift, etc.)
 */
async function linkUnlinkedOrdersToShift(
  shiftId: string,
  cashierId: string,
  shiftStartTime: Date,
  shiftEndTime: Date
): Promise<void> {
  addLog(`[BatchPush] linkUnlinkedOrdersToShift: Looking for orders between ${shiftStartTime.toISOString()} and ${shiftEndTime.toISOString()}`);

  // Get the shift to access its branchId
  const shift = await db.shift.findUnique({
    where: { id: shiftId },
    select: { branchId: true },
  });

  if (!shift) {
    addLog(`[BatchPush] linkUnlinkedOrdersToShift: Shift ${shiftId} not found, skipping`);
    return;
  }

  // DEBUG: Check ALL orders for this branch/cashier
  const allOrdersForCashier = await db.order.findMany({
    where: {
      branchId: shift.branchId,
      cashierId: cashierId,
      isRefunded: false,
    },
    select: {
      id: true,
      orderNumber: true,
      orderTimestamp: true,
      shiftId: true,
      subtotal: true,
    },
    orderBy: { orderTimestamp: 'desc' },
  });

  addLog(`[BatchPush] linkUnlinkedOrdersToShift: ALL orders for cashier ${cashierId} in branch ${shift.branchId}:` + JSON.stringify({
    total: allOrdersForCashier.length,
    withShiftId: allOrdersForCashier.filter(o => o.shiftId !== null).length,
    withoutShiftId: allOrdersForCashier.filter(o => o.shiftId === null).length,
    orders: allOrdersForCashier.map(o => ({
      orderNumber: o.orderNumber,
      orderTimestamp: o.orderTimestamp,
      shiftId: o.shiftId,
      subtotal: o.subtotal,
    }))
  }, null, 2));

  // Find orders created during this shift's time window that don't have a shiftId
  const unlinkedOrders = await db.order.findMany({
    where: {
      branchId: shift.branchId,
      cashierId: cashierId,
      shiftId: null,
      orderTimestamp: {
        gte: shiftStartTime,
        lte: shiftEndTime,
      },
      isRefunded: false,
    },
    select: {
      id: true,
      orderNumber: true,
      orderTimestamp: true,
      totalAmount: true,
      subtotal: true,
    },
  });

  addLog(`[BatchPush] linkUnlinkedOrdersToShift: Found ${unlinkedOrders.length} unlinked orders for shift ${shiftId}:` + JSON.stringify(unlinkedOrders.map(o => o.orderNumber)));

  if (unlinkedOrders.length > 0) {
    addLog(`[BatchPush] linkUnlinkedOrdersToShift: Linking ${unlinkedOrders.length} unlinked orders to shift ${shiftId}`);
    await db.order.updateMany({
      where: {
        id: {
          in: unlinkedOrders.map(o => o.id),
        },
      },
      data: {
        shiftId: shiftId,
      },
    });
    addLog(`[BatchPush] linkUnlinkedOrdersToShift: Linked ${unlinkedOrders.length} orders to shift ${shiftId}:` + JSON.stringify(unlinkedOrders.map(o => o.orderNumber)));
  } else {
    addLog(`[BatchPush] linkUnlinkedOrdersToShift: No unlinked orders found for shift ${shiftId}`);
  }
}

/**
 * Close shift
 * Similar to updateShift but specifically for closing a shift
 * Improved to handle temporary IDs and prevent duplicate shifts
 */
async function closeShift(data: any, branchId: string): Promise<void> {
  // DEBUG: Log incoming data
  addLog('[BatchPush] closeShift called with data:' + JSON.stringify({
    id: data.id,
    startTime: data.startTime,
    endTime: data.endTime,
    cashierId: data.cashierId,
  }, null, 2));

  // If the shift has a temporary ID, we need to find the real shift ID
  let shiftId = data.id;

  if (data.id && data.id.startsWith('temp-')) {
    // First, check if we have a mapping for this temp ID
    const mappedId = tempIdToRealIdMap.get(data.id);
    if (mappedId) {
      shiftId = mappedId;
      console.log(`[BatchPush] Found mapped real ID ${shiftId} for temp ID ${data.id}`);
    } else {
      // Parse startTime - handle both Date objects and ISO strings
      let startTime: Date | undefined;
      if (data.startTime) {
        if (data.startTime instanceof Date) {
          startTime = data.startTime;
        } else if (typeof data.startTime === 'string') {
          startTime = new Date(data.startTime);
          if (isNaN(startTime.getTime())) {
            console.warn(`[BatchPush] Invalid startTime string: ${data.startTime}, will use fallback`);
            startTime = undefined;
          }
        }
      }

      // Try to find the shift by matching temporary shift properties
      // Use 24-hour time window for better matching (handles extended offline periods)
      if (startTime) {
        addLog(`[BatchPush] Looking for shift with startTime: ${startTime.toISOString()}`);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
        const timeWindowStart = new Date(startTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours before
        const timeWindowEnd = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);   // 24 hours after

        const tempShift = await db.shift.findFirst({
          where: {
            branchId,
            cashierId: data.cashierId,
            startTime: {
              gte: timeWindowStart,
              lte: timeWindowEnd,
            },
            isClosed: false,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (tempShift) {
          shiftId = tempShift.id;
          addLog(`[BatchPush] Found real shift ID ${shiftId} for temp shift ${data.id}`);
          // Store the mapping for future operations
          tempIdToRealIdMap.set(data.id, shiftId);
        } else {
          addLog(`[BatchPush] No open shift found with matching startTime, trying fallback`);
        }
      }

      // If we still don't have the shift ID, use fallback: find most recent open shift for this cashier
      if (shiftId.startsWith('temp-')) {
        addLog(`[BatchPush] Using fallback: finding most recent open shift for cashier ${data.cashierId}`);
        const recentShift = await db.shift.findFirst({
          where: {
            branchId,
            cashierId: data.cashierId,
            isClosed: false,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (recentShift) {
          shiftId = recentShift.id;
          addLog(`[BatchPush] Using most recent open shift ID ${shiftId} for temp shift ${data.id}`);
          tempIdToRealIdMap.set(data.id, shiftId);
        } else {
          // Final fallback: find the most recent shift (open or closed) for this cashier + branch
          addLog(`[BatchPush] No open shift found, checking all shifts for cashier ${data.cashierId}`);
          const anyShift = await db.shift.findFirst({
            where: {
              branchId,
              cashierId: data.cashierId,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (anyShift) {
            // Check if this shift's startTime is within a reasonable time window (24 hours for extended offline)
            const shiftTime = anyShift.startTime.getTime();
            const dataTime = data.startTime ? new Date(data.startTime).getTime() : Date.now();
            const timeDiff = Math.abs(shiftTime - dataTime);

            if (timeDiff <= 24 * 60 * 60 * 1000) { // 24 hours (increased from 5 minutes)
              shiftId = anyShift.id;
              addLog(`[BatchPush] Using recent shift ID ${shiftId} (within 24h window, ${Math.floor(timeDiff / 1000)}s difference) for temp shift ${data.id}, isClosed: ${anyShift.isClosed}`);

              // If the shift is already closed, skip the close operation
              // BUT STILL LINK ANY UNLINKED ORDERS that were created during this shift
              if (anyShift.isClosed) {
                addLog(`[BatchPush] Shift ${shiftId} is already closed, skipping close operation but will link unlinked orders`);
                tempIdToRealIdMap.set(data.id, shiftId);

                // CRITICAL: Still link unlinked orders even though we're skipping close
                await linkUnlinkedOrdersToShift(shiftId, data.cashierId, anyShift.startTime, anyShift.endTime || new Date());
                return;
              }

              tempIdToRealIdMap.set(data.id, shiftId);
            } else {
              throw new Error(`Could not find real shift for temp ID: ${data.id}. Recent shift is too old (${Math.floor(timeDiff / 1000)}s difference, > 24h)`);
            }
          } else {
            throw new Error(`Could not find real shift for temp ID: ${data.id}. No shift found for cashier ${data.cashierId} in branch ${branchId}`);
          }
        }
      }
    }
  }

  // Parse endTime - handle both Date objects and ISO strings
  let endTime: Date | undefined;
  if (data.endTime) {
    if (data.endTime instanceof Date) {
      endTime = data.endTime;
    } else if (typeof data.endTime === 'string') {
      endTime = new Date(data.endTime);
      if (isNaN(endTime.getTime())) {
        console.warn(`[BatchPush] Invalid endTime string: ${data.endTime}, using current time`);
        endTime = new Date();
      }
    }
  } else {
    endTime = new Date();
  }

  // Get the shift to access its branchId
  const shift = await db.shift.findUnique({
    where: { id: shiftId },
    select: { branchId: true },
  });

  if (!shift) {
    throw new Error(`Shift ${shiftId} not found`);
  }

  // Calculate actual closing figures from orders
  // Revenue = subtotal (excludes delivery fees which go to couriers, excludes loyalty discounts)
  const orderStats = await db.order.aggregate({
    where: {
      shiftId: shiftId,
    },
    _count: true,
    _sum: {
      subtotal: true,  // Revenue = subtotal (no delivery fees, no discounts)
      deliveryFee: true,
      totalAmount: true,
    },
  });

  // Get loyalty discounts for this branch (costs tracked as "Loyalty Discounts")
  const loyaltyDiscountStats = await db.branchCost.aggregate({
    where: {
      branchId: shift.branchId,
      shiftId: shiftId, // Only get loyalty discounts for this specific shift
      costCategory: {
        name: 'Loyalty Discounts',
      },
    },
    _sum: {
      amount: true,
    },
  });

  // Calculate what the cashier actually has
  // Cashier revenue = subtotal - loyaltyDiscounts (delivery fees go to courier)
  const deliveryFees = orderStats._sum.deliveryFee || 0;
  const loyaltyDiscounts = loyaltyDiscountStats._sum.amount || 0;
  let cashierRevenue = (orderStats._sum.subtotal || 0) - loyaltyDiscounts;

  console.log(`[BatchPush] Closing shift ${shiftId} with calculated stats:`, {
    orders: orderStats._count,
    subtotal: orderStats._sum.subtotal || 0,
    deliveryFees,
    loyaltyDiscounts,
    cashierRevenue,
  });

  // IMPORTANT: Link any unlinked orders to this shift before closing
  // This handles the case where orders were created before the shift ID was mapped
  if (data.startTime) {
    const shiftStartTime = new Date(data.startTime);
    const shiftEndTime = new Date(endTime);

    await linkUnlinkedOrdersToShift(shiftId, data.cashierId, shiftStartTime, shiftEndTime);

    // Recalculate order stats after linking
    const updatedOrderStats = await db.order.aggregate({
      where: {
        shiftId: shiftId,
      },
      _count: true,
      _sum: {
        subtotal: true,
        deliveryFee: true,
        totalAmount: true,
      },
    });

    console.log(`[BatchPush] Updated order stats after linking:`, {
      orders: updatedOrderStats._count,
      subtotal: updatedOrderStats._sum.subtotal || 0,
    });

    // Update the stats
    orderStats._count = updatedOrderStats._count;
    orderStats._sum.subtotal = updatedOrderStats._sum.subtotal;
    orderStats._sum.deliveryFee = updatedOrderStats._sum.deliveryFee;
    orderStats._sum.totalAmount = updatedOrderStats._sum.totalAmount;

    // Recalculate cashier revenue
    const updatedCashierRevenue = (updatedOrderStats._sum.subtotal || 0) - loyaltyDiscounts;
    cashierRevenue = updatedCashierRevenue;
  } else {
    console.log(`[BatchPush] No startTime provided, skipping unlinked order check`);
  }

  await db.shift.update({
    where: { id: shiftId },
    data: {
      endTime,
      closingCash: data.closingCash || 0,
      isClosed: true,
      closingOrders: orderStats._count,
      closingRevenue: cashierRevenue, // Cashier's actual revenue (excludes delivery fees & discounts)
      closingLoyaltyDiscounts: loyaltyDiscounts,
      notes: data.notes || null,
    },
  });

  console.log(`[BatchPush] Shift ${shiftId} closed successfully with ${orderStats._count} orders`);
}

/**
 * Open business day
 * Creates a new business day in the database
 */
async function openBusinessDay(data: any, branchId: string): Promise<void> {
  addLog('[BatchPush] Opening business day with data:' + JSON.stringify(data, null, 2));
  addLog('[BatchPush] Current tempIdToRealIdMap entries: ' + JSON.stringify(Array.from(tempIdToRealIdMap.entries())));

  // For business days, we use a different strategy:
  // 1. First, check if there's an OPEN business day for this branch (regardless of when it was opened)
  // 2. If no open business day, check if there's a recently created one (within last 24 hours)
  // 3. If still none, create a new one
  // This handles the case where the system is offline for hours or days

  let existingBusinessDay = await db.businessDay.findFirst({
    where: {
      branchId,
      isOpen: true,
    },
    orderBy: { openedAt: 'desc' },
  });

  if (existingBusinessDay) {
    addLog(`[BatchPush] Found open business day ${existingBusinessDay.id} (opened at ${existingBusinessDay.openedAt.toISOString()}), using it instead of creating new one`);
    // Map the temp ID to the existing real ID for future operations
    if (data.id && data.id.startsWith('temp-')) {
      tempIdToRealIdMap.set(data.id, existingBusinessDay.id);
      addLog(`[BatchPush] Mapped temp ID ${data.id} to existing business day ${existingBusinessDay.id}`);
    }
    return;
  }

  // If no open business day, check if there's a recently OPEN business day (within last 24 hours)
  // This handles the case where the business day was opened but sync is delayed
  // IMPORTANT: Only map to OPEN business days, not closed ones
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
  existingBusinessDay = await db.businessDay.findFirst({
    where: {
      branchId,
      isOpen: true,  // Only find OPEN business days
      openedAt: {
        gte: oneDayAgo,
      },
    },
    orderBy: { openedAt: 'desc' },
  });

  if (existingBusinessDay) {
    addLog(`[BatchPush] Found recently OPEN business day ${existingBusinessDay.id} (opened at ${existingBusinessDay.openedAt.toISOString()}), using it`);
    // Map the temp ID to the existing real ID for future operations
    if (data.id && data.id.startsWith('temp-')) {
      tempIdToRealIdMap.set(data.id, existingBusinessDay.id);
      addLog(`[BatchPush] Mapped temp ID ${data.id} to existing business day ${existingBusinessDay.id}`);
    }
    return;
  }

  // If this has a temporary ID, check if we already mapped it
  if (data.id && data.id.startsWith('temp-')) {
    const existingRealId = tempIdToRealIdMap.get(data.id);
    if (existingRealId) {
      addLog(`[BatchPush] Temp ID ${data.id} already mapped to ${existingRealId}, skipping creation`);
      return;
    }
  }

  // Create the business day (only if we couldn't find any existing OPEN one)
  const businessDayData: any = {
    branchId,
    openedAt: new Date(data.openedAt),
    isOpen: true,
    openedBy: data.openedBy || data.openedById,
  };

  // Only use provided ID if it's not a temporary ID
  if (!data.id || !data.id.startsWith('temp-')) {
    businessDayData.id = data.id;
  }

  addLog(`[BatchPush] Creating new business day with data: ` + JSON.stringify(businessDayData));
  const newBusinessDay = await db.businessDay.create({ data: businessDayData });

  addLog(`[BatchPush] Business day created successfully with ID: ${newBusinessDay.id}`);

  // Map the temp ID to the new real ID for future operations
  if (data.id && data.id.startsWith('temp-')) {
    tempIdToRealIdMap.set(data.id, newBusinessDay.id);
    addLog(`[BatchPush] Mapped temp ID ${data.id} to real ID ${newBusinessDay.id}`);
  }

  addLog(`[BatchPush] Business day ${newBusinessDay.id} opened successfully`);
}

/**
 * Close business day
 * Closes an existing business day with calculated totals
 */
async function closeBusinessDay(data: any, branchId: string): Promise<void> {
  console.log('[BatchPush] Closing business day with data:', JSON.stringify(data, null, 2));

  // If the business day has a temporary ID, find the real ID
  let businessDayId = data.id;
  if (data.id && data.id.startsWith('temp-')) {
    // Check if we have a mapping for this temp ID
    const mappedId = tempIdToRealIdMap.get(data.id);
    if (mappedId) {
      businessDayId = mappedId;
      console.log(`[BatchPush] Found mapped real ID ${businessDayId} for temp ID ${data.id}`);
    } else {
      // Try to find the business day by matching criteria
      console.log(`[BatchPush] No mapping found for temp ID ${data.id}, searching for business day...`);

      // First, try to find an open business day for this branch
      let businessDay = await db.businessDay.findFirst({
        where: {
          branchId,
          isOpen: true,
        },
        orderBy: { openedAt: 'desc' },
      });

      if (businessDay) {
        businessDayId = businessDay.id;
        console.log(`[BatchPush] Found open business day ID ${businessDayId} for temp ID ${data.id}`);
        tempIdToRealIdMap.set(data.id, businessDayId);
      } else {
        // Fallback: Find the most recently created business day for this branch (even if closed)
        // Use 24-hour window to handle extended offline periods
        console.log(`[BatchPush] No open business day found, checking most recent business day for branch ${branchId}`);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
        businessDay = await db.businessDay.findFirst({
          where: {
            branchId,
            openedAt: {
              gte: oneDayAgo,
            },
          },
          orderBy: { openedAt: 'desc' },
        });

        if (businessDay) {
          businessDayId = businessDay.id;
          const timeSinceClosed = businessDay.closedAt
            ? Date.now() - new Date(businessDay.closedAt).getTime()
            : 0;
          console.log(`[BatchPush] Found recent business day ID ${businessDayId} for temp ID ${data.id}, will update totals (opened ${businessDay.openedAt.toISOString()}, closed ${businessDay.closedAt?.toISOString() || 'not closed'})`);
          tempIdToRealIdMap.set(data.id, businessDayId);
        } else {
          // Final fallback: find the most recent business day regardless of when it was created
          console.log(`[BatchPush] No recent business day found, checking all business days for branch ${branchId}`);
          businessDay = await db.businessDay.findFirst({
            where: {
              branchId,
            },
            orderBy: { openedAt: 'desc' },
          });

          if (businessDay) {
            businessDayId = businessDay.id;
            console.log(`[BatchPush] Found most recent business day ID ${businessDayId} for temp ID ${data.id} (opened ${businessDay.openedAt.toISOString()})`);
            tempIdToRealIdMap.set(data.id, businessDayId);
          } else {
            throw new Error(`Could not find real business day for temp ID: ${data.id}. No business day found for branch ${branchId}`);
          }
        }
      }
    }
  }

  // Close the business day with provided totals
  await db.businessDay.update({
    where: { id: businessDayId },
    data: {
      closedAt: new Date(data.closedAt || new Date()),
      isOpen: false,
      closedBy: data.closedBy,
      notes: data.notes || null,
      totalOrders: data.totals?.totalOrders || 0,
      totalSales: data.totals?.totalSales || 0,
      subtotal: data.totals?.subtotal || 0,
      taxAmount: data.totals?.taxAmount || 0,
      deliveryFees: data.totals?.deliveryFees || 0,
      loyaltyDiscounts: data.totals?.loyaltyDiscounts || 0,
      cashSales: data.totals?.cashSales || 0,
      cardSales: data.totals?.cardSales || 0,
      dineInOrders: data.totals?.dineInOrders || 0,
      dineInSales: data.totals?.dineInSales || 0,
      takeAwayOrders: data.totals?.takeAwayOrders || 0,
      takeAwaySales: data.totals?.takeAwaySales || 0,
      deliveryOrders: data.totals?.deliveryOrders || 0,
      deliverySales: data.totals?.deliverySales || 0,
    },
  });

  console.log(`[BatchPush] Business day ${businessDayId} closed successfully`);

  // IMPORTANT: Update all shifts that have the old temp business day ID to use the new real ID
  // This fixes the issue where Daily Reports show 0 shifts after syncing offline data
  if (data.id && data.id.startsWith('temp-') && !businessDayId.startsWith('temp-')) {
    console.log(`[BatchPush] Updating shifts with old temp business day ID ${data.id} to new ID ${businessDayId}`);

    const updatedShifts = await db.shift.updateMany({
      where: {
        branchId,
        dayId: data.id, // Old temp business day ID
      },
      data: {
        dayId: businessDayId, // New real business day ID
      },
    });

    console.log(`[BatchPush] Updated ${updatedShifts.count} shifts to use new business day ID`);
  }
}

/**
 * Update user (for local changes like password updates)
 */
async function updateUser(data: any): Promise<void> {
  await db.user.update({
    where: { id: data.id },
    data: {
      username: data.username,
      fullName: data.fullName,
      email: data.email || null,
      role: data.role,
      branchId: data.branchId || null,
      isActive: data.isActive,
      updatedAt: new Date(),
    },
  });
}

/**
 * Create or update a daily expense cost record for a branch
 * This matches the logic in /api/daily-expenses/route.ts
 * NOTE: Inventory expenses are NOT added to costs (they go directly to inventory)
 */
async function createOrUpdateDailyExpenseCost(
  branchId: string,
  amount: number,
  reason: string,
  shiftId: string,
  recordedBy: string,
  category: string
) {
  // Skip cost creation for inventory expenses - they go directly to inventory
  if (category === 'INVENTORY') {
    console.log('[Sync] Skipping cost creation for INVENTORY category expense');
    return null;
  }

  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Get or create "Daily Expenses" cost category for this branch
  let costCategory = await db.costCategory.findFirst({
    where: {
      name: 'Daily Expenses',
      branchId,
    },
  });

  if (!costCategory) {
    costCategory = await db.costCategory.create({
      data: {
        name: 'Daily Expenses',
        description: 'Daily expenses recorded by cashiers',
        icon: 'Wallet',
        sortOrder: 997,
        isActive: true,
        branchId,
      },
    });
  }

  // Check if there's already a Daily Expenses cost for this shift and period
  const existingCost = await db.branchCost.findFirst({
    where: {
      branchId,
      costCategoryId: costCategory.id,
      shiftId,
      period: currentPeriod,
    },
  });

  let branchCost;

  if (existingCost) {
    // Update existing cost: add amount and append notes
    const newAmount = existingCost.amount + amount;

    // Append new notes with timestamp
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const updatedNotes = existingCost.notes
      ? `${existingCost.notes}\n\n---\n${timestamp}: Added ${amount.toFixed(2)} - ${reason}`
      : `Daily expense: ${reason}\n\n---\n${timestamp}: Added ${amount.toFixed(2)} - ${reason}`;

    branchCost = await db.branchCost.update({
      where: { id: existingCost.id },
      data: {
        amount: newAmount,
        notes: updatedNotes,
      },
    });
  } else {
    // Create new cost entry
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    branchCost = await db.branchCost.create({
      data: {
        branchId,
        costCategoryId: costCategory.id,
        shiftId,
        amount: amount,
        period: currentPeriod,
        notes: `Daily expense: ${reason}\n\n---\n${timestamp}: Added ${amount.toFixed(2)} - ${reason}`,
      },
    });
  }

  return branchCost;
}

async function createDailyExpense(data: any, branchId: string): Promise<void> {
  console.log('[Sync] Creating daily expense:', data);

  // Handle shiftId - check if it's a temp ID and map to real ID
  let shiftId = data.shiftId || null;
  if (shiftId && shiftId.startsWith('temp-')) {
    const realShiftId = tempIdToRealIdMap.get(shiftId);
    if (realShiftId) {
      shiftId = realShiftId;
      console.log(`[Sync] Mapped temp shift ID ${data.shiftId} to real ID ${realShiftId} for daily expense`);
    } else {
      console.error(`[Sync] ERROR: Temp shift ID ${shiftId} not mapped for daily expense`);
      console.log(`[Sync] Available mappings:`, Array.from(tempIdToRealIdMap.entries()));
      throw new Error(`Shift ID ${shiftId} not found. Cannot create daily expense.`);
    }
  }

  // Handle inventory expense - update stock with weighted average price
  let inventoryUpdate = null;
  if (data.category === 'INVENTORY' && data.ingredientId && data.quantity) {
    // Check if inventory was already updated offline
    const inventoryAlreadyUpdated = data._offlineData?.inventoryAlreadyUpdated;

    if (inventoryAlreadyUpdated && data._offlineData?.finalStock !== undefined && data._offlineData?.finalPrice !== undefined) {
      // Inventory was updated offline - sync the final state to database
      console.log('[Sync] Inventory already updated offline, syncing final state to database');
      console.log('[Sync] Final offline state:', {
        finalStock: data._offlineData.finalStock,
        finalPrice: data._offlineData.finalPrice,
        oldStock: data._offlineData.oldStock,
      });

      // Find or create branch inventory record
      let branchInventory = await db.branchInventory.findUnique({
        where: {
          branchId_ingredientId: {
            branchId,
            ingredientId: data.ingredientId,
          },
        },
      });

      const oldStock = data._offlineData.oldStock || 0;
      const finalStock = data._offlineData.finalStock;
      const finalPrice = data._offlineData.finalPrice;

      if (!branchInventory) {
        console.log('[Sync] Creating new branch inventory record from offline state');
        branchInventory = await db.branchInventory.create({
          data: {
            branchId,
            ingredientId: data.ingredientId,
            currentStock: finalStock,
            reservedStock: 0,
            lastRestockAt: new Date(),
            lastModifiedAt: new Date(),
            lastModifiedBy: data.recordedBy,
          },
        });
      } else {
        // Update database inventory to match the final offline state
        console.log('[Sync] Updating database inventory to match offline state:', {
          oldDatabaseStock: branchInventory.currentStock,
          finalOfflineStock: finalStock,
        });

        branchInventory = await db.branchInventory.update({
          where: { id: branchInventory.id },
          data: {
            currentStock: finalStock,
            lastRestockAt: new Date(),
            lastModifiedAt: new Date(),
            lastModifiedBy: data.recordedBy,
          },
        });
      }

      // Update ingredient's cost per unit to match the final offline price
      await db.ingredient.update({
        where: { id: data.ingredientId },
        data: {
          costPerUnit: finalPrice,
          updatedAt: new Date(),
        },
      });

      // Create inventory transaction record for audit trail
      const inventoryTxn = await db.inventoryTransaction.create({
        data: {
          branchId,
          ingredientId: data.ingredientId,
          transactionType: 'RESTOCK',
          quantityChange: data.quantity,
          stockBefore: oldStock,
          stockAfter: finalStock,
          reason: `Inventory expense restock (synced from offline). Offline price: ${finalPrice.toFixed(2)}`,
          createdBy: data.recordedBy,
        },
      });

      inventoryUpdate = {
        newStock: finalStock,
        newPrice: finalPrice,
        oldPrice: oldStock > 0 ? (oldStock * finalPrice - data.quantity * data.unitPrice) / oldStock : data.unitPrice,
        transactionId: inventoryTxn.id,
        syncedFromOffline: true,
      };

      console.log('[Sync] Inventory synced from offline successfully:', inventoryUpdate);
    } else {
      // Normal online inventory expense
      console.log('[Sync] Handling inventory expense for ingredient:', data.ingredientId);
      console.log('[Sync] _offlineData:', data._offlineData);
      console.log('[Sync] inventoryAlreadyUpdated:', data._offlineData?.inventoryAlreadyUpdated);

      // CRITICAL FIX: Check if we have finalStock even when inventoryAlreadyUpdated is false
      // This handles the case where the flag was not properly set but we still have the offline final state
      const shouldUseOfflineFinalState =
        data._offlineData?.finalStock !== undefined &&
        data._offlineData?.finalPrice !== undefined &&
        data._offlineData?.oldStock !== undefined;

      if (shouldUseOfflineFinalState) {
        console.log('[Sync] Found offline final state, using it even though inventoryAlreadyUpdated flag may be false');
        console.log('[Sync] Offline final state:', {
          finalStock: data._offlineData.finalStock,
          finalPrice: data._offlineData.finalPrice,
          oldStock: data._offlineData.oldStock,
        });

        const finalStock = data._offlineData.finalStock;
        const finalPrice = data._offlineData.finalPrice;
        const oldStock = data._offlineData.oldStock;

        // Find or create branch inventory record
        let branchInventory = await db.branchInventory.findUnique({
          where: {
            branchId_ingredientId: {
              branchId,
              ingredientId: data.ingredientId,
            },
          },
        });

        if (!branchInventory) {
          console.log('[Sync] Creating new branch inventory record from offline final state');
          branchInventory = await db.branchInventory.create({
            data: {
              branchId,
              ingredientId: data.ingredientId,
              currentStock: finalStock,
              reservedStock: 0,
              lastRestockAt: new Date(),
              lastModifiedAt: new Date(),
              lastModifiedBy: data.recordedBy,
            },
          });
        } else {
          console.log('[Sync] Updating existing branch inventory to match offline final state:', {
            oldDatabaseStock: branchInventory.currentStock,
            finalOfflineStock: finalStock,
          });
          branchInventory = await db.branchInventory.update({
            where: { id: branchInventory.id },
            data: {
              currentStock: finalStock,
              lastRestockAt: new Date(),
              lastModifiedAt: new Date(),
              lastModifiedBy: data.recordedBy,
            },
          });
        }

        // Update ingredient's cost per unit to match the final offline price
        await db.ingredient.update({
          where: { id: data.ingredientId },
          data: {
            costPerUnit: finalPrice,
            updatedAt: new Date(),
          },
        });

        // Create inventory transaction record for audit trail
        const inventoryTxn = await db.inventoryTransaction.create({
          data: {
            branchId,
            ingredientId: data.ingredientId,
            transactionType: 'RESTOCK',
            quantityChange: data.quantity,
            stockBefore: oldStock,
            stockAfter: finalStock,
            reason: `Inventory expense restock (synced from offline). Offline price: ${finalPrice.toFixed(2)}`,
            createdBy: data.recordedBy,
          },
        });

        inventoryUpdate = {
          newStock: finalStock,
          newPrice: finalPrice,
          oldPrice: oldStock > 0 ? (oldStock * finalPrice - data.quantity * data.unitPrice) / oldStock : data.unitPrice,
          transactionId: inventoryTxn.id,
          syncedFromOffline: true,
        };

        console.log('[Sync] Inventory synced from offline final state successfully:', inventoryUpdate);
      } else {
        // Find or create branch inventory record
        let branchInventory = await db.branchInventory.findUnique({
          where: {
            branchId_ingredientId: {
              branchId,
              ingredientId: data.ingredientId,
            },
          },
        });

        if (!branchInventory) {
          console.log('[Sync] Creating new branch inventory record');
          branchInventory = await db.branchInventory.create({
            data: {
              branchId,
              ingredientId: data.ingredientId,
              currentStock: data.quantity,
              reservedStock: 0,
              lastRestockAt: new Date(),
              lastModifiedAt: new Date(),
              lastModifiedBy: data.recordedBy,
            },
          });
        }

        const oldStock = branchInventory.currentStock;
        const oldPrice = branchInventory.currentStock > 0
          ? (await db.ingredient.findUnique({ where: { id: data.ingredientId } }))?.costPerUnit || 0
          : data.unitPrice;

        // Calculate new stock
        const newStock = oldStock + data.quantity;

        // Calculate weighted average price: (old_total + new_total) / (old_quantity + new_quantity)
        const oldTotalValue = oldStock * oldPrice;
        const newTotalValue = data.quantity * data.unitPrice;
        const weightedAveragePrice = (oldTotalValue + newTotalValue) / newStock;

        console.log('[Sync] Inventory expense price calculation:', {
          oldStock,
          oldPrice,
          oldTotalValue,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          newTotalValue,
          newStock,
          weightedAveragePrice,
        });

        // Update branch inventory
        branchInventory = await db.branchInventory.update({
          where: { id: branchInventory.id },
          data: {
            currentStock: newStock,
            lastRestockAt: new Date(),
            lastModifiedAt: new Date(),
            lastModifiedBy: data.recordedBy,
          },
        });

        // Update ingredient's base cost per unit (weighted average)
        await db.ingredient.update({
          where: { id: data.ingredientId },
          data: {
            costPerUnit: weightedAveragePrice,
            updatedAt: new Date(),
          },
        });

        // Create inventory transaction record
        const inventoryTxn = await db.inventoryTransaction.create({
          data: {
            branchId,
            ingredientId: data.ingredientId,
            transactionType: 'RESTOCK',
            quantityChange: data.quantity,
            stockBefore: oldStock,
            stockAfter: newStock,
            reason: `Inventory expense restock from offline. Previous price: ${oldPrice.toFixed(2)}, New price: ${weightedAveragePrice.toFixed(2)}`,
            createdBy: data.recordedBy,
          },
        });

        inventoryUpdate = {
          newStock,
          newPrice: weightedAveragePrice,
          oldPrice,
          transactionId: inventoryTxn.id,
        };

        console.log('[Sync] Inventory updated successfully for offline expense:', inventoryUpdate);
      }
    }
  }

  // Create the daily expense record
  const expense = await db.dailyExpense.create({
    data: {
      id: data.id,
      branchId,
      shiftId: shiftId,
      amount: data.amount,
      reason: data.reason,
      recordedBy: data.recordedBy,
      category: data.category || 'OTHER',
      ingredientId: data.ingredientId || null,
      quantity: data.quantity || null,
      quantityUnit: data.quantityUnit || null,
      unitPrice: data.unitPrice || null,
      createdAt: new Date(data.createdAt),
    },
  });

  console.log('[Sync] Daily expense created:', expense.id);

  // Create corresponding BranchCost record for reporting in Branch Operation
  // Only for non-inventory expenses (inventory expenses don't go to costs)
  if (data.category !== 'INVENTORY') {
    try {
      const branchCost = await createOrUpdateDailyExpenseCost(
        branchId,
        data.amount,
        data.reason,
        shiftId,
        data.recordedBy,
        data.category || 'OTHER'
      );

      // Update the expense with the costId
      await db.dailyExpense.update({
        where: { id: expense.id },
        data: { costId: branchCost.id },
      });

      console.log('[Sync] BranchCost created/updated for daily expense:', branchCost.id);
    } catch (costError: any) {
      console.error('[Sync] Failed to create BranchCost for daily expense:', costError);
      // Don't fail the expense creation if cost creation fails
      // Expense is still created and will appear in shift reports
    }
  } else {
    console.log('[Sync] Skipping cost creation for INVENTORY expense');
  }
}

/**
 * Create voided item
 */
async function createVoidedItem(data: any, branchId: string): Promise<void> {
  await db.voidedItem.create({
    data: {
      id: data.id,
      orderItemId: data.orderItemId,
      orderQuantity: data.orderQuantity,
      voidedQuantity: data.voidedQuantity,
      remainingQuantity: data.remainingQuantity,
      unitPrice: data.unitPrice,
      voidedSubtotal: data.voidedSubtotal,
      reason: data.reason,
      voidedBy: data.voidedBy,
      voidedAt: new Date(data.voidedAt),
      createdAt: new Date(data.createdAt),
    },
  });
}

/**
 * Create promo code
 */
async function createPromoCode(data: any, branchId: string): Promise<void> {
  // Check if promo code already exists
  const existing = await db.promotionCode.findUnique({
    where: { code: data.code }
  });

  if (existing) {
    console.log(`[BatchPush] Promo code ${data.code} already exists, skipping`);
    return;
  }

  await db.promotionCode.create({
    data: {
      id: data.id,
      promotionId: data.promotionId,
      code: data.code,
      isActive: data.isActive,
      usageCount: data.usageCount || 0,
      maxUses: data.maxUses || null,
      isSingleUse: data.isSingleUse || false,
      campaignName: data.campaignName || null,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    },
  });
}

/**
 * Use promo code (increment usage count)
 */
async function handleUsePromoCode(data: any, branchId: string): Promise<void> {
  await db.promotionCode.update({
    where: { code: data.code },
    data: {
      usageCount: {
        increment: 1,
      },
      updatedAt: new Date(),
    },
  });
}

/**
 * Create loyalty transaction with validation
 * Note: Uses Prisma's atomic transactions automatically
 */
async function createLoyaltyTransaction(data: any): Promise<void> {
  console.log('[BatchPush] Creating loyalty transaction with data:', JSON.stringify(data, null, 2));

  // Phase 1: Validation
  console.log('[BatchPush] Phase 1: Validation');
  
  // Check if transaction already exists (idempotency check at operation level)
  const existingTransaction = await db.loyaltyTransaction.findFirst({
    where: { id: data.id }
  });

  if (existingTransaction) {
    console.log(`[BatchPush] Loyalty transaction ${data.id} already exists, skipping`);
    return;
  }

  // Phase 2: Create transaction
  console.log('[BatchPush] Phase 2: Creating transaction');
  
  await db.loyaltyTransaction.create({
    data: {
      id: data.id,
      customerId: data.customerId,
      points: data.points,
      type: data.type,
      orderId: data.orderId || null,
      amount: data.amount || null,
      notes: data.notes || null,
      createdAt: new Date(data.createdAt),
    },
  });

  console.log('[BatchPush] Loyalty transaction created successfully:', data.id);
}

/**
 * Create table
 */
async function createTable(data: any, branchId: string): Promise<void> {
  await db.table.create({
    data: {
      id: data.id,
      branchId,
      tableNumber: data.tableNumber,
      status: data.status || 'AVAILABLE',
      customerId: data.customerId || null,
      capacity: data.capacity || null,
      openedAt: data.openedAt ? new Date(data.openedAt) : null,
      closedAt: data.closedAt ? new Date(data.closedAt) : null,
      openedBy: data.openedBy || null,
      closedBy: data.closedBy || null,
      notes: data.notes || null,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    },
  });
}

/**
 * Update table
 */
/**
 * Safe date parser - validates date string before creating Date object
 * Returns current timestamp if date string is invalid
 */
function safeParseDate(dateString: string | Date | null | undefined): Date {
  if (!dateString) {
    return new Date();
  }

  if (dateString instanceof Date) {
    // Check if the Date object is valid
    if (isNaN(dateString.getTime())) {
      console.warn('[safeParseDate] Invalid Date object provided, using current timestamp');
      return new Date();
    }
    return dateString;
  }

  // Try to parse the date string
  const parsedDate = new Date(dateString);
  if (isNaN(parsedDate.getTime())) {
    console.warn(`[safeParseDate] Invalid date string provided: "${dateString}", using current timestamp`);
    return new Date();
  }

  return parsedDate;
}

/**
 * Update table
 */
async function updateTable(data: any, branchId: string): Promise<void> {
  await db.table.update({
    where: { id: data.id },
    data: {
      status: data.status,
      customerId: data.customerId || null,
      openedAt: data.openedAt ? safeParseDate(data.openedAt) : null,
      closedAt: data.closedAt ? safeParseDate(data.closedAt) : null,
      openedBy: data.openedBy || null,
      closedBy: data.closedBy || null,
      notes: data.notes || null,
      updatedAt: safeParseDate(data.updatedAt),
    },
  });
}

/**
 * Close table
 */
async function closeTable(data: any, branchId: string): Promise<void> {
  await db.table.update({
    where: { id: data.id },
    data: {
      status: 'AVAILABLE',
      closedAt: new Date(data.closedAt || Date.now()),
      closedBy: data.closedBy,
      updatedAt: new Date(),
    },
  });
}

/**
 * Create inventory transaction
 */
async function createInventoryTransaction(data: any, branchId: string): Promise<void> {
  await db.inventoryTransaction.create({
    data: {
      id: data.id,
      branchId,
      ingredientId: data.ingredientId,
      transactionType: data.transactionType,
      quantityChange: data.quantityChange,
      stockBefore: data.stockBefore,
      stockAfter: data.stockAfter,
      orderId: data.orderId || null,
      reason: data.reason || null,
      createdBy: data.createdBy,
      createdAt: new Date(data.createdAt),
    },
  });
}

/**
 * Update customer
 */
async function updateCustomer(data: any, branchId: string): Promise<void> {
  // Get existing customer for conflict detection
  const existingCustomer = await db.customer.findUnique({
    where: { id: data.id },
  });

  if (existingCustomer) {
    // Check for conflicts
    const conflict = await conflictManager.detectConflict(
      'Customer',
      data.id,
      data,
      existingCustomer,
      'UPDATE_CUSTOMER'
    );

    if (conflict) {
      // Auto-resolve using default strategy (LAST_WRITE_WINS for updates)
      const resolved = await conflictManager.resolveConflict(
        conflict.id,
        ResolutionStrategy.LAST_WRITE_WINS,
        'auto-resolver'
      );

      console.log(`[BatchPush] Resolved conflict for customer ${data.id} using LAST_WRITE_WINS`);

      // Use resolved data for the update
      if (resolved.resolvedData) {
        data = { ...data, ...resolved.resolvedData };
      }
    }
  }

  await db.customer.update({
    where: { id: data.id },
    data: {
      name: data.name,
      email: data.email || null,
      phone: data.phone,
      notes: data.notes || null,
      updatedAt: new Date(),
    },
  });

  // Update addresses if provided
  if (data.addresses && Array.isArray(data.addresses)) {
    for (const addr of data.addresses) {
      if (addr.id) {
        // Update existing address
        await db.customerAddress.update({
          where: { id: addr.id },
          data: {
            building: addr.building || null,
            streetAddress: addr.streetAddress,
            floor: addr.floor || null,
            apartment: addr.apartment || null,
            deliveryAreaId: addr.deliveryAreaId || null,
            isDefault: addr.isDefault || false,
          },
        });
      } else {
        // Create new address
        await db.customerAddress.create({
          data: {
            customerId: data.id,
            building: addr.building || null,
            streetAddress: addr.streetAddress,
            floor: addr.floor || null,
            apartment: addr.apartment || null,
            deliveryAreaId: addr.deliveryAreaId || null,
            isDefault: addr.isDefault || false,
          },
        });
      }
    }
  }
}

/**
 * Create ingredient
 */
async function createIngredient(data: any, branchId: string): Promise<void> {
  // Check if ingredient already exists by name
  const existingIngredient = await db.ingredient.findFirst({
    where: {
      name: data.name,
    },
  });

  let ingredientId: string;

  if (existingIngredient) {
    // Ingredient exists, use their ID
    ingredientId = existingIngredient.id;
    console.log(`[BatchPush] Ingredient with name ${data.name} already exists: ${ingredientId}`);

    // Update branch inventory if provided
    if (data.initialStock !== undefined && branchId) {
      const existingInventory = await db.branchInventory.findFirst({
        where: {
          branchId,
          ingredientId,
        },
      });

      if (existingInventory) {
        await db.branchInventory.update({
          where: { id: existingInventory.id },
          data: {
            currentStock: parseFloat(data.initialStock),
            lastRestockAt: new Date(),
            lastModifiedAt: new Date(),
          },
        });
      } else {
        await db.branchInventory.create({
          data: {
            branchId,
            ingredientId,
            currentStock: parseFloat(data.initialStock),
            lastRestockAt: new Date(),
            lastModifiedAt: new Date(),
          },
        });
      }
    }
  } else {
    // Create new ingredient
    const ingredientData: any = {
      name: data.name,
      unit: data.unit,
      costPerUnit: parseFloat(data.costPerUnit),
      reorderThreshold: parseFloat(data.reorderThreshold),
      isActive: data.isActive !== undefined ? data.isActive : true,
      categoryId: data.categoryId || null,
    };

    // Only use provided ID if it's not a temporary ID
    if (data.id && !data.id.startsWith('temp-')) {
      ingredientData.id = data.id;
    }

    const createdIngredient = await db.ingredient.create({
      data: ingredientData,
    });

    ingredientId = createdIngredient.id;
    console.log('[BatchPush] Ingredient created successfully:', createdIngredient);

    // Handle initial stock for branch inventory
    if (data.initialStock !== undefined && branchId) {
      const stockValue = parseFloat(data.initialStock);

      await db.branchInventory.create({
        data: {
          branchId,
          ingredientId,
          currentStock: stockValue,
          lastRestockAt: new Date(),
          lastModifiedAt: new Date(),
        },
      });
    }
  }

  // Map temp ID to real ID for future operations
  if (data.id && data.id.startsWith('temp-')) {
    tempIdToRealIdMap.set(data.id, ingredientId);
    console.log(`[BatchPush] Mapped temp ingredient ID ${data.id} to real ID ${ingredientId}`);
  }
}

/**
 * Update ingredient
 */
async function updateIngredient(data: any, branchId: string): Promise<void> {
  await db.ingredient.update({
    where: { id: data.id },
    data: {
      name: data.name,
      unit: data.unit,
      costPerUnit: parseFloat(data.costPerUnit),
      reorderThreshold: parseFloat(data.reorderThreshold),
      categoryId: data.categoryId || null,
      updatedAt: new Date(),
    },
  });
}

/**
 * Create menu item
 */
async function createMenuItem(data: any, branchId: string): Promise<void> {
  // Check if menu item already exists by name
  const existingItem = await db.menuItem.findFirst({
    where: {
      name: data.name,
    },
  });

  let menuItemId: string;

  if (existingItem) {
    // Menu item exists, use their ID
    menuItemId = existingItem.id;
    console.log(`[BatchPush] Menu item with name ${data.name} already exists: ${menuItemId}`);
  } else {
    // Create new menu item
    const menuItemData: any = {
      name: data.name,
      category: data.category || 'Other',
      categoryId: data.categoryId || null,
      price: parseFloat(data.price),
      taxRate: data.taxRate !== undefined ? parseFloat(data.taxRate) : 0.14,
      isActive: data.isActive !== undefined ? data.isActive : true,
      sortOrder: data.sortOrder !== undefined ? parseInt(data.sortOrder) : null,
      hasVariants: data.hasVariants || false,
    };

    // Only use provided ID if it's not a temporary ID
    if (data.id && !data.id.startsWith('temp-')) {
      menuItemData.id = data.id;
    }

    const createdMenuItem = await db.menuItem.create({
      data: menuItemData,
    });

    menuItemId = createdMenuItem.id;
    console.log('[BatchPush] Menu item created successfully:', createdMenuItem);
  }

  // Map temp ID to real ID for future operations
  if (data.id && data.id.startsWith('temp-')) {
    tempIdToRealIdMap.set(data.id, menuItemId);
    console.log(`[BatchPush] Mapped temp menu item ID ${data.id} to real ID ${menuItemId}`);
  }
}

/**
 * Update menu item
 */
async function updateMenuItem(data: any, branchId: string): Promise<void> {
  await db.menuItem.update({
    where: { id: data.id },
    data: {
      name: data.name,
      category: data.category,
      categoryId: data.categoryId || null,
      price: parseFloat(data.price),
      taxRate: data.taxRate !== undefined ? parseFloat(data.taxRate) : 0.14,
      isActive: data.isActive !== undefined ? data.isActive : true,
      sortOrder: data.sortOrder !== undefined ? parseInt(data.sortOrder) : null,
      hasVariants: data.hasVariants || false,
      updatedAt: new Date(),
    },
  });
}

/**
 * Create transfer
 */
async function createTransfer(data: any, branchId: string): Promise<void> {
  // Handle fromBranchId and toBranchId - check if they're temp IDs
  let fromBranchId = data.fromBranchId;
  let toBranchId = data.toBranchId;

  if (fromBranchId && fromBranchId.startsWith('temp-')) {
    const realId = tempIdToRealIdMap.get(fromBranchId);
    if (realId) {
      fromBranchId = realId;
    }
  }

  if (toBranchId && toBranchId.startsWith('temp-')) {
    const realId = tempIdToRealIdMap.get(toBranchId);
    if (realId) {
      toBranchId = realId;
    }
  }

  await db.transfer.create({
    data: {
      id: data.id,
      fromBranchId,
      toBranchId,
      ingredientId: data.ingredientId,
      quantity: parseFloat(data.quantity),
      requestedBy: data.requestedBy,
      approvedBy: data.approvedBy || null,
      status: data.status || 'PENDING',
      requestedAt: new Date(data.requestedAt || data.createdAt),
      approvedAt: data.approvedAt ? new Date(data.approvedAt) : null,
      notes: data.notes || null,
      createdAt: new Date(data.createdAt),
    },
  });
}

/**
 * Create purchase order
 */
async function createPurchaseOrder(data: any, branchId: string): Promise<void> {
  // Handle supplierId - check if it's a temp ID
  let supplierId = data.supplierId;
  if (supplierId && supplierId.startsWith('temp-')) {
    const realId = tempIdToRealIdMap.get(supplierId);
    if (realId) {
      supplierId = realId;
    }
  }

  const purchaseOrderData: any = {
    id: data.id,
    branchId,
    supplierId: supplierId || null,
    orderNumber: data.orderNumber,
    status: data.status || 'PENDING',
    totalAmount: data.totalAmount ? parseFloat(data.totalAmount) : 0,
    expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : null,
    notes: data.notes || null,
    createdAt: new Date(data.createdAt),
  };

  const purchaseOrder = await db.purchaseOrder.create({
    data: purchaseOrderData,
  });

  // Create purchase order items if provided
  if (data.items && Array.isArray(data.items)) {
    await db.purchaseOrderItem.createMany({
      data: data.items.map((item: any) => ({
        purchaseOrderId: purchaseOrder.id,
        ingredientId: item.ingredientId,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        receivedQuantity: item.receivedQuantity ? parseFloat(item.receivedQuantity) : 0,
      })),
    });
  }
}

/**
 * Update purchase order
 */
async function updatePurchaseOrder(data: any, branchId: string): Promise<void> {
  await db.purchaseOrder.update({
    where: { id: data.id },
    data: {
      status: data.status,
      totalAmount: data.totalAmount ? parseFloat(data.totalAmount) : undefined,
      expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : undefined,
      actualDeliveryDate: data.actualDeliveryDate ? new Date(data.actualDeliveryDate) : undefined,
      notes: data.notes || undefined,
      updatedAt: new Date(),
    },
  });
}

/**
 * Create receipt settings
 */
async function createReceiptSettings(data: any): Promise<void> {
  await db.receiptSettings.create({
    data: {
      id: data.id || undefined,
      storeName: data.storeName,
      branchName: data.branchName,
      headerText: data.headerText || null,
      footerText: data.footerText || null,
      thankYouMessage: data.thankYouMessage || null,
      fontSize: data.fontSize || 'medium',
      showLogo: data.showLogo || false,
      showCashier: data.showCashier || false,
      showDateTime: data.showDateTime || false,
      showOrderType: data.showOrderType || false,
      showCustomerInfo: data.showCustomerInfo || false,
      openCashDrawer: data.openCashDrawer || false,
      cutPaper: data.cutPaper || false,
      cutType: data.cutType || 'full',
      paperWidth: data.paperWidth || 80,
    },
  });
}

/**
 * Update receipt settings
 */
async function updateReceiptSettings(data: any): Promise<void> {
  await db.receiptSettings.update({
    where: { id: data.id },
    data: {
      storeName: data.storeName,
      branchName: data.branchName,
      headerText: data.headerText || null,
      footerText: data.footerText || null,
      thankYouMessage: data.thankYouMessage || null,
      fontSize: data.fontSize || 'medium',
      showLogo: data.showLogo || false,
      showCashier: data.showCashier || false,
      showDateTime: data.showDateTime || false,
      showOrderType: data.showOrderType || false,
      showCustomerInfo: data.showCustomerInfo || false,
      openCashDrawer: data.openCashDrawer || false,
      cutPaper: data.cutPaper || false,
      cutType: data.cutType || 'full',
      paperWidth: data.paperWidth || 80,
      updatedAt: new Date(),
    },
  });
}

