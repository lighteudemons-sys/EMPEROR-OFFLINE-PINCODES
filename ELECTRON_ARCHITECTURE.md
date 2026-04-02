# Electron Desktop POS Architecture

## Overview

This document describes the migration from web-based POS to Electron desktop application with local SQLite databases and robust sync capabilities.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     ELECTRON DESKTOP APP                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Main Process (Node.js)                                │ │
│  │  - Window management (Kiosk mode)                       │ │
│  │  - SQLite database access                              │ │
│  │  - Sync Service                                        │ │
│  │  - Connection Monitor                                  │ │
│  │  - Auto-updater                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │ IPC                              │
│  ┌───────────────────────▼──────────────────────────────┐ │
│  │  Renderer Process (React/Next.js)                     │ │
│  │  - POS Interface                                      │ │
│  │  - Reports                                            │ │
│  │  - Management UIs                                     │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Local SQLite Database (per branch)                   │ │
│  │  - Orders                                             │ │
│  │  - Shifts                                             │ │
│  │  - Business Days                                      │ │
│  │  - Menu Items                                         │ │
│  │  - Inventory                                          │ │
│  │  - Customers                                          │ │
│  │  - Users                                              │ │
│  │  - ETA Queue                                          │ │
│  └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────┬─────────────────────┘
                                        │ HTTPS (with retry)
                                        │
┌───────────────────────────────────────▼─────────────────────┐
│              CENTRAL SERVER (Windows VPS)                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Next.js API / PostgreSQL Database                    │ │
│  │  - Centralized data from all branches                 │ │
│  │  - Sync endpoints                                      │ │
│  │  - ETA integration (Egyptian Tax Authority)           │ │
│  │  - Admin dashboard                                     │ │
│  │  - Global reports                                      │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. Local SQLite Database (Per Branch)

**Location:** `C:\ProgramData\YourPOS\{branch-id}\data.db`

**Schema:** Mirrors current Prisma schema with sync additions:
- `synced` flag on all mutable records
- `syncedAt` timestamp
- `version` for conflict resolution
- `deletedAt` for soft deletes

**Benefits:**
- ✅ Zero network dependency for operations
- ✅ ACID transactions guarantee data integrity
- ✅ Instant shift and business day reports
- ✅ No race conditions
- ✅ Works offline indefinitely

### 2. Sync Service

**Architecture:**

```
Sync Service
├── Connection Monitor
│   ├── Online status detection
│   ├── Auto-reconnect with exponential backoff
│   └── Network quality monitoring
├── Upload Queue
│   ├── Pending changes tracker
│   ├── Batch upload (100 records at a time)
│   ├── Idempotency key generation
│   └── Retry with exponential backoff
├── Download Service
│   ├── Poll every 5 minutes (online)
│   ├── Manual refresh trigger
│   ├── Incremental updates (lastSyncAt)
│   └── Version conflict detection
└── Conflict Resolution
    ├── Last-write-wins (default)
    ├── Manual resolution (for critical data)
    └── Audit log for all conflicts
```

**Upload Flow:**

```typescript
1. Detect change (create/update/delete)
2. Mark record: synced = false
3. Add to upload queue
4. When online, upload in batches
5. Server validates and processes
6. Server responds with success
7. Mark record: synced = true, syncedAt = now()
8. If error, retry with exponential backoff
9. After 3 failed retries, notify admin
```

**Download Flow:**

```typescript
1. Check if online
2. Fetch updates since lastSyncAt
3. For each update:
   a. Check local version
   b. If server version > local version:
      - Apply update
      - Update local version
   c. If version conflict:
      - Use conflict resolution strategy
      - Log conflict
      - Notify admin if manual resolution needed
4. Update lastSyncAt
5. Refresh UI
```

### 3. Error Handling

**Connection Lost During Upload:**

```typescript
try {
  await uploadData(batch);
  // Success
} catch (error) {
  if (error.isNetworkError) {
    // Mark batch as pending
    // Auto-retry when connection restored
    // Exponential backoff: 5s, 10s, 20s, 40s, 60s
    // Max 3 retries before notifying admin
  }
  if (error.isValidationError) {
    // Don't retry, log error
    // Notify admin to fix data
  }
}
```

**Connection Lost During Download:**

```typescript
try {
  const updates = await fetchUpdates(lastSyncAt);
  await applyUpdates(updates);
} catch (error) {
  if (error.isNetworkError) {
    // Keep using stale data
    // Log error
    // Auto-retry on next scheduled sync
  }
  if (error.isServerError) {
    // Use cached data
    // Notify admin
  }
}
```

**Partial Failure Handling:**

```typescript
// If batch of 100 records fails at record 50:
// 1. Records 1-49: Mark synced (server confirmed)
// 2. Record 50: Log error, don't retry
// 3. Records 51-100: Keep in queue, retry later
```

### 4. Connection Monitoring

**Features:**
- Continuous ping to central server (every 30s)
- Network quality detection (latency, packet loss)
- Automatic reconnection with exponential backoff
- Offline mode indicator in UI
- Graceful degradation of features

**States:**
```
ONLINE (green)
  - Full sync enabled
  - Real-time uploads
  - Live data from server

DEGRADED (yellow)
  - Slow connection
  - Uploads throttled
  - Downloads reduced frequency

OFFLINE (red)
  - All operations work locally
  - Queue for upload when online
  - Show cached data
```

### 5. Kiosk Mode

**Configuration:**

```typescript
{
  fullscreen: true,
  kiosk: true,
  frame: false,
  alwaysOnTop: true,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    webSecurity: true
  }
}
```

**Features:**
- Full-screen, no browser UI
- Prevent closing/minimizing
- Disabled keyboard shortcuts (Ctrl+W, Alt+F4, etc.)
- Auto-restart on crash
- Password-protected exit (Shift+Esc, then admin PIN)

### 6. ETA Integration

**Local Queue:**
```typescript
// Orders are created locally with ETA status: PENDING
// Synced to central server
// Central server submits to ETA
// Status updated and synced back to branch

Order {
  etaUUID: "local-generated-uuid",
  etaSubmissionStatus: "PENDING", // PENDING, SUBMITTED, ACCEPTED, REJECTED
  synced: false
}
```

**Flow:**
```
Branch (Local SQLite)
  1. Create order with etaUUID
  2. Mark synced = false
  3. Add to sync queue

Sync Service (Upload)
  4. Upload order to central server
  5. Mark synced = true (upload succeeded)

Central Server
  6. Receive order
  7. Queue for ETA submission
  8. Submit to Egyptian Tax Authority
  9. Update etaSubmissionStatus

Sync Service (Download)
  10. Fetch updates from server
  11. Update local etaSubmissionStatus
  12. Branch shows ETA status
```

## Data Models

### Sync-Enabled Models

All mutable models have these fields:

```typescript
{
  id: string,
  // ... existing fields ...
  synced: boolean = false,
  syncedAt: DateTime | null,
  version: number = 1,
  deletedAt: DateTime | null  // soft delete
}
```

### Sync Queue Table

```sql
CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  operation TEXT NOT NULL, -- CREATE, UPDATE, DELETE
  payload TEXT NOT NULL,    -- JSON
  retryCount INTEGER DEFAULT 0,
  lastError TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  nextRetryAt DATETIME
);

CREATE INDEX idx_sync_queue_entity ON sync_queue(entityType, entityId);
CREATE INDEX idx_sync_queue_retry ON sync_queue(nextRetryAt);
```

### Sync History Table

```sql
CREATE TABLE sync_history (
  id TEXT PRIMARY KEY,
  syncType TEXT NOT NULL, -- UPLOAD, DOWNLOAD
  direction TEXT NOT NULL, -- TO_SERVER, FROM_SERVER
  recordCount INTEGER,
  status TEXT NOT NULL, -- SUCCESS, PARTIAL, FAILED
  startedAt DATETIME NOT NULL,
  completedAt DATETIME,
  errorDetails TEXT
);

CREATE INDEX idx_sync_history_started ON sync_history(startedAt);
```

## API Endpoints (Central Server)

### Sync Endpoints

**POST /api/sync/upload**
- Receives batch of changes from branch
- Validates and applies to central database
- Returns success/failure for each record
- Handles idempotency keys

**GET /api/sync/download**
- Returns updates since lastSyncAt
- Paginated (100 records per page)
- Includes version information

**POST /api/sync/conflict/resolve**
- Manual conflict resolution
- Admin only

**GET /api/sync/status**
- Current sync status
- Pending uploads count
- Last sync timestamp
- Connection status

### Existing Endpoints (Keep Working)

All existing API endpoints remain unchanged:
- Orders, shifts, business days
- Inventory, menu items
- Customers, users
- Reports
- ETA integration

## Deployment

### Electron Build

```bash
# Development
bun run dev:electron

# Production build
bun run build:electron
# Outputs: dist/YourPOS-Setup-x.x.x.exe

# Installation on Windows
# - Run installer
# - Configured for: C:\ProgramData\YourPOS\
# - Auto-start on boot (optional)
# - Creates desktop shortcut
```

### Central Server Deployment (Windows VPS)

```bash
# Requirements:
# - Node.js 18+
# - PostgreSQL 14+
# - IIS or Nginx (reverse proxy)
# - SSL certificate

# Deploy Next.js app:
git pull
bun install
bun run build
bun run start:production

# Or use PM2:
pm2 start npm --name "pos-server" -- start
```

## Migration Strategy

### Phase 1: Electron Wrapper (No Breaking Changes)
1. Add Electron dependencies
2. Create main process
3. Wrap existing Next.js app
4. Test on development machine

### Phase 2: Local SQLite
1. Install Better-SQLite3
2. Create schema from Prisma
3. Migrate existing data (optional)
4. Test local operations

### Phase 3: Sync Service
1. Create sync queue system
2. Implement upload logic
3. Implement download logic
4. Test online/offline scenarios

### Phase 4: Central Server
1. Deploy to Windows VPS
2. Configure PostgreSQL
3. Test sync with multiple branches
4. Monitor and optimize

### Phase 5: Production Rollout
1. Backup existing data
2. Install Electron app on one branch
3. Monitor for 1 week
4. Roll out to all branches

## Error Scenarios & Solutions

### Scenario 1: Connection Lost During Order Creation

**Problem:** User creates order while offline, then goes online during sync

**Solution:**
1. Order saved locally with `synced = false`
2. When online, automatically uploaded
3. If order number conflicts, server assigns new number
4. Local order number updated
5. Shift totals recalculated

### Scenario 2: Two Branches Update Same Customer

**Problem:** Branch A and Branch B update same customer simultaneously

**Solution:**
1. Both branches upload updates
2. Server uses version numbers
3. Higher version wins (last-write-wins)
4. Conflict logged
5. Lower version branch downloads winning version
6. Admin notified of conflict

### Scenario 3: Order Refunded While Syncing

**Problem:** Order refunded at branch while syncing to server

**Solution:**
1. Refund saved locally with `synced = false`
2. Original order may be `synced = false` or `synced = true`
3. If both unsynced: upload together
4. If original synced, refund unsynced: upload refund separately
5. Server handles order of operations

### Scenario 4: Shift Closed While Offline

**Problem:** Shift closed at branch while offline, then synced

**Solution:**
1. Shift closed locally with all orders
2. Shift totals calculated locally (accurate)
3. When online, shift and orders uploaded together
4. Server recalculates totals (should match)
5. If mismatch, create sync conflict for admin review

### Scenario 5: ETA Submission Fails

**Problem:** Order submitted to ETA, but ETA rejects

**Solution:**
1. Local status: `etaSubmissionStatus = "REJECTED"`
2. Error details saved locally
3. Synced to central server
4. Admin alerted
5. Admin can retry after fixing issue
6. Retry generates new Credit Note if needed

## Performance Considerations

### Local SQLite Performance
- Index on all foreign keys
- Index on `synced`, `syncedAt`, `version`
- WAL mode for concurrent reads/writes
- Regular VACUUM (weekly)
- Backup before schema changes

### Sync Performance
- Batch uploads: 100 records per request
- Compress payload with gzip
- Use HTTP/2 for multiplexing
- Differential sync (only changed fields)
- Throttle downloads on slow connections

### Memory Management
- Limit sync queue size (10,000 records max)
- Prune old sync history (keep 90 days)
- Lazy load large datasets
- Dispose of unused resources

## Security

### Local Database
- Encrypted with SQLCipher (optional)
- File permissions: Only SYSTEM and app user
- Backup encryption with AES-256

### Network Security
- HTTPS/TLS 1.3
- Certificate pinning
- API keys stored in OS keychain
- Request signing with HMAC

### App Security
- Code signing (Windows)
- Auto-update verification
- No native modules with vulnerabilities
- Regular dependency audits

## Monitoring & Logging

### Local Logs
- Located: `C:\ProgramData\YourPOS\logs\`
- Files: `app.log`, `sync.log`, `error.log`
- Rotation: Daily, keep 30 days
- Upload errors to central server (when online)

### Central Server Logs
- All sync operations logged
- Failed syncs alerted
- Performance metrics tracked
- Error aggregation with Sentry/LogRocket

### Monitoring Dashboards
- Sync success rate
- Average sync latency
- Pending upload count
- Offline time per branch
- ETA submission status

## Rollback Plan

If issues occur after deployment:

1. **Immediate:** Switch back to web app (update DNS)
2. **Data Recovery:** Export local SQLite to CSV, import to cloud
3. **Manual Sync:** Admin manually reconciles differences
4. **Root Cause:** Analyze logs, fix issue
5. **Re-deploy:** After fix, deploy updated version

## Success Criteria

- ✅ All POS operations work offline
- ✅ Shift and business day reports are always accurate
- ✅ Sync works reliably (99.9% success rate)
- ✅ No data loss during sync failures
- ✅ ETA integration works seamlessly
- ✅ App restarts automatically on crash
- ✅ Updates deployed without user intervention
- ✅ Kiosk mode prevents unauthorized exit
