import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Connection status
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
  onConnectionStatus: (callback: (status: any) => void) => {
    ipcRenderer.on('connection-status', (_event, status) => callback(status));
  },

  // Sync operations
  triggerSync: () => ipcRenderer.invoke('trigger-sync'),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  onSyncProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('sync-progress', (_event, progress) => callback(progress));
  },
  onSyncError: (callback: (error: any) => void) => {
    ipcRenderer.on('sync-error', (_event, error) => callback(error));
  },

  // Kiosk mode
  verifyExitPin: (pin: string) => ipcRenderer.invoke('verify-exit-pin', pin),
  onRequestExitPin: (callback: () => void) => {
    ipcRenderer.on('request-exit-pin', () => callback());
  },
  exitApp: () => ipcRenderer.invoke('exit-app'),

  // Database operations (read-only for renderer)
  dbQuery: (query: string, params?: any[]) => ipcRenderer.invoke('db-query', query, params),

  // Logs
  getLogs: (lines?: number) => ipcRenderer.invoke('get-logs', lines),

  // Export
  exportData: (type: string) => ipcRenderer.invoke('export-data', type)
});

// TypeScript type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getAppInfo: () => Promise<any>;
      getConnectionStatus: () => Promise<any>;
      onConnectionStatus: (callback: (status: any) => void) => void;
      triggerSync: () => Promise<any>;
      getSyncStatus: () => Promise<any>;
      onSyncProgress: (callback: (progress: any) => void) => void;
      onSyncError: (callback: (error: any) => void) => void;
      verifyExitPin: (pin: string) => Promise<boolean>;
      onRequestExitPin: (callback: () => void) => void;
      exitApp: () => Promise<void>;
      dbQuery: (query: string, params?: any[]) => Promise<any>;
      getLogs: (lines?: number) => Promise<string>;
      exportData: (type: string) => Promise<any>;
    };
  }
}
