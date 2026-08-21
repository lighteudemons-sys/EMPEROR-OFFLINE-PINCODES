import Database from 'better-sqlite3';

export interface SyncOptions {
  db: Database.Database;
  serverUrl: string;
  branchId: string;
  onSyncProgress?: (progress: SyncProgress) => void;
  onSyncError?: (error: SyncError) => void;
}

export interface SyncProgress {
  phase: 'upload' | 'download' | 'idle';
  total: number;
  completed: number;
  currentOperation?: string;
  errors: number;
}

export interface SyncError {
  phase: 'upload' | 'download';
  operation: string;
  error: string;
  retryable: boolean;
}

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  errors: number;
  duration: number;
  errorDetails?: string;
}

export interface SyncStatus {
  pendingUploads: number;
  lastSyncAt: Date | null;
  lastUploadAt: Date | null;
  lastDownloadAt: Date | null;
  isSyncing: boolean;
}

export class SyncService {
  private db: Database.Database;
  private serverUrl: string;
  private branchId: string;
  private onSyncProgress?: (progress: SyncProgress) => void;
  private onSyncError?: (error: SyncError) => void;
  private isSyncing: boolean = false;
  private abortController: AbortController | null = null;

  constructor(options: SyncOptions) {
    this.db = options.db;
    this.serverUrl = options.serverUrl;
    this.branchId = options.branchId;
    this.onSyncProgress = options.onSyncProgress;
    this.onSyncError = options.onSyncError;
  }

  /**
   * Perform full sync (upload then download)
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    this.abortController = new AbortController();
    const startTime = Date.now();

    let uploaded = 0;
    let downloaded = 0;
    let errors = 0;
    let errorDetails: string[] = [];

    try {
      // Phase 1: Upload pending changes
      this.reportProgress('upload', 0, 0, 'Starting upload...');
      
      const uploadResult = await this.uploadPendingChanges();
      uploaded = uploadResult.uploaded;
      errors += uploadResult.errors;
      errorDetails.push(...uploadResult.errorDetails);

      // Phase 2: Download updates from server
      this.reportProgress('download', 0, 0, 'Starting download...');
      
      const downloadResult = await this.downloadUpdates();
      downloaded = downloadResult.downloaded;
      errors += downloadResult.errors;
      errorDetails.push(...downloadResult.errorDetails);

      // Update last sync time
      this.updateLastSyncTime();

      const duration = Date.now() - startTime;

      this.reportProgress('idle', 1, 1, 'Sync completed');

      return {
        success: errors === 0,
        uploaded,
        downloaded,
        errors,
        duration,
        errorDetails: errorDetails.length > 0 ? errorDetails.join('; ') : undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.reportError('download', 'sync', errorMessage, false);
      
      return {
        success: false,
        uploaded,
        downloaded,
        errors: errors + 1,
        duration: Date.now() - startTime,
        errorDetails: errorMessage
      };
    } finally {
      this.isSyncing = false;
      this.abortController = null;
    }
  }

  /**
   * Upload pending changes to server
   */
  private async uploadPendingChanges(): Promise<{ uploaded: number; errors: number; errorDetails: string[] }> {
    let uploaded = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Get pending records from sync queue
    const pendingRecords = this.getPendingRecords();
    const total = pendingRecords.length;

    if (total === 0) {
      this.reportProgress('upload', 1, 1, 'No pending uploads');
      return { uploaded: 0, errors: 0, errorDetails: [] };
    }

    // Process in batches of 100
    const batchSize = 100;
    for (let i = 0; i < pendingRecords.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Sync aborted');
      }

      const batch = pendingRecords.slice(i, i + batchSize);
      
      try {
        const result = await this.uploadBatch(batch);
        uploaded += result.successCount;
        errors += result.errorCount;
        errorDetails.push(...result.errorDetails);

        // Mark successfully uploaded records as synced
        result.successIds.forEach(id => {
          this.markAsSynced(batch.find(r => r.id === id)?.entityType || '', id);
        });

        // Remove successfully synced items from queue
        result.successIds.forEach(id => {
          this.removeFromQueue(id);
        });

        // Update retry count for failed records
        result.failedIds.forEach(id => {
          this.updateRetryCount(id, batch.find(r => r.id === id)?.entityType || '');
        });

        this.reportProgress(
          'upload',
          Math.min(i + batchSize, total),
          total,
          `Uploading: ${Math.min(i + batchSize, total)} / ${total}`
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors += batch.length;
        errorDetails.push(errorMessage);
        this.reportError('upload', 'batch_upload', errorMessage, true);
      }
    }

    return { uploaded, errors, errorDetails };
  }

  /**
   * Download updates from server
   */
  private async downloadUpdates(): Promise<{ downloaded: number; errors: number; errorDetails: string[] }> {
    let downloaded = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    try {
      // Get last sync time
      const lastSyncAt = this.getLastSyncTime();

      // Fetch updates from server
      const updates = await this.fetchUpdates(lastSyncAt);
      const total = updates.length;

      if (total === 0) {
        this.reportProgress('download', 1, 1, 'No updates available');
        return { downloaded: 0, errors: 0, errorDetails: [] };
      }

      // Apply updates
      for (let i = 0; i < updates.length; i++) {
        if (this.abortController?.signal.aborted) {
          throw new Error('Sync aborted');
        }

        const update = updates[i];
        
        try {
          this.applyUpdate(update);
          downloaded++;

          this.reportProgress(
            'download',
            i + 1,
            total,
            `Downloading: ${i + 1} / ${total}`
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors++;
          errorDetails.push(`Failed to apply update ${update.entityType}:${update.entityId}: ${errorMessage}`);
          this.reportError('download', 'apply_update', errorMessage, false);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors++;
      errorDetails.push(`Download failed: ${errorMessage}`);
      this.reportError('download', 'fetch_updates', errorMessage, true);
    }

    return { downloaded, errors, errorDetails };
  }

  /**
   * Get pending records from sync queue
   */
  private getPendingRecords(): Array<{ id: string; entityType: string; operation: string; payload: string; retryCount: number }> {
    const query = `
      SELECT id, entityType, entityId, operation, payload, retryCount
      FROM sync_queue
      WHERE nextRetryAt <= datetime('now')
      ORDER BY createdAt ASC
      LIMIT 1000
    `;
    
    return this.db.prepare(query).all() as any[];
  }

  /**
   * Upload batch of records to server
   */
  private async uploadBatch(batch: Array<any>): Promise<{ successCount: number; errorCount: number; successIds: string[]; failedIds: string[]; errorDetails: string[] }> {
    const successIds: string[] = [];
    const failedIds: string[] = [];
    const errorDetails: string[] = [];

    try {
      const response = await fetch(`${this.serverUrl}/api/sync/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branchId: this.branchId,
          records: batch.map(r => ({
            entityType: r.entityType,
            entityId: r.entityId,
            operation: r.operation,
            payload: JSON.parse(r.payload),
            retryCount: r.retryCount
          }))
        }),
        signal: this.abortController?.signal
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        result.results?.forEach((r: any) => {
          if (r.success) {
            successIds.push(r.entityId);
          } else {
            failedIds.push(r.entityId);
            if (r.error) {
              errorDetails.push(`${r.entityType}:${r.entityId} - ${r.error}`);
            }
          }
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Mark all as failed on network error
      batch.forEach(r => failedIds.push(r.id));
      errorDetails.push(`Batch upload failed: ${errorMessage}`);
    }

    return {
      successCount: successIds.length,
      errorCount: failedIds.length,
      successIds,
      failedIds,
      errorDetails
    };
  }

  /**
   * Fetch updates from server
   */
  private async fetchUpdates(lastSyncAt: Date | null): Promise<Array<{ entityType: string; entityId: string; operation: string; data: any; version: number }>> {
    const params = new URLSearchParams({
      branchId: this.branchId,
      since: lastSyncAt ? lastSyncAt.toISOString() : ''
    });

    const response = await fetch(`${this.serverUrl}/api/sync/download?${params}`, {
      signal: this.abortController?.signal
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch updates: ${response.status}`);
    }

    const result = await response.json();
    return result.updates || [];
  }

  /**
   * Apply update to local database
   */
  private applyUpdate(update: { entityType: string; entityId: string; operation: string; data: any; version: number }): void {
    const { entityType, operation, data, version } = update;

    // Check version conflict
    const existingRecord = this.getRecord(entityType, data.id);
    if (existingRecord && existingRecord.version >= version) {
      // Skip update, we have a newer or equal version
      console.log(`Skipping update for ${entityType}:${data.id}, version ${version} <= ${existingRecord.version}`);
      return;
    }

    switch (operation) {
      case 'CREATE':
      case 'UPDATE':
        this.upsertRecord(entityType, data);
        break;
      case 'DELETE':
        this.softDeleteRecord(entityType, data.id);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Get record from database
   */
  private getRecord(entityType: string, id: string): any {
    const tableName = this.getTableName(entityType);
    const query = `SELECT * FROM ${tableName} WHERE id = ? AND deletedAt IS NULL`;
    return this.db.prepare(query).get(id);
  }

  /**
   * Upsert record into database
   */
  private upsertRecord(entityType: string, data: any): void {
    const tableName = this.getTableName(entityType);
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);

    const query = `
      INSERT INTO ${tableName} (${columns})
      VALUES (${placeholders})
      ON CONFLICT(id) DO UPDATE SET
        ${Object.keys(data).filter(k => k !== 'id').map(k => `${k} = excluded.${k}`).join(', ')}
    `;

    this.db.prepare(query).run(...values);
  }

  /**
   * Soft delete record
   */
  private softDeleteRecord(entityType: string, id: string): void {
    const tableName = this.getTableName(entityType);
    const query = `UPDATE ${tableName} SET deletedAt = datetime('now') WHERE id = ?`;
    this.db.prepare(query).run(id);
  }

  /**
   * Mark record as synced
   */
  private markAsSynced(entityType: string, id: string): void {
    const tableName = this.getTableName(entityType);
    const query = `UPDATE ${tableName} SET synced = 1, syncedAt = datetime('now') WHERE id = ?`;
    this.db.prepare(query).run(id);
  }

  /**
   * Remove from sync queue
   */
  private removeFromQueue(id: string): void {
    const query = `DELETE FROM sync_queue WHERE id = ?`;
    this.db.prepare(query).run(id);
  }

  /**
   * Update retry count for failed record
   */
  private updateRetryCount(id: string, entityType: string): void {
    const record = this.db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(id) as any;
    
    if (record) {
      const newRetryCount = (record.retryCount || 0) + 1;
      
      if (newRetryCount >= 3) {
        // Max retries reached, log error and keep in queue for manual review
        this.logSyncError(entityType, record.entityId, 'Max retries reached');
      }

      // Calculate next retry time with exponential backoff (5s, 10s, 20s, 40s, 60s max)
      const backoffSeconds = Math.min(Math.pow(2, newRetryCount) * 5, 60);
      const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

      this.db.prepare(`
        UPDATE sync_queue
        SET retryCount = ?, nextRetryAt = ?
        WHERE id = ?
      `).run(newRetryCount, nextRetryAt, id);
    }
  }

  /**
   * Log sync error
   */
  private logSyncError(entityType: string, entityId: string, error: string): void {
    const query = `
      INSERT INTO sync_history (syncType, direction, recordCount, status, startedAt, completedAt, errorDetails)
      VALUES ('ERROR', 'UPLOAD', 0, 'FAILED', datetime('now'), datetime('now'), ?)
    `;
    this.db.prepare(query).run(`${entityType}:${entityId} - ${error}`);
  }

  /**
   * Get table name from entity type
   */
  private getTableName(entityType: string): string {
    const tableMap: Record<string, string> = {
      'User': 'users',
      'Branch': 'branches',
      'Order': 'orders',
      'OrderItem': 'order_items',
      'Shift': 'shifts',
      'BusinessDay': 'business_days',
      'Customer': 'customers',
      'CustomerAddress': 'customer_addresses',
      'MenuItem': 'menu_items',
      'Category': 'categories',
      'BranchInventory': 'branch_inventory',
      'Ingredient': 'ingredients',
      'DailyExpense': 'daily_expenses',
      'Promotion': 'promotions',
      'PromoCode': 'promo_codes',
      'Notification': 'notifications',
      'Table': 'tables',
      'Courier': 'couriers',
      'DeliveryArea': 'delivery_areas',
      'BranchETASettings': 'branch_eta_settings',
      'VoidedItem': 'voided_items'
    };

    return tableMap[entityType] || entityType.toLowerCase();
  }

  /**
   * Get last sync time
   */
  private getLastSyncTime(): Date | null {
    const result = this.db.prepare('SELECT value FROM config WHERE key = ?').get('lastSyncAt') as any;
    if (result && result.value) {
      return new Date(result.value);
    }
    return null;
  }

  /**
   * Update last sync time
   */
  private updateLastSyncTime(): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO config (key, value, updatedAt) 
      VALUES ('lastSyncAt', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = datetime('now')
    `).run(now, now);
  }

  /**
   * Report sync progress
   */
  private reportProgress(phase: 'upload' | 'download' | 'idle', completed: number, total: number, currentOperation?: string): void {
    this.onSyncProgress?.({
      phase,
      total,
      completed,
      currentOperation,
      errors: 0
    });
  }

  /**
   * Report sync error
   */
  private reportError(phase: 'upload' | 'download', operation: string, error: string, retryable: boolean): void {
    this.onSyncError?.({
      phase,
      operation,
      error,
      retryable
    });
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    const pendingCount = this.db.prepare('SELECT COUNT(*) as count FROM sync_queue WHERE nextRetryAt <= datetime("now")').get() as { count: number };
    const lastSyncResult = this.db.prepare('SELECT value FROM config WHERE key = ?').get('lastSyncAt') as any;
    
    return {
      pendingUploads: pendingCount.count,
      lastSyncAt: lastSyncResult?.value ? new Date(lastSyncResult.value) : null,
      lastUploadAt: null, // TODO: Track separately
      lastDownloadAt: null, // TODO: Track separately
      isSyncing: this.isSyncing
    };
  }

  /**
   * Abort current sync
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Queue a change for sync
   */
  queueChange(entityType: string, entityId: string, operation: 'CREATE' | 'UPDATE' | 'DELETE', data: any): void {
    const id = `${entityType}-${entityId}-${Date.now()}`;
    const payload = JSON.stringify(data);

    // Check if already in queue
    const existing = this.db.prepare('SELECT * FROM sync_queue WHERE entityType = ? AND entityId = ?').get(entityType, entityId);
    
    if (existing) {
      // Update existing queue entry
      this.db.prepare(`
        UPDATE sync_queue
        SET operation = ?, payload = ?, retryCount = 0, nextRetryAt = datetime('now')
        WHERE entityType = ? AND entityId = ?
      `).run(operation, payload, entityType, entityId);
    } else {
      // Insert new queue entry
      this.db.prepare(`
        INSERT INTO sync_queue (id, entityType, entityId, operation, payload, retryCount, nextRetryAt)
        VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
      `).run(id, entityType, entityId, operation, payload);
    }

    // Mark local record as not synced
    const tableName = this.getTableName(entityType);
    if (operation !== 'DELETE') {
      this.db.prepare(`UPDATE ${tableName} SET synced = 0, syncedAt = NULL WHERE id = ?`).run(entityId);
    }
  }
}
