/**
 * Local Storage Service (Now a wrapper around IndexedDB)
 * This file is kept for backward compatibility but now uses IndexedDB internally
 * All operations are delegated to IndexedDBStorage for better performance and reliability
 */

import { getIndexedDBStorage } from './indexeddb-storage';

const indexedDBStorage = getIndexedDBStorage();

// Re-export types for backward compatibility
export enum OperationType {
  CREATE_ORDER = 'CREATE_ORDER',
  UPDATE_ORDER = 'UPDATE_ORDER',
  CREATE_CUSTOMER = 'CREATE_CUSTOMER',
  UPDATE_CUSTOMER = 'UPDATE_CUSTOMER',
  CREATE_INGREDIENT = 'CREATE_INGREDIENT',
  UPDATE_INGREDIENT = 'UPDATE_INGREDIENT',
  CREATE_MENU_ITEM = 'CREATE_MENU_ITEM',
  UPDATE_MENU_ITEM = 'UPDATE_MENU_ITEM',
  CREATE_SHIFT = 'CREATE_SHIFT',
  UPDATE_SHIFT = 'UPDATE_SHIFT',
  CLOSE_SHIFT = 'CLOSE_SHIFT',
  OPEN_BUSINESS_DAY = 'OPEN_BUSINESS_DAY',
  CLOSE_BUSINESS_DAY = 'CLOSE_BUSINESS_DAY',
  CREATE_WASTE_LOG = 'CREATE_WASTE_LOG',
  CREATE_TRANSFER = 'CREATE_TRANSFER',
  UPDATE_INVENTORY = 'UPDATE_INVENTORY',
  CREATE_PURCHASE_ORDER = 'CREATE_PURCHASE_ORDER',
  UPDATE_PURCHASE_ORDER = 'UPDATE_PURCHASE_ORDER',
  CREATE_RECEIPT_SETTINGS = 'CREATE_RECEIPT_SETTINGS',
  UPDATE_RECEIPT_SETTINGS = 'UPDATE_RECEIPT_SETTINGS',
  CREATE_DAILY_EXPENSE = 'CREATE_DAILY_EXPENSE',
  CREATE_VOIDED_ITEM = 'CREATE_VOIDED_ITEM',
  CREATE_PROMO_CODE = 'CREATE_PROMO_CODE',
  USE_PROMO_CODE = 'USE_PROMO_CODE',
  CREATE_LOYALTY_TRANSACTION = 'CREATE_LOYALTY_TRANSACTION',
  CREATE_TABLE = 'CREATE_TABLE',
  UPDATE_TABLE = 'UPDATE_TABLE',
  CLOSE_TABLE = 'CLOSE_TABLE',
  CREATE_INVENTORY_TRANSACTION = 'CREATE_INVENTORY_TRANSACTION',
  CREATE_INVENTORY = 'CREATE_INVENTORY',
  CREATE_WASTE = 'CREATE_WASTE',
  UPDATE_USER = 'UPDATE_USER',
}

export interface SyncOperation {
  id: string;
  type: OperationType;
  data: any;
  branchId: string;
  timestamp: number;
  retryCount: number;
}

export interface SyncState {
  branchId: string;
  isOnline: boolean;
  lastPullTimestamp: number;
  lastPushTimestamp: number;
  pendingOperations: number;
  lastPullFailed?: boolean;
}

/**
 * LocalStorageService - Now a compatibility wrapper around IndexedDBStorage
 * All methods delegate to IndexedDB for actual storage
 */
class LocalStorageService {
  private initialized: boolean = false;

  /**
   * Initialize the storage service
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize IndexedDB
    await indexedDBStorage.init();

    // Initialize sync state if not exists
    const state = await indexedDBStorage.getSyncState();
    if (!state) {
      await indexedDBStorage.updateSyncState({
        branchId: '',
        isOnline: true,
        lastPullTimestamp: 0,
        lastPushTimestamp: 0,
        pendingOperations: 0,
      });
    }

    this.initialized = true;
    console.log('[LocalStorageService] Initialized (using IndexedDB under the hood)');
  }

  /**
   * Get sync state
   */
  async getSyncState(): Promise<SyncState | null> {
    try {
      return await indexedDBStorage.getSyncState();
    } catch (error) {
      console.error('[LocalStorageService] Error getting sync state:', error);
      return null;
    }
  }

  /**
   * Update sync state
   */
  async updateSyncState(updates: Partial<SyncState>): Promise<void> {
    try {
      await indexedDBStorage.updateSyncState(updates);
    } catch (error) {
      console.error('[LocalStorageService] Error updating sync state:', error);
    }
  }

  /**
   * Add operation to queue
   */
  async addOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    try {
      await indexedDBStorage.addOperation(operation);
    } catch (error) {
      console.error('[LocalStorageService] Error adding operation:', error);
    }
  }

  /**
   * Get all pending operations
   */
  async getPendingOperations(): Promise<SyncOperation[]> {
    try {
      return await indexedDBStorage.getPendingOperations();
    } catch (error) {
      console.error('[LocalStorageService] Error getting pending operations:', error);
      return [];
    }
  }

  /**
   * Get all operations (alias for getPendingOperations)
   */
  async getAllOperations(): Promise<SyncOperation[]> {
    return this.getPendingOperations();
  }

  /**
   * Get pending operations count
   */
  async getPendingOperationsCount(): Promise<number> {
    try {
      return await indexedDBStorage.getPendingOperationsCount();
    } catch (error) {
      console.error('[LocalStorageService] Error getting pending operations count:', error);
      return 0;
    }
  }

  /**
   * Remove operation from queue
   */
  async removeOperation(operationId: string): Promise<void> {
    try {
      await indexedDBStorage.removeOperation(operationId);
    } catch (error) {
      console.error('[LocalStorageService] Error removing operation:', error);
    }
  }

  /**
   * Delete operation (alias for removeOperation)
   */
  async deleteOperation(operationId: string): Promise<void> {
    return this.removeOperation(operationId);
  }

  /**
   * Update operation
   */
  async updateOperation(operation: SyncOperation): Promise<void> {
    try {
      await indexedDBStorage.updateOperation(operation);
    } catch (error) {
      console.error('[LocalStorageService] Error updating operation:', error);
    }
  }

  // ============================================
  // DATA CACHING METHODS
  // ============================================

  async batchSaveMenuItems(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveMenuItems(items);
      console.log('[LocalStorageService] Saved', items.length, 'menu items');
    } catch (error) {
      console.error('[LocalStorageService] Error saving menu items:', error);
    }
  }

  async getMenuItems(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllMenuItems();
    } catch (error) {
      console.error('[LocalStorageService] Error getting menu items:', error);
      return [];
    }
  }

  async batchSaveIngredients(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveIngredients(items);
    } catch (error) {
      console.error('[LocalStorageService] Error saving ingredients:', error);
    }
  }

  async getIngredients(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllIngredients();
    } catch (error) {
      console.error('[LocalStorageService] Error getting ingredients:', error);
      return [];
    }
  }

  async batchSaveCategories(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveCategories(items);
    } catch (error) {
      console.error('[LocalStorageService] Error saving categories:', error);
    }
  }

  async getCategories(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllCategories();
    } catch (error) {
      console.error('[LocalStorageService] Error getting categories:', error);
      return [];
    }
  }

  async batchSaveUsers(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveUsers(items);
    } catch (error) {
      console.error('[LocalStorageService] Error saving users:', error);
    }
  }

  async getUsers(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllUsers();
    } catch (error) {
      console.error('[LocalStorageService] Error getting users:', error);
      return [];
    }
  }

  async batchSaveOrders(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveOrders(items);
    } catch (error) {
      console.error('[LocalStorageService] Error saving orders:', error);
    }
  }

  async getOrders(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllOrders();
    } catch (error) {
      console.error('[LocalStorageService] Error getting orders:', error);
      return [];
    }
  }

  async batchSaveShifts(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveShifts(items);
    } catch (error) {
      console.error('[LocalStorageService] Error saving shifts:', error);
    }
  }

  async getShifts(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllShifts();
    } catch (error) {
      console.error('[LocalStorageService] Error getting shifts:', error);
      return [];
    }
  }

  async saveBusinessDay(businessDay: any): Promise<void> {
    try {
      await indexedDBStorage.saveBusinessDay(businessDay);
      console.log('[LocalStorageService] Saved business day:', businessDay.id);
    } catch (error) {
      console.error('[LocalStorageService] Error saving business day:', error);
    }
  }

  async getBusinessDays(): Promise<any[]> {
    try {
      return await indexedDBStorage.getBusinessDays();
    } catch (error) {
      console.error('[LocalStorageService] Error getting business days:', error);
      return [];
    }
  }

  async batchSaveWasteLogs(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveWasteLogs(items);
    } catch (error) {
      console.error('[LocalStorageService] Error saving waste logs:', error);
    }
  }

  async getWasteLogs(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllWasteLogs();
    } catch (error) {
      console.error('[LocalStorageService] Error getting waste logs:', error);
      return [];
    }
  }

  async batchSaveBranches(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveBranches(items);
    } catch (error) {
      console.error('[LocalStorageService] Error saving branches:', error);
    }
  }

  async getBranches(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllBranches();
    } catch (error) {
      console.error('[LocalStorageService] Error getting branches:', error);
      return [];
    }
  }

  async batchSaveDeliveryAreas(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveDeliveryAreas(items);
    } catch (error) {
      console.error('[LocalStorageService] Error saving delivery areas:', error);
    }
  }

  async getDeliveryAreas(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllDeliveryAreas();
    } catch (error) {
      console.error('[LocalStorageService] Error getting delivery areas:', error);
      return [];
    }
  }

  async batchSaveCustomers(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveCustomers(items);
    } catch (error) {
      console.error('[LocalStorageService] Error saving customers:', error);
    }
  }

  async getCustomers(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllCustomers();
    } catch (error) {
      console.error('[LocalStorageService] Error getting customers:', error);
      return [];
    }
  }

  async batchSaveCustomerAddresses(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveCustomerAddresses(items);
    } catch (error) {
      console.error('[LocalStorageService] Error saving customer addresses:', error);
    }
  }

  async getCustomerAddresses(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllCustomerAddresses();
    } catch (error) {
      console.error('[LocalStorageService] Error getting customer addresses:', error);
      return [];
    }
  }

  async batchSaveCouriers(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveCouriers(items);
    } catch (error) {
      console.error('[LocalStorageService] Error saving couriers:', error);
    }
  }

  async getCouriers(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllCouriers();
    } catch (error) {
      console.error('[LocalStorageService] Error getting couriers:', error);
      return [];
    }
  }

  async saveReceiptSettings(settings: any): Promise<void> {
    try {
      await indexedDBStorage.saveReceiptSettings(settings);
    } catch (error) {
      console.error('[LocalStorageService] Error saving receipt settings:', error);
    }
  }

  async getReceiptSettings(): Promise<any | null> {
    try {
      return await indexedDBStorage.getReceiptSettings();
    } catch (error) {
      console.error('[LocalStorageService] Error getting receipt settings:', error);
      return null;
    }
  }

  async batchSaveTables(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveTables(items);
      console.log('[LocalStorageService] Saved', items.length, 'tables');
    } catch (error) {
      console.error('[LocalStorageService] Error saving tables:', error);
    }
  }

  async getAllTables(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllTables();
    } catch (error) {
      console.error('[LocalStorageService] Error getting tables:', error);
      return [];
    }
  }

  async batchSaveDailyExpenses(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveDailyExpenses(items);
      console.log('[LocalStorageService] Saved', items.length, 'daily expenses');
    } catch (error) {
      console.error('[LocalStorageService] Error saving daily expenses:', error);
    }
  }

  async getAllDailyExpenses(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllDailyExpenses();
    } catch (error) {
      console.error('[LocalStorageService] Error getting daily expenses:', error);
      return [];
    }
  }

  async batchSaveInventory(items: any[]): Promise<void> {
    try {
      await indexedDBStorage.batchSaveInventory(items);
      console.log('[LocalStorageService] Saved', items.length, 'inventory records');
    } catch (error) {
      console.error('[LocalStorageService] Error saving inventory:', error);
    }
  }

  async getAllInventory(): Promise<any[]> {
    try {
      return await indexedDBStorage.getAllInventory();
    } catch (error) {
      console.error('[LocalStorageService] Error getting inventory:', error);
      return [];
    }
  }

  /**
   * Save a single order (used by POS interface for offline orders)
   */
  async saveOrder(order: any): Promise<void> {
    try {
      const orders = await this.getOrders();
      const index = orders.findIndex((o: any) => o.id === order.id);
      if (index >= 0) {
        orders[index] = order;
      } else {
        orders.push(order);
      }
      await indexedDBStorage.batchSaveOrders(orders);
      console.log('[LocalStorageService] Saved order:', order.id);
    } catch (error) {
      console.error('[LocalStorageService] Error saving order:', error);
    }
  }

  /**
   * Save a single shift (used by POS interface for offline shifts)
   */
  async saveShift(shift: any): Promise<void> {
    try {
      const shifts = await this.getShifts();
      const index = shifts.findIndex((s: any) => s.id === shift.id);
      if (index >= 0) {
        shifts[index] = shift;
      } else {
        shifts.push(shift);
      }
      await indexedDBStorage.batchSaveShifts(shifts);
      console.log('[LocalStorageService] Saved shift:', shift.id);
    } catch (error) {
      console.error('[LocalStorageService] Error saving shift:', error);
    }
  }

  /**
   * Get all menu items (alias for getMenuItems)
   */
  async getAllMenuItems(): Promise<any[]> {
    return this.getMenuItems();
  }

  /**
   * Get all shifts (alias for getShifts)
   */
  async getAllShifts(): Promise<any[]> {
    return this.getShifts();
  }

  /**
   * Get all orders (alias for getOrders)
   */
  async getAllOrders(): Promise<any[]> {
    return this.getOrders();
  }

  /**
   * Get all waste logs (alias for getWasteLogs)
   */
  async getAllWasteLogs(): Promise<any[]> {
    return this.getWasteLogs();
  }

  /**
   * Get all branches (alias for getBranches)
   */
  async getAllBranches(): Promise<any[]> {
    return this.getBranches();
  }

  /**
   * Get all delivery areas (alias for getDeliveryAreas)
   */
  async getAllDeliveryAreas(): Promise<any[]> {
    return this.getDeliveryAreas();
  }

  /**
   * Get all customers (alias for getCustomers)
   */
  async getAllCustomers(): Promise<any[]> {
    return this.getCustomers();
  }

  /**
   * Get all customer addresses (alias for getCustomerAddresses)
   */
  async getAllCustomerAddresses(): Promise<any[]> {
    return this.getCustomerAddresses();
  }

  /**
   * Get all couriers (alias for getCouriers)
   */
  async getAllCouriers(): Promise<any[]> {
    return this.getCouriers();
  }

  /**
   * Clear all cached data
   */
  async clearAllData(): Promise<void> {
    try {
      await indexedDBStorage.clearAllData();
      console.log('[LocalStorageService] All data cleared');
    } catch (error) {
      console.error('[LocalStorageService] Error clearing data:', error);
    }
  }
}

// Export singleton instance
const localStorageService = new LocalStorageService();

export function getLocalStorageService(): LocalStorageService {
  return localStorageService;
}

export { LocalStorageService };
export default localStorageService;
