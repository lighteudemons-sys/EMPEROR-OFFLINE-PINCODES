/**
 * Data Recovery Tool for Lost Offline Orders
 * 
 * This tool helps recover orders that exist in IndexedDB but are not queued for sync.
 * This can happen when:
 * - Sync was interrupted during network failure
 * - Browser was refreshed during sync
 * - Sync operations queue was cleared
 * 
 * INSTRUCTIONS FOR USE IN BROWSER CONSOLE:
 * 1. Open browser console (F12)
 * 2. Paste the following code:
 * 
 *    (async () => {
 *      const storage = window.indexedDBStorage || (await import('/src/lib/storage/indexeddb-storage.js')).getIndexedDBStorage();
 *      await storage.init();
 *      
 *      // Get all orders
 *      const allOrders = await storage.getAll('orders');
 *      console.log('Total orders:', allOrders.length);
 *      
 *      // Get sync operations
 *      const syncOps = await storage.getAll('sync_operations');
 *      console.log('Sync operations:', syncOps.length);
 *      
 *      // Find temp orders not in sync queue
 *      const syncedOrderIds = new Set(syncOps
 *        .filter(op => op.data.id)
 *        .map(op => op.data.id));
 *      
 *      const unsyncedOrders = allOrders.filter(order => 
 *        order.id?.startsWith('temp-order-') && !syncedOrderIds.has(order.id)
 *      );
 *      
 *      console.log('Unsynced orders:', unsyncedOrders.length);
 *      
 *      // Re-queue each order
 *      for (const order of unsyncedOrders) {
 *        console.log('Recovering order #', order.orderNumber);
 *        await storage.addOperation({
 *          type: 'CREATE_ORDER',
 *          data: order,
 *          branchId: order.branchId,
 *        });
 *      }
 *      
 *      console.log('Recovery complete! Orders re-queued:', unsyncedOrders.length);
 *    })();
 */

import { getIndexedDBStorage, OperationType } from '../storage/indexeddb-storage';

const storage = getIndexedDBStorage();

/**
 * Recover lost orders from IndexedDB and re-queue them for sync
 */
export async function recoverLostOrders(): Promise<{
  recoveredOrders: number;
  recoveredShifts: number;
  recoveredOperations: number;
  errors: string[];
  details: any[];
}> {
  const result = {
    recoveredOrders: 0,
    recoveredShifts: 0,
    recoveredOperations: 0,
    errors: [] as string[],
    details: [] as any[],
  };

  console.log('=== ORDER RECOVERY TOOL STARTED ===');
  console.log('This tool will scan IndexedDB and re-queue unsynced data...');

  try {
    // Initialize IndexedDB
    await storage.init();
    console.log('✓ IndexedDB initialized');

    // Get all orders from IndexedDB
    const allOrders = await storage.getAll('orders');
    console.log(`Found ${allOrders.length} orders in IndexedDB`);

    // Get all sync operations
    const syncOps = await storage.getAll('sync_operations');
    console.log(`Found ${syncOps.length} sync operations in queue`);

    // Create a set of order IDs that are already in the sync queue
    const syncedOrderIds = new Set(
      syncOps
        .filter(op => op.type === OperationType.CREATE_ORDER || op.type === OperationType.UPDATE_ORDER)
        .map(op => op.data.id || op.data.orderId)
    );
    console.log(`Orders already in sync queue: ${syncedOrderIds.size}`);

    // Find unsynced orders (temp orders that aren't in sync queue)
    const unsyncedOrders = allOrders.filter(order => {
      // Check if it's a temporary order
      const isTempOrder = order.id && order.id.startsWith('temp-order-');
      // Check if it's NOT already in sync queue
      const notInQueue = !syncedOrderIds.has(order.id);
      return isTempOrder && notInQueue;
    });

    console.log(`Found ${unsyncedOrders.length} unsynced temporary orders`);

    // Re-queue each unsynced order
    for (const order of unsyncedOrders) {
      try {
        console.log(`Recovering order #${order.orderNumber} (${order.id})`);

        // Create sync operation for this order
        await storage.addOperation({
          type: OperationType.CREATE_ORDER,
          data: {
            ...order,
            _recovered: true, // Mark as recovered
            _recoveryTimestamp: new Date().toISOString(),
          },
          branchId: order.branchId,
        });

        result.recoveredOrders++;
        result.recoveredOperations++;
        result.details.push({
          type: 'ORDER',
          orderId: order.id,
          orderNumber: order.orderNumber,
          amount: order.totalAmount,
          timestamp: order.orderTimestamp || order.createdAt,
        });

        console.log(`✓ Order #${order.orderNumber} re-queued for sync`);
      } catch (error) {
        const errorMsg = `Failed to recover order #${order.orderNumber}: ${error}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    // Also recover closed shifts that might not be in sync queue
    const allShifts = await storage.getAll('shifts');
    const syncedShiftIds = new Set(
      syncOps
        .filter(op => op.type === OperationType.CLOSE_SHIFT)
        .map(op => op.data.id || op.data.shiftId)
    );

    const unsyncedShifts = allShifts.filter(shift => {
      const isClosed = shift.isClosed === true;
      const notInQueue = !syncedShiftIds.has(shift.id);
      return isClosed && notInQueue;
    });

    console.log(`Found ${unsyncedShifts.length} unsynced closed shifts`);

    for (const shift of unsyncedShifts) {
      try {
        console.log(`Recovering shift ${shift.id} (started: ${shift.startTime})`);

        await storage.addOperation({
          type: OperationType.CLOSE_SHIFT,
          data: {
            ...shift,
            _recovered: true,
            _recoveryTimestamp: new Date().toISOString(),
          },
          branchId: shift.branchId,
        });

        result.recoveredShifts++;
        result.recoveredOperations++;
        result.details.push({
          type: 'SHIFT',
          shiftId: shift.id,
          startTime: shift.startTime,
          endTime: shift.endTime,
          isClosed: shift.isClosed,
        });

        console.log(`✓ Shift ${shift.id} re-queued for sync`);
      } catch (error) {
        const errorMsg = `Failed to recover shift ${shift.id}: ${error}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    // Update sync state
    const pendingCount = await storage.getPendingOperationsCount();
    await storage.updateSyncState({
      pendingOperations: pendingCount,
    });

    console.log('=== RECOVERY COMPLETE ===');
    console.log(`Summary:`);
    console.log(`  - Orders recovered: ${result.recoveredOrders}`);
    console.log(`  - Shifts recovered: ${result.recoveredShifts}`);
    console.log(`  - Total operations queued: ${result.recoveredOperations}`);
    console.log(`  - Errors: ${result.errors.length}`);
    console.log(`  - Pending sync operations: ${pendingCount}`);
    console.log('================================');

    if (result.errors.length > 0) {
      console.error('Errors occurred during recovery:');
      result.errors.forEach(err => console.error(`  - ${err}`));
    }

    return result;
  } catch (error) {
    const errorMsg = `Recovery failed: ${error}`;
    console.error(errorMsg);
    result.errors.push(errorMsg);
    throw error;
  }
}

/**
 * Get diagnostic information about IndexedDB state
 */
export async function getRecoveryDiagnostics(): Promise<{
  ordersCount: number;
  tempOrdersCount: number;
  syncOperationsCount: number;
  shiftsCount: number;
  closedShiftsCount: number;
  unsyncedOrders: any[];
  unsyncedShifts: any[];
}> {
  console.log('=== RECOVERY DIAGNOSTICS ===');

  await storage.init();

  const allOrders = await storage.getAll('orders');
  const tempOrders = allOrders.filter(order => order.id && order.id.startsWith('temp-order-'));
  
  const syncOps = await storage.getAll('sync_operations');
  
  const allShifts = await storage.getAll('shifts');
  const closedShifts = allShifts.filter(shift => shift.isClosed === true);

  const syncedOrderIds = new Set(
    syncOps
      .filter(op => op.type === OperationType.CREATE_ORDER || op.type === OperationType.UPDATE_ORDER)
      .map(op => op.data.id || op.data.orderId)
  );

  const unsyncedOrders = tempOrders.filter(order => !syncedOrderIds.has(order.id));

  const syncedShiftIds = new Set(
    syncOps
      .filter(op => op.type === OperationType.CLOSE_SHIFT)
      .map(op => op.data.id || op.data.shiftId)
  );

  const unsyncedShifts = closedShifts.filter(shift => !syncedShiftIds.has(shift.id));

  const diagnostics = {
    ordersCount: allOrders.length,
    tempOrdersCount: tempOrders.length,
    syncOperationsCount: syncOps.length,
    shiftsCount: allShifts.length,
    closedShiftsCount: closedShifts.length,
    unsyncedOrders: unsyncedOrders,
    unsyncedShifts: unsyncedShifts,
  };

  console.log('Diagnostics:');
  console.log(`  Total orders: ${diagnostics.ordersCount}`);
  console.log(`  Temporary orders: ${diagnostics.tempOrdersCount}`);
  console.log(`  Sync operations: ${diagnostics.syncOperationsCount}`);
  console.log(`  Total shifts: ${diagnostics.shiftsCount}`);
  console.log(`  Closed shifts: ${diagnostics.closedShiftsCount}`);
  console.log(`  Unsynced orders: ${diagnostics.unsyncedOrders.length}`);
  console.log(`  Unsynced shifts: ${diagnostics.unsyncedShifts.length}`);
  console.log('==========================');

  if (diagnostics.unsyncedOrders.length > 0) {
    console.log('Unsynced orders:');
    diagnostics.unsyncedOrders.forEach(order => {
      console.log(`  - Order #${order.orderNumber} (${order.id}) - ${order.totalAmount} EGP`);
    });
  }

  if (diagnostics.unsyncedShifts.length > 0) {
    console.log('Unsynced shifts:');
    diagnostics.unsyncedShifts.forEach(shift => {
      console.log(`  - Shift ${shift.id} - ${shift.startTime} to ${shift.endTime || 'not closed'}`);
    });
  }

  return diagnostics;
}
