# Windows VPS Deployment Guide

This guide covers deploying the Electron POS system with central server on Windows VPS.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Central Server Setup](#central-server-setup)
3. [Electron App Build](#electron-app-build)
4. [Branch Deployment](#branch-deployment)
5. [Configuration](#configuration)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Windows VPS Requirements

- **OS**: Windows Server 2019 or later, or Windows 10/11 Pro
- **RAM**: Minimum 4GB (8GB recommended for multiple branches)
- **Disk**: 50GB+ SSD
- **CPU**: 2+ cores
- **Network**: Stable internet connection
- **Ports**: Open port 3000 (or your chosen port)

### Software Requirements

1. **Node.js** (v18 or later)
   ```powershell
   # Download from: https://nodejs.org/
   # Or use Chocolatey:
   choco install nodejs
   ```

2. **PostgreSQL** (v14 or later)
   ```powershell
   # Download from: https://www.postgresql.org/download/windows/
   # Or use Chocolatey:
   choco install postgresql
   ```

3. **Git** (for code deployment)
   ```powershell
   # Download from: https://git-scm.com/download/win
   # Or use Chocolatey:
   choco install git
   ```

4. **Bun** (optional, for faster builds)
   ```powershell
   # Download from: https://bun.sh/
   # Or use npm:
   npm install -g bun
   ```

5. **PM2** (for process management)
   ```powershell
   npm install -g pm2
   npm install -g pm2-windows-startup
   pm2-startup install
   ```

---

## Central Server Setup

### Step 1: Clone Repository

```powershell
cd C:\inetpub
git clone https://github.com/your-username/your-repo.git pos-server
cd pos-server
```

### Step 2: Install Dependencies

```powershell
# Using npm
npm install

# Or using bun (faster)
bun install
```

### Step 3: Setup PostgreSQL Database

```powershell
# Open PostgreSQL shell (psql)
psql -U postgres

# Create database
CREATE DATABASE pos_central;

# Create user
CREATE USER pos_user WITH PASSWORD 'your_secure_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE pos_central TO pos_user;

# Exit
\q
```

### Step 4: Configure Environment Variables

Create `.env` file in project root:

```env
# Database
DATABASE_URL="postgresql://pos_user:your_secure_password@localhost:5432/pos_central"

# Server
NODE_ENV="production"
PORT="3000"

# Sync (for branches)
CENTRAL_SERVER_URL="https://your-domain.com"

# ETA (Egyptian Tax Authority)
ETA_ENVIRONMENT="PRODUCTION"
ETA_CLIENT_ID="your_eta_client_id"
ETA_CLIENT_SECRET="your_eta_client_secret"

# Encryption (optional, for sensitive data)
ENCRYPTION_KEY="your_32_character_encryption_key_here"
```

### Step 5: Initialize Database

```powershell
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# (Optional) Seed initial data
npm run db:seed
```

### Step 6: Build Application

```powershell
npm run build
```

### Step 7: Start Server with PM2

```powershell
# Start server
pm2 start npm --name "pos-server" -- start

# Save PM2 configuration
pm2 save

# Monitor logs
pm2 logs pos-server

# Check status
pm2 status
```

### Step 8: Configure IIS Reverse Proxy (Optional but Recommended)

If you want to use a custom domain and SSL:

1. **Install URL Rewrite Module**
   - Download from: https://www.iis.net/downloads/microsoft/url-rewrite

2. **Create reverse proxy rule**
   ```xml
   <!-- In web.config -->
   <configuration>
     <system.webServer>
       <rewrite>
         <rules>
           <rule name="ReverseProxyInboundRule1" stopProcessing="true">
             <match url="(.*)" />
             <action type="Rewrite" url="http://localhost:3000/{R:1}" />
           </rule>
         </rules>
       </rewrite>
     </system.webServer>
   </configuration>
   ```

3. **Configure SSL certificate**
   - Use Let's Encrypt with win-acme: https://www.win-acme.com/

---

## Electron App Build

### Step 1: Prepare Build Assets

Create `build` directory with app icons:

```
build/
├── icon.ico (Windows icon, 256x256)
├── icon.png (Linux icon, 512x512)
└── background.png (Installer background, optional)
```

### Step 2: Build for Windows

```powershell
# Development build (faster, for testing)
npm run electron:build

# Production Windows installer
npm run electron:build:win
```

Output will be in `dist/` directory:
- `YourPOS-Setup-x.x.x.exe` - Installer
- `YourPOS x.x.x.exe` - Portable executable

### Step 3: Test Installer

1. Copy installer to a test machine
2. Run installer
3. Verify:
   - App installs to `C:\Program Files\YourPOS\`
   - Desktop shortcut created
   - App launches successfully
   - Database created in `C:\ProgramData\YourPOS\`

---

## Branch Deployment

### Step 1: Prepare Branch Configuration

Create branch-specific configuration file:

```json
{
  "branchId": "branch-001",
  "branchName": "Main Branch",
  "kioskMode": true,
  "centralServerUrl": "https://your-domain.com",
  "adminPin": "1234"
}
```

### Step 2: Install on Branch Machine

1. **Copy installer** to branch machine
2. **Run installer** as administrator
3. **Configure branch**:
   ```powershell
   # After installation, navigate to app data
   cd "C:\ProgramData\YourPOS"
   
   # Create config.json
   notepad config.json
   ```

4. **Launch app**:
   - Double-click desktop shortcut
   - Or run from Start Menu

### Step 3: Verify Sync

1. **Check connection status**:
   - Look at status indicator in app (green = online)
   - Check logs: `C:\ProgramData\YourPOS\logs\app.log`

2. **Test manual sync**:
   - Click "Sync Now" button in app
   - Check sync status in logs

3. **Verify data flow**:
   - Create order on branch
   - Check if it appears in central server database
   - Create user on central server
   - Check if it syncs to branch

---

## Configuration

### Environment Variables (Central Server)

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `NODE_ENV` | Environment | Yes | `production` |
| `PORT` | Server port | No | `3000` |
| `CENTRAL_SERVER_URL` | Public URL for branches | Yes | - |
| `ETA_ENVIRONMENT` | ETA test/production | Yes | `TEST` |
| `ETA_CLIENT_ID` | ETA API client ID | Yes | - |
| `ETA_CLIENT_SECRET` | ETA API secret | Yes | - |
| `ENCRYPTION_KEY` | 32-char encryption key | No | - |

### Branch Configuration File

Located at `C:\ProgramData\YourPOS\config.json`:

```json
{
  "branchId": "unique-branch-id",
  "branchName": "Branch Name",
  "kioskMode": true,
  "centralServerUrl": "https://your-domain.com",
  "adminPin": "1234",
  "sync": {
    "autoSync": true,
    "syncInterval": 300000,
    "batchSize": 100,
    "maxRetries": 3
  },
  "database": {
    "path": "C:\\ProgramData\\YourPOS\\data.db",
    "backupEnabled": true,
    "backupInterval": 3600000
  }
}
```

### Kiosk Mode Settings

In `electron/main.ts`:

```typescript
const mainWindow = new BrowserWindow({
  fullscreen: true,
  kiosk: true,
  frame: false,
  alwaysOnTop: true,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true
  }
});
```

To exit kiosk mode:
- Press `Shift + Esc`
- Enter admin PIN (default: `1234`)

---

## Monitoring & Maintenance

### Central Server Monitoring

#### PM2 Commands

```powershell
# View status
pm2 status

# View logs
pm2 logs pos-server

# Restart server
pm2 restart pos-server

# Stop server
pm2 stop pos-server

# View metrics
pm2 monit
```

#### Log Files

- **Application logs**: `C:\inetpub\pos-server\logs\`
- **PM2 logs**: `C:\Users\%USER%\.pm2\logs\`
- **Windows Event Viewer**: Application logs

#### Health Check Endpoint

```powershell
# Check server health
curl https://your-domain.com/api/health

# Expected response:
# {"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

### Branch Monitoring

#### View Branch Logs

```powershell
# Navigate to logs
cd "C:\ProgramData\YourPOS\logs"

# View recent logs
Get-Content app.log -Tail 50

# View sync logs
Get-Content sync.log -Tail 50
```

#### Check Sync Status

```powershell
# From within the app, click "Sync Status"
# Or query database:
cd "C:\ProgramData\YourPOS"
sqlite3 data.db "SELECT * FROM sync_history ORDER BY startedAt DESC LIMIT 10"
```

#### Database Backups

```powershell
# Manual backup
cd "C:\ProgramData\YourPOS"
Copy-Item data.db "backup\data-$(Get-Date -Format 'yyyyMMdd-HHmmss').db"

# Scheduled backup (Task Scheduler)
# Create task to run daily at 2 AM
schtasks /create /tn "POS Database Backup" /tr "powershell -Command 'Copy-Item C:\ProgramData\YourPOS\data.db C:\Backups\POS\data-$(Get-Date -Format yyyyMMdd-HHmmss).db'" /sc daily /st 02:00
```

### Automated Monitoring (Optional)

Use tools like:
- **UptimeRobot** (free): https://uptimerobot.com/
- **Pingdom** (paid): https://www.pingdom.com/
- **New Relic** (paid): https://newrelic.com/

Configure alerts for:
- Server downtime
- High error rates
- Slow response times
- Sync failures

---

## Troubleshooting

### Common Issues

#### Issue 1: Server Won't Start

**Symptoms:**
- PM2 shows "errored" status
- Port 3000 already in use

**Solution:**
```powershell
# Check what's using port 3000
netstat -ano | findstr :3000

# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Restart server
pm2 restart pos-server
```

#### Issue 2: Database Connection Failed

**Symptoms:**
- "Database connection failed" error
- Prisma query errors

**Solution:**
```powershell
# Check PostgreSQL service
Get-Service postgresql-x64-14

# Start service if stopped
Start-Service postgresql-x64-14

# Test connection
psql -U pos_user -d pos_central

# Check DATABASE_URL in .env
```

#### Issue 3: Sync Not Working

**Symptoms:**
- Branch shows "Offline"
- Sync queue growing
- Orders not appearing on server

**Solution:**

1. **Check network connectivity**:
   ```powershell
   # From branch machine
   ping your-domain.com
   Test-NetConnection your-domain.com -Port 443
   ```

2. **Check branch logs**:
   ```powershell
   Get-Content "C:\ProgramData\YourPOS\logs\sync.log" -Tail 100
   ```

3. **Verify central server is accessible**:
   ```powershell
   curl https://your-domain.com/api/health
   ```

4. **Check sync queue**:
   ```powershell
   cd "C:\ProgramData\YourPOS"
   sqlite3 data.db "SELECT COUNT(*) FROM sync_queue"
   ```

5. **Manual sync trigger**:
   - Click "Sync Now" in app
   - Or restart app to trigger auto-sync

#### Issue 4: Kiosk Mode Can't Exit

**Symptoms:**
- Can't close app
- Alt+F4 not working

**Solution:**

1. **Use keyboard shortcut**:
   - Press `Shift + Esc`
   - Enter admin PIN

2. **Force close (if keyboard doesn't work)**:
   ```powershell
   # Find process
   Get-Process YourPOS
   
   # Kill process
   Stop-Process -Name YourPOS -Force
   ```

3. **Disable kiosk mode temporarily**:
   - Edit `C:\ProgramData\YourPOS\config.json`
   - Set `"kioskMode": false`
   - Restart app

#### Issue 5: Memory Leak

**Symptoms:**
- App becomes slow over time
- High memory usage in Task Manager

**Solution:**

1. **Restart app daily** (scheduled task):
   ```powershell
   # Create scheduled task to restart app daily at 3 AM
   schtasks /create /tn "Restart POS App" /tr "taskkill /IM YourPOS.exe /F && Start-Process 'C:\Program Files\YourPOS\YourPOS.exe'" /sc daily /st 03:00
   ```

2. **Monitor memory usage**:
   ```powershell
   # Check memory usage
   Get-Process YourPOS | Select-Object Name, CPU, WorkingSet
   ```

3. **Check for memory leaks**:
   - Review logs for repeated operations
   - Check for unclosed database connections

### Getting Help

If you encounter issues not covered here:

1. **Check logs**:
   - Central server: `C:\inetpub\pos-server\logs\`
   - Branch: `C:\ProgramData\YourPOS\logs\`

2. **Check documentation**:
   - `ELECTRON_ARCHITECTURE.md`
   - `ETA-INTEGRATION-GUIDE.md`

3. **GitHub Issues**:
   - Search existing issues: https://github.com/your-username/your-repo/issues
   - Create new issue with:
     - Error messages
     - Log files (sanitized)
     - Steps to reproduce
     - System information

---

## Security Checklist

- [ ] Change default admin PIN
- [ ] Use strong database passwords
- [ ] Enable SSL/TLS on central server
- [ ] Restrict database access to localhost
- [ ] Configure firewall rules
- [ ] Enable Windows updates
- [ ] Regular backups configured
- [ ] Monitoring alerts configured
- [ ] Review access logs regularly
- [ ] Keep dependencies updated

---

## Performance Optimization

### Central Server

1. **Enable connection pooling** (in Prisma):
   ```env
   DATABASE_URL="postgresql://user:pass@localhost:5432/db?connection_limit=10&pool_timeout=20"
   ```

2. **Enable caching**:
   - Use Redis for frequently accessed data
   - Implement API response caching

3. **Database indexing**:
   - Review slow queries
   - Add indexes as needed

### Branch App

1. **Optimize SQLite**:
   - WAL mode enabled by default
   - Regular VACUUM (maintenance)
   - Optimize batch sizes

2. **Reduce sync frequency**:
   - Increase sync interval for stable connections
   - Batch more records per sync

3. **Monitor resource usage**:
   - Keep memory usage under 500MB
   - CPU usage under 50% during normal operation

---

## Backup & Recovery

### Central Server Backup

```powershell
# Database backup
pg_dump -U pos_user pos_central > backup-$(date +%Y%m%d).sql

# Scheduled backup (Task Scheduler)
schtasks /create /tn "Central DB Backup" /tr "pg_dump -U pos_user pos_central > C:\Backups\Central\pos-central-$(Get-Date -Format yyyyMMdd).sql" /sc daily /st 01:00
```

### Branch App Backup

```powershell
# Database backup
Copy-Item "C:\ProgramData\YourPOS\data.db" "C:\Backups\Branch\data-$(Get-Date -Format yyyyMMdd-HHmmss).db"

# Config backup
Copy-Item "C:\ProgramData\YourPOS\config.json" "C:\Backups\Branch\config.json"
```

### Recovery Procedure

1. **Stop all services**:
   ```powershell
   pm2 stop pos-server
   taskkill /IM YourPOS.exe /F
   ```

2. **Restore database**:
   ```powershell
   # Central server
   psql -U pos_user pos_central < backup-20240101.sql
   
   # Branch
   Copy-Item "C:\Backups\Branch\data-20240101-120000.db" "C:\ProgramData\YourPOS\data.db"
   ```

3. **Start services**:
   ```powershell
   pm2 start pos-server
   Start-Process "C:\Program Files\YourPOS\YourPOS.exe"
   ```

4. **Verify data integrity**:
   - Check logs for errors
   - Verify sample orders exist
   - Test sync functionality

---

## Updates & Upgrades

### Central Server Update

```powershell
cd C:\inetpub\pos-server

# Stop server
pm2 stop pos-server

# Pull latest code
git pull origin main

# Install dependencies
npm install

# Run migrations
npm run db:migrate

# Rebuild
npm run build

# Start server
pm2 start pos-server
```

### Branch App Update

1. **Build new version**:
   ```powershell
   npm run electron:build:win
   ```

2. **Distribute installer**:
   - Upload to shared drive / download server
   - Email link to branch managers

3. **Update procedure**:
   - Close app (Shift + Esc, enter PIN)
   - Run new installer
   - Verify settings preserved
   - Test functionality

### Auto-Update (Future Enhancement)

Implement electron-updater for automatic updates:

```typescript
// In electron/main.ts
import { autoUpdater } from 'electron-updater';

autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-downloaded', () => {
  // Notify user and install on restart
});
```

---

## Appendix

### Useful Commands

```powershell
# Check Node.js version
node --version

# Check npm version
npm --version

# Check PostgreSQL version
psql --version

# View running processes
Get-Process

# Check disk space
Get-PSDrive C

# Check network connections
Get-NetTCPConnection

# View Windows Event Logs
Get-EventLog -LogName Application -Newest 50

# Test internet connectivity
Test-NetConnection google.com
```

### File Locations

| Component | Location |
|-----------|----------|
| Central Server | `C:\inetpub\pos-server\` |
| Central Logs | `C:\inetpub\pos-server\logs\` |
| Branch App | `C:\Program Files\YourPOS\` |
| Branch Data | `C:\ProgramData\YourPOS\` |
| Branch Logs | `C:\ProgramData\YourPOS\logs\` |
| Branch Backups | `C:\Backups\Branch\` |
| Central Backups | `C:\Backups\Central\` |
| PostgreSQL Data | `C:\Program Files\PostgreSQL\14\data\` |

### Default Ports

| Service | Port |
|---------|------|
| Central Server | 3000 |
| PostgreSQL | 5432 |
| HTTPS | 443 |
| HTTP | 80 |

### Support Contacts

- **Technical Support**: support@yourcompany.com
- **Emergency**: +20 XXX XXX XXXX
- **Documentation**: https://docs.yourcompany.com

---

**Last Updated**: 2024-01-01
**Version**: 1.0.0
