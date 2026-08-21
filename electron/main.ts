import { app, BrowserWindow, ipcMain, screen, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { initializeDatabase, getDatabase } from './database';
import { SyncService } from './sync-service';
import { ConnectionMonitor } from './connection-monitor';

let mainWindow: BrowserWindow | null = null;
let syncService: SyncService | null = null;
let connectionMonitor: ConnectionMonitor | null = null;
let isKioskMode = false;
let exitPin = '1234'; // Default admin PIN for kiosk exit

// App data directory
const getAppDataPath = () => {
  const appDataPath = path.join(
    process.env.APPDATA || process.env.HOME || '',
    'YourPOS'
  );

  // Create directory if it doesn't exist
  if (!fs.existsSync(appDataPath)) {
    fs.mkdirSync(appDataPath, { recursive: true });
  }

  return appDataPath;
};

// Logs directory
const getLogsPath = () => {
  const logsPath = path.join(getAppDataPath(), 'logs');
  if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath, { recursive: true });
  }
  return logsPath;
};

// Logger
const log = (level: 'info' | 'error' | 'warn', message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}\n`;

  console.log(logEntry);

  // Write to log file
  const logFile = path.join(getLogsPath(), 'app.log');
  fs.appendFileSync(logFile, logEntry);
};

// Initialize application
const initializeApp = async () => {
  try {
    log('info', 'Initializing YourPOS application...');

    // Initialize database
    const dbPath = path.join(getAppDataPath(), 'data.db');
    log('info', 'Initializing database at', { dbPath });
    await initializeDatabase(dbPath);

    // Get branch configuration
    const db = getDatabase();
    const branchConfig = db.prepare('SELECT * FROM config WHERE key = ?').get('branch');
    log('info', 'Branch config loaded', branchConfig);

    // Check if kiosk mode is enabled
    isKioskMode = process.env.KIOSK_MODE === 'true' || (branchConfig as any)?.value?.kioskMode === true;
    log('info', 'Kiosk mode', { enabled: isKioskMode });

    // Initialize connection monitor
    connectionMonitor = new ConnectionMonitor({
      serverUrl: process.env.CENTRAL_SERVER_URL || 'https://yourserver.com',
      pingInterval: 30000, // 30 seconds
      onStatusChange: (status) => {
        log('info', 'Connection status changed', { status });
        if (mainWindow) {
          mainWindow.webContents.send('connection-status', status);
        }
      }
    });

    // Initialize sync service
    syncService = new SyncService({
      db,
      serverUrl: process.env.CENTRAL_SERVER_URL || 'https://yourserver.com',
      branchId: (branchConfig as any)?.value?.id || 'default',
      onSyncProgress: (progress) => {
        if (mainWindow) {
          mainWindow.webContents.send('sync-progress', progress);
        }
      },
      onSyncError: (error) => {
        log('error', 'Sync error', error);
        if (mainWindow) {
          mainWindow.webContents.send('sync-error', error);
        }
      }
    });

    log('info', 'Application initialized successfully');
  } catch (error) {
    log('error', 'Failed to initialize application', error);
    throw error;
  }
};

// Create main window
const createWindow = () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: isKioskMode ? width : 1400,
    height: isKioskMode ? height : 900,
    fullscreen: isKioskMode,
    kiosk: isKioskMode,
    frame: !isKioskMode,
    alwaysOnTop: isKioskMode,
    resizable: !isKioskMode,
    movable: !isKioskMode,
    minimizable: !isKioskMode,
    maximizable: !isKioskMode,
    closable: !isKioskMode,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true
    },
    title: 'YourPOS - Point of Sale System',
    icon: path.join(__dirname, '../build/icon.png')
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../.next/standalone/server.js'));
  }

  // Handle window close
  mainWindow.on('close', (e) => {
    if (isKioskMode) {
      e.preventDefault();
      // Show PIN dialog for kiosk exit
      mainWindow?.webContents.send('request-exit-pin');
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent navigation away from app
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const allowedUrls = [
      'http://localhost:3000',
      'file://'
    ];
    const isAllowed = allowedUrls.some(allowed => url.startsWith(allowed));
    if (!isAllowed) {
      e.preventDefault();
    }
  });

  log('info', 'Main window created');
};

// App event handlers
app.whenReady().then(async () => {
  try {
    await initializeApp();
    createWindow();

    // Start connection monitoring
    connectionMonitor?.start();

    // Start periodic sync (every 5 minutes when online)
    setInterval(() => {
      if (connectionMonitor?.isOnline() && syncService) {
        syncService.sync().catch(error => {
          log('error', 'Periodic sync failed', error);
        });
      }
    }, 5 * 60 * 1000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    log('error', 'Failed to start app', error);
    dialog.showErrorBox('Startup Error', 'Failed to initialize the application. Please check the logs.');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  log('info', 'Application shutting down...');

  // Stop connection monitoring
  connectionMonitor?.stop();

  // Final sync before quitting
  if (connectionMonitor?.isOnline() && syncService) {
    try {
      log('info', 'Performing final sync before shutdown...');
      await syncService.sync();
      log('info', 'Final sync completed');
    } catch (error) {
      log('error', 'Final sync failed', error);
    }
  }

  // Close database
  const db = getDatabase();
  if (db) {
    db.close();
    log('info', 'Database closed');
  }
});

// IPC Handlers

// Get app info
ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  isKioskMode,
  appDataPath: getAppDataPath(),
  logsPath: getLogsPath()
}));

// Get connection status
ipcMain.handle('get-connection-status', () => ({
  isOnline: connectionMonitor?.isOnline() || false,
  lastCheck: connectionMonitor?.getLastCheck() || null,
  quality: connectionMonitor?.getQuality() || 'unknown'
}));

// Manual sync trigger
ipcMain.handle('trigger-sync', async () => {
  if (!syncService) {
    throw new Error('Sync service not initialized');
  }
  return await syncService.sync();
});

// Get sync status
ipcMain.handle('get-sync-status', () => {
  if (!syncService) {
    return null;
  }
  return syncService.getStatus();
});

// Verify exit PIN for kiosk mode
ipcMain.handle('verify-exit-pin', async (_event, pin: string) => {
  return pin === exitPin;
});

// Exit app (after PIN verification)
ipcMain.handle('exit-app', () => {
  app.quit();
});

// Database operations via IPC
ipcMain.handle('db-query', async (_event, query: string, params: any[] = []) => {
  const db = getDatabase();
  try {
    const stmt = db.prepare(query);
    const result = stmt.all(...params);
    return { success: true, data: result };
  } catch (error) {
    log('error', 'Database query failed', { query, params, error });
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('db-run', async (_event, query: string, params: any[] = []) => {
  const db = getDatabase();
  try {
    const stmt = db.prepare(query);
    const result = stmt.run(...params);
    return { success: true, data: result };
  } catch (error) {
    log('error', 'Database run failed', { query, params, error });
    return { success: false, error: (error as Error).message };
  }
});

// Get logs
ipcMain.handle('get-logs', async (_event, lines: number = 100) => {
  const logFile = path.join(getLogsPath(), 'app.log');
  try {
    const content = fs.readFileSync(logFile, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(-lines).join('\n');
  } catch (error) {
    log('error', 'Failed to read logs', error);
    return '';
  }
});

// Export data
ipcMain.handle('export-data', async (_event, type: string) => {
  const db = getDatabase();
  try {
    let query = '';
    switch (type) {
      case 'orders':
        query = 'SELECT * FROM orders WHERE deletedAt IS NULL';
        break;
      case 'shifts':
        query = 'SELECT * FROM shifts WHERE deletedAt IS NULL';
        break;
      case 'inventory':
        query = 'SELECT * FROM branch_inventory WHERE deletedAt IS NULL';
        break;
      default:
        throw new Error(`Unknown export type: ${type}`);
    }

    const stmt = db.prepare(query);
    const data = stmt.all();

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportPath = path.join(getAppDataPath(), `export-${type}-${timestamp}.json`);
    fs.writeFileSync(exportPath, JSON.stringify(data, null, 2));

    log('info', 'Data exported', { type, path: exportPath, count: data.length });
    return { success: true, path: exportPath, count: data.length };
  } catch (error) {
    log('error', 'Export failed', { type, error });
    return { success: false, error: (error as Error).message };
  }
});

// Error handling
process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception', error);
  dialog.showErrorBox('Uncaught Exception', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', 'Unhandled rejection', { reason, promise });
});
