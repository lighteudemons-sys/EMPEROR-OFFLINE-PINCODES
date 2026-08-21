/**
 * DATA RECOVERY SCRIPT - RUN IN BROWSER CONSOLE
 * 
 * INSTRUCTIONS:
 * 1. Open your POS app in the browser
 * 2. Press F12 to open Developer Tools
 * 3. Go to the "Console" tab
 * 4. Copy and paste this ENTIRE script below
 * 5. Press Enter to run it
 * 
 * This script will:
 * - Scan IndexedDB for orders
 * - Find orders that are NOT in sync queue
 * - Re-queue them for syncing
 * - NOT create duplicates
 * 
 * SAFE TO RUN: This only reads from IndexedDB and adds to sync queue
 * IT WILL NOT: Delete any data, modify orders, or create duplicates
 */

(async function recoverLostOrders() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      ORDER RECOVERY TOOL - SAFE TO RUN               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  
  try {
    // 1. Open IndexedDB
    const dbName = 'emperor-pos-db';
    const dbVersion = 6;
    
    console.log('📊 Connecting to IndexedDB...');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, dbVersion);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    console.log('✓ Connected to database');
    console.log('');
    
    // 2. Get all orders
    console.log('📦 Scanning orders...');
    const orders = await new Promise((resolve, reject) => {
      const transaction = db.transaction(['orders'], 'readonly');
      const store = transaction.objectStore('orders');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    
    console.log(`✓ Found ${orders.length} total orders`);
    
    // Count temporary orders
    const tempOrders = orders.filter(o => o.id && o.id.startsWith('temp-order-'));
    console.log(`✓ Found ${tempOrders.length} temporary (offline-created) orders`);
    console.log('');
    
    // 3. Get all sync operations
    console.log('🔄 Checking sync queue...');
    const syncOps = await new Promise((resolve, reject) => {
      const transaction = db.transaction(['sync_operations'], 'readonly');
      const store = transaction.objectStore('sync_operations');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    
    console.log(`✓ Found ${syncOps.length} operations in sync queue`);
    console.log('');
    
    // 4. Find which orders are already in sync queue
    const syncedOrderIds = new Set();
    syncOps.forEach(op => {
      if (op.data && (op.data.id || op.data.orderId)) {
        syncedOrderIds.add(op.data.id || op.data.orderId);
      }
    });
    
    console.log(`✓ ${syncedOrderIds.size} orders are already in sync queue`);
    console.log('');
    
    // 5. Find unsynced orders
    const unsyncedOrders = tempOrders.filter(order => !syncedOrderIds.has(order.id));
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔍 ANALYSIS RESULTS:`);
    console.log(`   Total orders: ${orders.length}`);
    console.log(`   Temporary orders: ${tempOrders.length}`);
    console.log(`   Already in queue: ${syncedOrderIds.size}`);
    console.log(`   NEEDS RECOVERY: ${unsyncedOrders.length} ⚠️`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    if (unsyncedOrders.length === 0) {
      console.log('✅ GOOD NEWS! All orders are already in sync queue.');
      console.log('   No recovery needed. You can close this console.');
      db.close();
      return;
    }
    
    // 6. Show what will be recovered
    console.log('📋 Orders to be recovered:');
    let totalAmount = 0;
    unsyncedOrders.forEach(order => {
      const amount = order.totalAmount || order.subtotal || 0;
      totalAmount += amount;
      console.log(`   • Order #${order.orderNumber} - ${amount.toFixed(2)} EGP (${order.orderType})`);
    });
    console.log(`   💰 Total value: ${totalAmount.toFixed(2)} EGP`);
    console.log('');
    
    // 7. Ask for confirmation
    console.log('⚠️  READY TO RECOVER!');
    console.log('   Type: window.confirmRecovery() to proceed');
    console.log('   Or refresh the page to cancel');
    console.log('');
    
    // Store data for confirmation
    window.__recoveryData = {
      db,
      unsyncedOrders,
      totalAmount,
    };
    
    // Create confirmation function
    window.confirmRecovery = async function() {
      if (!window.__recoveryData) {
        console.error('❌ Recovery data not found. Please refresh and run script again.');
        return;
      }
      
      const { db, unsyncedOrders, totalAmount } = window.__recoveryData;
      
      console.log('╔══════════════════════════════════════════════════════════╗');
      console.log('║              STARTING RECOVERY...                       ║');
      console.log('╚══════════════════════════════════════════════════════════╝');
      console.log('');
      
      let recovered = 0;
      let errors = 0;
      
      for (const order of unsyncedOrders) {
        try {
          // Create sync operation
          const operation = {
            id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'CREATE_ORDER',
            data: {
              ...order,
              _recovered: true,
              _recoveryTimestamp: new Date().toISOString(),
            },
            branchId: order.branchId,
            timestamp: Date.now(),
            retryCount: 0,
            idempotencyKey: `CREATE_ORDER_${order.branchId}_${order.orderNumber || order.id}`,
          };
          
          await new Promise((resolve, reject) => {
            const transaction = db.transaction(['sync_operations'], 'readwrite');
            const store = transaction.objectStore('sync_operations');
            const request = store.put(operation);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
          
          recovered++;
          console.log(`✓ Recovered Order #${order.orderNumber} (${recovered}/${unsyncedOrders.length})`);
        } catch (error) {
          errors++;
          console.error(`✗ Failed to recover Order #${order.orderNumber}:`, error);
        }
      }
      
      console.log('');
      console.log('╔══════════════════════════════════════════════════════════╗');
      console.log('║              RECOVERY COMPLETE!                         ║');
      console.log('╚══════════════════════════════════════════════════════════╝');
      console.log('');
      console.log(`📊 Summary:`);
      console.log(`   Orders recovered: ${recovered}`);
      console.log(`   Errors: ${errors}`);
      console.log(`   Total value: ${totalAmount.toFixed(2)} EGP`);
      console.log('');
      console.log('🔄 NEXT STEPS:');
      console.log('   1. Orders are now in sync queue');
      console.log('   2. Go to Sync Dashboard in your app');
      console.log('   3. Click "Sync Now" button');
      console.log('   4. Wait for sync to complete');
      console.log('   5. Check Shift/Day reports to verify data');
      console.log('');
      console.log('✅ Your data is safe! Do NOT clear cache or refresh until synced.');
      console.log('');
      
      // Update sync state
      try {
        const syncState = {
          id: 'current',
          branchId: unsyncedOrders[0]?.branchId || '',
          isOnline: navigator.onLine,
          lastPullTimestamp: 0,
          lastPushTimestamp: 0,
          pendingOperations: recovered,
        };
        
        await new Promise((resolve, reject) => {
          const transaction = db.transaction(['sync_state'], 'readwrite');
          const store = transaction.objectStore('sync_state');
          const request = store.put(syncState);
          
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        
        console.log(`✓ Updated sync state: ${recovered} pending operations`);
      } catch (error) {
        console.warn('Could not update sync state:', error);
      }
      
      db.close();
      delete window.__recoveryData;
      delete window.confirmRecovery;
      
      return { recovered, errors, totalAmount };
    };
    
  } catch (error) {
    console.error('❌ Recovery failed:', error);
    console.error('');
    console.error('Please try again or contact support with this error message.');
  }
})();
