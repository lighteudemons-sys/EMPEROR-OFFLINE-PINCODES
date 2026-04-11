/**
 * Offline Manager Service
 * Manages online/offline detection, operation queuing, and automatic sync
 * Allows branches to work offline for weeks and sync when back online
 * Uses IndexedDB for reliable offline storage
 */

import { getIndexedDBStorage, OperationType, SyncOperation, SyncState } from '../storage/indexeddb-storage';
import { dataExpirationService } from './data-expiration';

const storageService = getIndexedDBStorage();

// Sync status for UI
export enum SyncStatus {
  IDLE = 'IDLE',
  SYNCING = 'SYNCING',
  OFFLINE = 'OFFLINE',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
}

// Sync result interface
export interface SyncResult {
  success: boolean;
  operationsProcessed: number;
  operationsFailed: number;
  errors: string[];
  timestamp: number;
}

// Configuration
const CONFIG = {
  MAX_RETRY_ATTEMPTS: 3,
  SYNC_INTERVAL: 30000, // 30 seconds
  RETRY_DELAY: 5000, // 5 seconds
  BATCH_SIZE: 50, // Process 50 operations at a time
};

// Event listeners type
type OfflineEventListener = (status: SyncStatus, data?: any) => void;

class OfflineManager {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private syncStatus: SyncStatus = SyncStatus.IDLE;
  private isSyncing: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private retryTimeout: NodeJS.Timeout | null = null;
  private listeners: OfflineEventListener[] = [];
  private branchId: string = '';
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private skipFirstAutoSync: boolean = false;
  private connectivityCheckTimeout: NodeJS.Timeout | null = null;
  private lastConnectivityCheck: number = 0;
  private readonly CONNECTIVITY_CHECK_DEBOUNCE = 3000; // 3 seconds between checks

  /**
   * Initialize offline manager
   */
  async initialize(branchId: string): Promise<void> {
    // Return existing promise if already initializing
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // If already initialized with same branch, return immediately
    if (this.initialized && this.branchId === branchId) {
      console.log('[OfflineManager] Already initialized for branch:', branchId);
      return Promise.resolve();
    }

    this.initializationPromise = (async () => {
      this.branchId = branchId;

      // Initialize local storage
      await storageService.init();

      // Check actual network connectivity only if not already checked
      // to avoid rapid re-renders during network transitions
      if (!this.initialized) {
        await this.checkActualConnectivity();
      }

      // Set up online/offline event listeners (only once)
      if (typeof window !== 'undefined' && !this.initialized) {
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
      }

      // Load sync state
      const syncState = await storageService.getSyncState();
      if (!syncState) {
        await storageService.updateSyncState({
          branchId: this.branchId,
          isOnline: this.isOnline,
          lastPullTimestamp: 0,
          lastPushTimestamp: 0,
          pendingOperations: 0,
        });
      }

      // Update online status in sync state
      await storageService.updateSyncState({ isOnline: this.isOnline });

      this.initialized = true;

      console.log('[OfflineManager] Initialized - Online:', this.isOnline, 'Branch:', branchId);

      // DISABLED: Auto-sync causes massive data transfers and timeouts
      // Users can manually sync by clicking the "Sync" button
      //
      // // If online, start auto-sync (but skip the first interval to avoid race with manual sync)
      // if (this.isOnline) {
      //   this.skipFirstAutoSync = true; // Skip first auto-sync interval
      //   this.startAutoSync();
      // } else {
      //   this.notifyListeners(SyncStatus.OFFLINE, { message: 'You are offline' });
      // }
      //
      // Instead, we'll let components fetch only the data they need via useOfflineData hook

      if (!this.isOnline) {
        this.notifyListeners(SyncStatus.OFFLINE, { message: 'You are offline' });
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Check actual network connectivity with debouncing
   */
  async checkActualConnectivity(): Promise<void> {
    // Debounce connectivity checks to prevent rapid re-renders
    const now = Date.now();
    if (now - this.lastConnectivityCheck < this.CONNECTIVITY_CHECK_DEBOUNCE) {
      console.log('[OfflineManager] Skipping connectivity check - too soon since last check');
      return;
    }

    this.lastConnectivityCheck = now;
    console.log('[OfflineManager] Checking actual network connectivity...');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      await fetch('/api/branches', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);
      
      // Only update if status changed
      if (!this.isOnline) {
        console.log('[OfflineManager] Network check successful - setting online');
        this.isOnline = true;
        await storageService.updateSyncState({ isOnline: true });
      } else {
        console.log('[OfflineManager] Network check successful - already online');
      }
    } catch (err) {
      console.log('[OfflineManager] Network check failed, setting offline:', err);
      // Only update if status changed
      if (this.isOnline) {
        console.log('[OfflineManager] Setting offline status');
        this.isOnline = false;
        await storageService.updateSyncState({ isOnline: false });
      }
    }
  }

  /**
   * Handle online event with debouncing
   */
  private handleOnline = async (): Promise<void> => {
    // Clear any pending timeout
    if (this.connectivityCheckTimeout) {
      clearTimeout(this.connectivityCheckTimeout);
    }

    // Debounce the online check
    this.connectivityCheckTimeout = setTimeout(async () => {
      console.log('[OfflineManager] Browser says online, verifying connectivity...');
      await this.checkActualConnectivity();

      if (this.isOnline) {
        console.log('[OfflineManager] Connection restored, triggering sync...');
        await storageService.updateSyncState({ isOnline: true });
        this.notifyListeners(SyncStatus.IDLE, { message: 'Back online' });

        // Start auto-sync
        this.startAutoSync();

        // Trigger immediate sync (with small delay to ensure everything is ready)
        setTimeout(() => {
          console.log('[OfflineManager] Triggering immediate sync after connection restored...');
          this.syncAll();
        }, 1000);
      } else {
        console.log('[OfflineManager] Still offline despite browser event');
      }
    }, 1000); // 1 second debounce
  };

  /**
   * Handle offline event with debouncing
   */
  private handleOffline = async (): Promise<void> => {
    // Clear any pending timeout
    if (this.connectivityCheckTimeout) {
      clearTimeout(this.connectivityCheckTimeout);
    }

    // Debounce the offline check
    this.connectivityCheckTimeout = setTimeout(async () => {
      console.log('[OfflineManager] Connection lost');
      
      // Only update if status changed
      if (this.isOnline) {
        this.isOnline = false;
        await storageService.updateSyncState({ isOnline: false });
        this.stopAutoSync();
        this.notifyListeners(SyncStatus.OFFLINE, { message: 'You are offline' });
      }
    }, 500); // 500ms debounce for offline
  };

  /**
   * Start auto-sync interval
   */
  private startAutoSync(): void {
    if (this.syncInterval) {
      return;
    }

    this.syncInterval = setInterval(async () => {
      // Skip first auto-sync if flag is set (to avoid race with manual sync)
      if (this.skipFirstAutoSync) {
        this.skipFirstAutoSync = false;
        console.log('[OfflineManager] Skipping first auto-sync interval');
        return;
      }

      if (this.isOnline && !this.isSyncing) {
        await this.syncAll();
      }
    }, CONFIG.SYNC_INTERVAL);
  }

  /**
   * Stop auto-sync interval
   */
  private stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(status: SyncStatus, data?: any): void {
    this.syncStatus = status;
    this.listeners.forEach(listener => listener(status, data));
  }

  /**
   * Add event listener
   */
  addEventListener(listener: OfflineEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: OfflineEventListener): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return this.syncStatus;
  }

  /**
   * Check if online
   */
  isCurrentlyOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Get pending operations count
   */
  async getPendingOperationsCount(): Promise<number> {
    return storageService.getPendingOperationsCount();
  }

  /**
   * Queue an operation for sync
   */
  async queueOperation(type: OperationType, data: any): Promise<void> {
    // Store operation locally
    await storageService.addOperation({
      type,
      data,
      branchId: this.branchId,
    });

    // Update pending count
    const count = await this.getPendingOperationsCount();
    await storageService.updateSyncState({ pendingOperations: count });

    // If online, trigger sync
    if (this.isOnline && !this.isSyncing) {
      this.syncAll();
    }
  }

  /**
   * Sync all pending operations
   */
  async syncAll(): Promise<SyncResult> {
    // Check if sync is already in progress
    if (this.isSyncing) {
      console.log('[OfflineManager] Sync already in progress, skipping');
      return {
        success: false,
        operationsProcessed: 0,
        operationsFailed: 0,
        errors: ['Sync already in progress'],
        timestamp: Date.now(),
      };
    }

    if (!this.isOnline) {
      console.log('[OfflineManager] Currently offline - cannot sync');
      return {
        success: false,
        operationsProcessed: 0,
        operationsFailed: 0,
        errors: ['Offline - cannot sync'],
        timestamp: Date.now(),
      };
    }

    this.isSyncing = true;
    this.notifyListeners(SyncStatus.SYNCING, { message: 'Syncing...' });

    // Safety timeout to clear lock if sync gets stuck (120 seconds)
    const timeoutId = setTimeout(() => {
      if (this.isSyncing) {
        console.error('[OfflineManager] Sync timeout after 120 seconds, clearing lock');
        this.isSyncing = false;
      }
    }, 120000);

    try {
      console.log('[OfflineManager] Starting sync...');
      console.log('[OfflineManager] Branch ID:', this.branchId);
      console.log('[OfflineManager] Online status:', this.isOnline);

      // First, try to pull latest data from server (non-blocking on failure)
      console.log('[OfflineManager] Step 1: Pulling data...');
      await this.pullData();
      console.log('[OfflineManager] Step 1: Pull completed');

      // Then, push pending operations
      console.log('[OfflineManager] Step 2: Pushing operations...');
      const result = await this.pushOperations();
      console.log('[OfflineManager] Step 2: Push completed:', result);

      // Update sync state
      await storageService.updateSyncState({
        lastPushTimestamp: Date.now(),
        pendingOperations: await this.getPendingOperationsCount(),
      });

      // Consider sync successful if no critical errors
      const hasCriticalErrors = result.errors.some(e =>
        e.includes('offline') || e.includes('network')
      );

      if (result.operationsFailed > 0 && !hasCriticalErrors) {
        // Some operations failed but not critical
        this.notifyListeners(SyncStatus.SUCCESS, {
          message: 'Sync completed with some warnings'
        });
      } else if (result.success || result.operationsProcessed > 0) {
        this.notifyListeners(SyncStatus.SUCCESS, { message: 'Sync completed' });
      } else {
        this.notifyListeners(SyncStatus.ERROR, { message: 'Sync completed with errors', errors: result.errors });
      }

      console.log('[OfflineManager] Sync completed successfully:', result);
      return result;
    } catch (error) {
      console.error('[OfflineManager] Sync error:', error);
      this.notifyListeners(SyncStatus.ERROR, { message: 'Sync failed', error });
      return {
        success: false,
        operationsProcessed: 0,
        operationsFailed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        timestamp: Date.now(),
      };
    } finally {
      clearTimeout(timeoutId);
      console.log('[OfflineManager] Sync lock released, isSyncing set to false');
      this.isSyncing = false;
    }
  }

  /**
   * Pull latest data from server
   */
  private async pullData(): Promise<void> {
    console.log('[OfflineManager] pullData: Starting...');
    
    // Skip pull if already tried recently or if offline
    const syncState = await storageService.getSyncState();
    const lastPull = syncState?.lastPullTimestamp || 0;
    const timeSinceLastPull = Date.now() - lastPull;
    
    // Don't pull if less than 5 minutes ago and pull failed last time
    if (timeSinceLastPull < 300000 && syncState?.lastPullFailed) {
      console.log('[OfflineManager] Skipping pull - tried recently and failed');
      return;
    }

    try {
      console.log('[OfflineManager] pullData: Fetching from /api/sync/pull...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch('/api/sync/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: this.branchId,
          force: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[OfflineManager] pullData: Response status:', response.status);

      if (!response.ok) {
        console.log('[OfflineManager] Pull API not available:', response.status);
        await storageService.updateSyncState({ 
          lastPullFailed: true,
          lastPullTimestamp: Date.now()
        });
        // Don't throw - this is expected on Vercel old deployment
        return;
      }

      console.log('[OfflineManager] pullData: Parsing JSON response...');
      const result = await response.json();
      console.log('[OfflineManager] pullData: Got result, data keys:', result.data ? Object.keys(result.data) : 'none');

      // Store pulled data locally
      if (result.data) {
        const savePromises: Promise<void>[] = [];
        
        if (result.data.menuItems && Array.isArray(result.data.menuItems)) {
          savePromises.push(storageService.batchSaveMenuItems(result.data.menuItems));
          console.log('[OfflineManager] Queued save for', result.data.menuItems.length, 'menu items');
        }
        if (result.data.ingredients && Array.isArray(result.data.ingredients)) {
          savePromises.push(storageService.batchSaveIngredients(result.data.ingredients));
          console.log('[OfflineManager] Queued save for', result.data.ingredients.length, 'ingredients');
        }
        if (result.data.categories && Array.isArray(result.data.categories)) {
          savePromises.push(storageService.batchSaveCategories(result.data.categories));
          console.log('[OfflineManager] Queued save for', result.data.categories.length, 'categories');
        }
        if (result.data.users && Array.isArray(result.data.users)) {
          savePromises.push(storageService.batchSaveUsers(result.data.users));
          console.log('[OfflineManager] Queued save for', result.data.users.length, 'users');
        }
        if (result.data.orders && Array.isArray(result.data.orders)) {
          savePromises.push(storageService.batchSaveOrders(result.data.orders));
          console.log('[OfflineManager] Queued save for', result.data.orders.length, 'orders');
        }
        if (result.data.shifts && Array.isArray(result.data.shifts)) {
          savePromises.push(storageService.batchSaveShifts(result.data.shifts));
          console.log('[OfflineManager] Queued save for', result.data.shifts.length, 'shifts');
        }
        if (result.data.wasteLogs && Array.isArray(result.data.wasteLogs)) {
          savePromises.push(storageService.batchSaveWasteLogs(result.data.wasteLogs));
          console.log('[OfflineManager] Queued save for', result.data.wasteLogs.length, 'waste logs');
        }
        if (result.data.branches && Array.isArray(result.data.branches)) {
          savePromises.push(storageService.batchSaveBranches(result.data.branches));
          console.log('[OfflineManager] Queued save for', result.data.branches.length, 'branches');
        }
        if (result.data.deliveryAreas && Array.isArray(result.deliveryAreas)) {
          savePromises.push(storageService.batchSaveDeliveryAreas(result.data.deliveryAreas));
          console.log('[OfflineManager] Queued save for', result.data.deliveryAreas.length, 'delivery areas');
        }
        if (result.data.customers && Array.isArray(result.data.customers)) {
          savePromises.push(storageService.batchSaveCustomers(result.data.customers));
          console.log('[OfflineManager] Queued save for', result.data.customers.length, 'customers');
        }
        if (result.data.customerAddresses && Array.isArray(result.data.customerAddresses)) {
          savePromises.push(storageService.batchSaveCustomerAddresses(result.data.customerAddresses));
          console.log('[OfflineManager] Queued save for', result.data.customerAddresses.length, 'customer addresses');
        }
        if (result.data.couriers && Array.isArray(result.data.couriers)) {
          savePromises.push(storageService.batchSaveCouriers(result.data.couriers));
          console.log('[OfflineManager] Queued save for', result.data.couriers.length, 'couriers');
        }
        if (result.data.receiptSettings) {
          savePromises.push(storageService.saveReceiptSettings(result.data.receiptSettings));
          console.log('[OfflineManager] Queued save for receipt settings');
        }
        if (result.data.tables && Array.isArray(result.data.tables)) {
          savePromises.push(storageService.batchSaveTables(result.data.tables));
          console.log('[OfflineManager] Queued save for', result.data.tables.length, 'tables');
        }
        if (result.data.inventory && Array.isArray(result.data.inventory)) {
          savePromises.push(storageService.batchSaveInventory(result.data.inventory));
          console.log('[OfflineManager] Queued save for', result.data.inventory.length, 'inventory records');
        }
        if (result.data.attendances && Array.isArray(result.data.attendances)) {
          savePromises.push(storageService.batchSaveAttendances(result.data.attendances));
          console.log('[OfflineManager] Queued save for', result.data.attendances.length, 'attendances');
        }

        console.log('[OfflineManager] pullData: Waiting for', savePromises.length, 'save operations to complete...');
        await Promise.all(savePromises);
        console.log('[OfflineManager] pullData: All save operations completed');

        await storageService.updateSyncState({
          lastPullFailed: false,
          lastPullTimestamp: Date.now()
        });
      }

      console.log('[OfflineManager] Data pulled successfully');
    } catch (error: any) {
      console.error('[OfflineManager] Pull error:', error);
      // Silent fail - sync errors shouldn't spam console
      await storageService.updateSyncState({ 
        lastPullFailed: true,
        lastPullTimestamp: Date.now()
      });
    }
    
    console.log('[OfflineManager] pullData: Finished');
  }

  /**
   * Push pending operations to server
   */
  private async pushOperations(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      operationsProcessed: 0,
      operationsFailed: 0,
      errors: [],
      timestamp: Date.now(),
    };

    try {
      console.log('[OfflineManager] pushOperations: Getting pending operations...');
      // Get pending operations in batches
      let operations = await storageService.getPendingOperations();
      console.log('[OfflineManager] pushOperations: Found', operations.length, 'pending operations');
      console.log('[OfflineManager] pushOperations: Operations:', operations.map(op => ({ id: op.id, type: op.type, timestamp: op.timestamp })));

      if (operations.length === 0) {
        console.log('[OfflineManager] pushOperations: No operations to sync, returning early');
        return result;
      }

      let batchNumber = 0;
      while (operations.length > 0) {
        batchNumber++;
        console.log(`[OfflineManager] Processing batch ${batchNumber} of ${operations.length} operations...`);
        
        // Process batch
        const batch = operations.slice(0, CONFIG.BATCH_SIZE);
        console.log(`[OfflineManager] Batch ${batchNumber} size:`, batch.length, 'operations');
        
        console.log(`[OfflineManager] Starting batch push for ${batch.length} operations...`);
        const batchResult = await this.pushBatch(batch);
        console.log(`[OfflineManager] Batch ${batchNumber} result:`, batchResult);

        result.operationsProcessed += batchResult.processed;
        result.operationsFailed += batchResult.failed;
        result.errors.push(...batchResult.errors);

        if (batchResult.errors.length > 0) {
          result.success = false;
        }

        // Remove successful operations
        for (const op of batch) {
          if (!batchResult.failedIds.includes(op.id)) {
            console.log(`[OfflineManager] Removing successful operation: ${op.id} (${op.type})`);
            await storageService.removeOperation(op.id);
          } else {
            // Increment retry count and check if max retries exceeded
            op.retryCount += 1;

            // Check if max retries exceeded
            if (op.retryCount >= CONFIG.MAX_RETRY_ATTEMPTS) {
              console.error(`[OfflineManager] Operation ${op.id} exceeded max retries (${CONFIG.MAX_RETRY_ATTEMPTS}), will be marked as failed permanently`);
              // Operation will stay in queue but won't be retried
              // TODO: Implement failed operation cleanup
            }

            await storageService.updateOperation(op);
          }
        }

        // Get next batch
        operations = await storageService.getPendingOperations();
        console.log(`[OfflineManager] After batch ${batchNumber}, remaining operations:`, operations.length);

        // Small delay between batches
        if (operations.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log('[OfflineManager] pushOperations completed:', result);
      return result;
    } catch (error) {
      console.error('[OfflineManager] Push error:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Push a batch of operations
   */
  private async pushBatch(operations: SyncOperation[]): Promise<{
    processed: number;
    failed: number;
    failedIds: string[];
    errors: string[];
    idMappings: Record<string, string>; // Temp ID -> Real ID mappings
  }> {
    const result = {
      processed: 0,
      failed: 0,
      failedIds: [] as string[],
      errors: [] as string[],
      idMappings: {} as Record<string, string>,
    };

    try {
      console.log('[OfflineManager] pushBatch: Starting batch push with', operations.length, 'operations');
      console.log('[OfflineManager] pushBatch: Operation types:', operations.map(op => op.type));
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 second timeout (less than 120s sync timeout)

      console.log('[OfflineManager] pushBatch: Sending POST to /api/sync/batch-push...');
      const response = await fetch('/api/sync/batch-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: this.branchId,
          operations: operations.map(op => ({
            type: op.type,
            data: op.data,
            timestamp: op.timestamp,
          })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('[OfflineManager] pushBatch: Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[OfflineManager] pushBatch: API error:', response.status, errorText);
        throw new Error(`Batch push failed: ${response.statusText} - ${errorText}`);
      }

      console.log('[OfflineManager] pushBatch: Parsing JSON response...');
      const batchResult = await response.json();
      console.log('[OfflineManager] pushBatch: Batch result:', batchResult);

      // Log server-side debug logs if available
      if (batchResult.logs && batchResult.logs.length > 0) {
        console.log('[OfflineManager] === SERVER LOGS START ===');
        batchResult.logs.forEach((log: string, index: number) => {
          console.log(`[Server Log ${index + 1}]`, log);
        });
        console.log('[OfflineManager] === SERVER LOGS END ===');
      }

      result.processed = batchResult.processed || operations.length;
      result.failed = batchResult.failed || 0;
      result.failedIds = batchResult.failedIds || [];
      result.errors = batchResult.errors || [];
      result.idMappings = batchResult.idMappings || {};

      // Store id mappings for future lookups (e.g., viewing offline-closed shifts online)
      if (Object.keys(result.idMappings).length > 0) {
        await storageService.saveIdMappings(result.idMappings);
        console.log('[OfflineManager] Saved', Object.keys(result.idMappings).length, 'ID mappings');
      }

      console.log('[OfflineManager] pushBatch: Completed successfully');
      return result;
    } catch (error: any) {
      console.error('[OfflineManager] pushBatch error:', error);
      
      // Mark all as failed
      result.failed = operations.length;
      result.failedIds = operations.map(op => op.id);
      
      if (error.name === 'AbortError') {
        result.errors.push(`Request timeout after 55 seconds`);
      } else {
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
      
      return result;
    }
  }

  /**
   * Force sync (manual trigger)
   */
  async forceSync(): Promise<SyncResult> {
    console.log('[OfflineManager] Force sync triggered');
    return this.syncAll();
  }

  /**
   * Get sync state info
   */
  async getSyncInfo(): Promise<{
    isOnline: boolean;
    lastPullTimestamp: number;
    lastPushTimestamp: number;
    pendingOperations: number;
    syncStatus: SyncStatus;
  }> {
    const state = await storageService.getSyncState();
    const pendingOps = await this.getPendingOperationsCount();

    return {
      isOnline: this.isOnline,
      lastPullTimestamp: state?.lastPullTimestamp || 0,
      lastPushTimestamp: state?.lastPushTimestamp || 0,
      pendingOperations: pendingOps,
      syncStatus: this.syncStatus,
    };
  }

  /**
   * Clear all local data (reset)
   */
  async clearAllData(): Promise<void> {
    await storageService.clearAllData();
    await dataExpirationService.clearAll();
    await storageService.updateSyncState({
      branchId: this.branchId,
      isOnline: this.isOnline,
      lastPullTimestamp: 0,
      lastPushTimestamp: 0,
      pendingOperations: 0,
    });
    console.log('[OfflineManager] All data cached');
  }

  /**
   * Perform cleanup of expired data
   */
  async performCleanup(): Promise<{
    expiredRemoved: number;
    totalEntries: number;
    totalSize: number;
  }> {
    console.log('[OfflineManager] Performing data cleanup...');
    const cleanupResult = await dataExpirationService.cleanup();
    console.log('[OfflineManager] Cleanup completed:', cleanupResult);
    return cleanupResult;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return dataExpirationService.getStats();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.stopAutoSync();
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
    if (this.connectivityCheckTimeout) {
      clearTimeout(this.connectivityCheckTimeout);
    }
    dataExpirationService.stopCleanupInterval();
    this.listeners = [];
    this.initialized = false;
  }
}

// Export singleton instance
export const offlineManager = new OfflineManager();
