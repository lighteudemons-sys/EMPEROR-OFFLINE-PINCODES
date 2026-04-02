# Electron Migration Guide
## Step-by-Step Guide to Migrate to Desktop App Without Losing Data

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Pre-Migration Backup](#pre-migration-backup)
4. [Migration Strategy](#migration-strategy)
5. [Step 1: Prepare Central Server](#step-1-prepare-central-server)
6. [Step 2: Build Electron Application](#step-2-build-electron-application)
7. [Step 3: Configure Branch Installations](#step-3-configure-branch-installations)
8. [Step 4: Deploy to Branches](#step-4-deploy-to-branches)
9. [Step 5: Initial Sync](#step-5-initial-sync)
10. [Step 6: Verification](#step-6-verification)
11. [Rollback Plan](#rollback-plan)
12. [Troubleshooting](#troubleshooting)

---

## Overview

This guide will help you migrate from the web-based POS system to the Electron desktop application **without losing any existing data** (branches, users, orders, inventory, etc.).

### Migration Approach

**Hybrid Approach (Recommended):**
- Central Server: Runs the Next.js web app on Windows VPS (acts as data hub)
- Branch Desktop Apps: Electron apps with local SQLite databases
- Data Sync: Automatic bidirectional sync between branches and central server

### Benefits

✅ **Zero Data Loss** - All data synced to central server first
✅ **Offline Capability** - Each branch works independently
✅ **Smooth Transition** - Can switch back to web if needed
✅ **No Downtime** - Branches can migrate one at a time

---

## Prerequisites

### Hardware Requirements

**Central Server (Windows VPS):**
- Windows Server 2016 or later
- 4GB RAM minimum (8GB recommended)
- 50GB storage minimum
- Stable internet connection
- Static IP or domain name

**Branch Desktops:**
- Windows 10/11
- 4GB RAM minimum
- 20GB free disk space
- Internet connection (for sync)

### Software Requirements

- Node.js 20+ (LTS)
- PostgreSQL 14+ (central server)
- Git
- Visual Studio Code (recommended)
- Administrative access to all machines

### Access Required

- Admin access to Windows VPS
- Admin access to branch computers
- Database credentials (Neon for testing, PostgreSQL for production)
- GitHub repository access
- SSL certificate (for production)

---

## Pre-Migration Backup

### ⚠️ CRITICAL: Complete Backup Before Starting

```bash
# 1. Backup the PostgreSQL/Neon database
pg_dump -h <host> -U <user> -d <database> > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Backup the codebase
git clone <your-repo> backup_$(date +%Y%m%d_%H%M%S)

# 3. Document current data
# Log into your database and run:
SELECT COUNT(*) FROM branches;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM orders;
SELECT COUNT(*) FROM menuItems;
SELECT COUNT(*) FROM ingredients;

# 4. Record current app version
cat package.json | grep version
```

### Backup Checklist

- [ ] Database backup created and verified
- [ ] Codebase backup created
- [ ] Data counts recorded
- [ ] App version documented
- [ ] All branches and users listed
- [ ] Current settings documented (ETA, receipts, etc.)

---

## Migration Strategy

### Three-Phase Approach

**Phase 1: Setup & Testing** (1-2 days)
- Deploy central server
- Build Electron app
- Test with sample data

**Phase 2: Pilot Migration** (3-5 days)
- Migrate one branch as pilot
- Monitor and fix issues
- Document lessons learned

**Phase 3: Full Rollout** (1-2 weeks)
- Migrate remaining branches
- Monitor all systems
- Decommission web app (optional)

### Migration Options

#### Option A: Gradual Migration (Recommended)
- Keep web app running
- Migrate branches one by one
- Both systems can run in parallel
- Lowest risk

#### Option B: Big Bang Migration
- Migrate all branches at once
- Web app becomes central server only
- Higher risk but faster
- Requires perfect execution

**We recommend Option A for production.**

---

## Step 1: Prepare Central Server

### 1.1 Update VPS Next.js Application

The central server needs to serve both the web app and provide sync APIs. The Electron files are already in your repository.

#### Deploy to Windows VPS

```bash
# 1. SSH into your VPS or use Remote Desktop
# 2. Navigate to your project directory
cd C:\path\to\EMPEROR-OFFLINE-PINCODES

# 3. Pull latest changes (includes Electron code)
git pull origin main

# 4. Install dependencies
bun install

# 5. Generate Prisma client
bunx prisma generate

# 6. Run database migrations (if any schema changes)
bunx prisma migrate deploy

# 7. Restart the application
# Using PM2 (if configured)
pm2 restart emperor-pos

# OR using your current deployment method
```

### 1.2 Verify Sync APIs

Test that the sync APIs are accessible:

```bash
# Test sync upload endpoint (should return 401 without auth)
curl -X POST http://your-vps-ip/api/sync/upload

# Test sync download endpoint
curl http://your-vps-ip/api/sync/download

# Expected response: {"message":"Unauthorized"} or similar
```

### 1.3 Configure Firewall

Ensure the following ports are open on your VPS:

- Port 3000 (or your app port) - For API access
- Port 443 (HTTPS) - For secure connections

```powershell
# Windows Firewall commands (run as Administrator)
netsh advfirewall firewall add rule name="Emperor POS" dir=in action=allow protocol=TCP localport=3000
```

### 1.4 Setup SSL (Production)

For production, you must use SSL for secure sync:

```bash
# Using Caddy (recommended for Windows)
# Edit Caddyfile
your-domain.com {
    reverse_proxy localhost:3000
}

# Start Caddy
caddy run --config Caddyfile
```

### 1.5 Test Central Server Access

From a branch computer, test access to the central server:

```bash
# Test connectivity
curl https://your-domain.com/api/branches

# Expected: JSON response with branches data
```

---

## Step 2: Build Electron Application

### 2.1 Install Electron Build Tools

On your development machine (or VPS):

```bash
# Install Electron packager for building
bun add -D electron-packager electron-builder

# Verify installation
bunx electron --version
bunx electron-builder --version
```

### 2.2 Build Electron App for Windows

```bash
# Build for Windows x64
bunx electron-builder --win --x64

# The build will create a dist/ folder with:
# - dist/Emperor POS Setup x.x.x.exe (installer)
# - dist/win-unpacked/ (portable version)
```

### 2.3 Test the Build

```bash
# Run the portable version
cd dist/win-unpacked
Emperor POS.exe

# Verify:
# [ ] App launches successfully
# [ ] Login screen appears
# [ ] Can connect to central server
# [ ] Sync works (test with one order)
```

### 2.4 Package for Distribution

```bash
# Create a distribution package
cd dist
# Compress the win-unpacked folder
# Or use the installer (Emperor POS Setup x.x.x.exe)
```

---

## Step 3: Configure Branch Installations

### 3.1 Create Branch Configuration

Each branch needs its own configuration file. The config will be created automatically on first run, but you can pre-configure it.

#### Configuration Template

Create a file `config.json` for each branch:

```json
{
  "branchId": "BRANCH_ID_FROM_DATABASE",
  "branchName": "Branch Name",
  "centralServerUrl": "https://your-domain.com",
  "kioskMode": false,
  "sync": {
    "enabled": true,
    "autoSync": true,
    "syncInterval": 300,
    "retryAttempts": 3,
    "retryDelay": 5
  }
}
```

#### Get Branch IDs

From your central database:

```sql
-- Get all branch IDs
SELECT id, branchName FROM branches;
```

Example output:
```
cm1abc123def456 | Cairo Branch 1
cm2xyz789uvw012 | Alexandria Branch
cm3qrs456tuv789 | Giza Branch
```

### 3.2 Pre-Configure Branch Data

For each branch, you have two options:

#### Option A: Automatic Sync (Recommended)
- Install Electron app with empty local database
- Configure with branch ID
- App will download all data from central server automatically

#### Option B: Manual Data Import
- Export data from central server
- Import into local SQLite database
- More control but more complex

**We recommend Option A.**

### 3.3 Create Installation Packages

For each branch, create a customized installer:

```powershell
# Create branch-specific package
# 1. Copy the base Electron build
Copy-Item -Path "dist\win-unpacked" -Destination "dist\Cairo-Branch" -Recurse

# 2. Add branch-specific config
$config = @{
    branchId = "cm1abc123def456"
    branchName = "Cairo Branch 1"
    centralServerUrl = "https://your-domain.com"
    kioskMode = $false
    sync = @{
        enabled = $true
        autoSync = $true
        syncInterval = 300
        retryAttempts = 3
        retryDelay = 5
    }
}
$config | ConvertTo-Json | Out-File -FilePath "dist\Cairo-Branch\config.json"

# 3. Create ZIP for distribution
Compress-Archive -Path "dist\Cairo-Branch\*" -DestinationPath "dist\Cairo-Branch-Package.zip"
```

---

## Step 4: Deploy to Branches

### 4.1 Pre-Migration Checklist for Each Branch

- [ ] Branch computer has Windows 10/11
- [ ] At least 20GB free disk space
- [ ] Internet connection working
- [ ] Admin access to install software
- [ ] Current POS data backed up locally
- [ ] Branch ID and configuration ready
- [ ] Installation package downloaded

### 4.2 Installation Process

#### Step-by-Step Installation

**Step 1: Stop Current Web App Usage**
- Notify all users at the branch
- Close all browser windows running the POS
- Complete any pending orders
- Close any open shifts

**Step 2: Install Electron App**
```powershell
# Run the installer as Administrator
.\Emperor-POS-Setup-x.x.x.exe

# Or extract the portable version
# Extract to C:\Program Files\Emperor POS\
```

**Step 3: Configure the App**
- Launch the app
- Enter branch ID (or use pre-configured config)
- Enter central server URL
- Test connection

**Step 4: Initial Data Sync**
- Click "Sync Now" button
- Wait for initial sync to complete
- Verify all data is downloaded:
  - Menu items
  - Users
  - Inventory
  - Customer data

**Step 5: Login Test**
- Try logging in with a user account
- Verify PIN codes work
- Verify all permissions are correct

**Step 6: Create Test Order**
- Create a small test order
- Submit it
- Verify it syncs to central server
- Verify it appears in reports

### 4.3 Migration Timeline per Branch

**Total Time: 30-60 minutes per branch**

| Task | Time | Notes |
|------|------|-------|
| Stop current usage | 5 min | Notify users, complete orders |
| Install app | 10 min | Download and install |
| Configure | 5 min | Enter branch settings |
| Initial sync | 10-30 min | Depends on data size |
| Test login & orders | 5-10 min | Verify everything works |
| Go live | 5 min | Start using for real orders |

---

## Step 5: Initial Sync

### 5.1 What Gets Synced?

**Download (from central to branch):**
- Menu items and categories
- Ingredients and recipes
- Branch users
- Customer data
- Branch-specific inventory
- Delivery areas
- Promo codes and loyalty settings
- Receipt settings
- ETA settings

**Upload (from branch to central):**
- Orders
- Shifts
- Business days
- Inventory transactions
- Waste tracking
- Cost records
- Sales reports

### 5.2 Monitoring Initial Sync

The Electron app shows sync progress in the header:

- 🟢 Green dot = Online and synced
- 🟡 Yellow dot = Online, syncing in progress
- 🔴 Red dot = Offline
- ⏳ Orange dot = Connection issues

### 5.3 Sync Verification

After initial sync, verify data counts:

```sql
-- On central server, check if branch data synced
SELECT COUNT(*) FROM orders WHERE branchId = 'BRANCH_ID';
SELECT COUNT(*) FROM shifts WHERE branchId = 'BRANCH_ID';

-- Compare with branch local SQLite
-- (You can open the SQLite file using DB Browser for SQLite)
```

### 5.4 Handle Sync Conflicts

If there are conflicts during initial sync:

1. The app will show a conflict warning
2. Review each conflict
3. Choose resolution strategy:
   - **Keep Central**: Use server data (recommended for initial sync)
   - **Keep Local**: Use branch data
   - **Merge**: Combine both (if possible)

---

## Step 6: Verification

### 6.1 Post-Migration Checklist

**Data Verification:**
- [ ] All branches appear in system
- [ ] All users can log in
- [ ] All menu items are visible
- [ ] All inventory is available
- [ ] All customer data is present
- [ ] All orders from before migration are visible
- [ ] All reports include historical data

**Functional Verification:**
- [ ] New orders can be created
- [ ] Orders sync to central server
- [ ] Shifts can be opened/closed
- [ ] Inventory updates work
- [ ] Receipts print correctly
- [ ] ETA submissions work (if enabled)
- [ ] Offline mode works (test by disconnecting internet)

**Performance Verification:**
- [ ] App launches in < 5 seconds
- [ ] Orders complete in < 3 seconds
- [ ] Sync completes in reasonable time
- [ ] No memory leaks (monitor after 1 day)

### 6.2 Monitoring First Week

**Daily Checks:**
- Review sync logs
- Check for any failed syncs
- Monitor disk space usage
- Review error logs
- Get feedback from branch users

**Weekly Checks:**
- Verify data counts match central server
- Test disaster recovery (restore from backup)
- Review performance metrics
- Plan for any optimizations

---

## Rollback Plan

### When to Rollback

- Data corruption detected
- Critical bugs preventing operations
- Performance is unacceptable
- Users cannot adapt to new system

### Rollback Process

**Immediate Rollback (Same Day):**

```bash
# 1. Stop Electron app
# Close the app on all branch computers

# 2. Revert to web app
# Open browser and access https://your-domain.com

# 3. Verify all data is intact
# Log into web app and check:
# - All orders are present
# - All users can log in
# - All data is synced
```

**Full Rollback (If Needed):**

```bash
# 1. Restore database backup (if needed)
psql -h <host> -U <user> -d <database> < backup_YYYYMMDD_HHMMSS.sql

# 2. Revert code to previous version
git checkout <previous-tag>
git push origin main

# 3. Redeploy web app
pm2 restart emperor-pos

# 4. Notify all branches
# Inform them to use web app via browser
```

### Rollback Timeline

| Scenario | Time to Rollback | Data Loss |
|----------|-----------------|-----------|
| Same day (immediate) | 15 minutes | None |
| After 1 day | 30 minutes | Minimal (orders made that day) |
| After 1 week | 1-2 hours | May lose some branch-local data |

**Always maintain the ability to rollback within the first week.**

---

## Troubleshooting

### Issue 1: App Won't Launch

**Symptoms:**
- Double-clicking the app does nothing
- Error message on launch

**Solutions:**
```powershell
# Check Windows Event Viewer
eventvwr.msc
# Look for Application errors related to Emperor POS

# Run from command line to see error
cd "C:\Program Files\Emperor POS\"
.\Emperor POS.exe

# Common fixes:
# - Reinstall the app
# - Check .NET Framework is installed
# - Run as Administrator
# - Check antivirus is not blocking
```

### Issue 2: Sync Fails

**Symptoms:**
- Red dot in header (offline)
- Sync errors in logs
- Orders not appearing in reports

**Solutions:**
```bash
# 1. Check internet connection
ping your-domain.com

# 2. Check if central server is running
curl https://your-domain.com/api/branches

# 3. Check firewall settings
# Ensure outbound HTTPS is allowed

# 4. Verify API credentials
# Check config.json has correct branchId

# 5. Check sync logs
# Logs are in: %APPDATA%\Emperor POS\logs\
```

### Issue 3: Data Missing After Sync

**Symptoms:**
- Menu items missing
- Users missing
- Historical orders missing

**Solutions:**
```sql
-- On central server, verify data exists
SELECT * FROM menuItems WHERE branchId = 'BRANCH_ID';
SELECT * FROM users WHERE branchId = 'BRANCH_ID';

-- If data exists in central but not branch:
-- 1. Clear local SQLite database
# Delete: C:\ProgramData\Emperor POS\emperor-pos.db
# 2. Restart app
# 3. Trigger full sync
```

### Issue 4: Performance Issues

**Symptoms:**
- App is slow
- High CPU/memory usage
- Sync takes too long

**Solutions:**
```bash
# 1. Check database size
# SQLite file should be < 500MB for normal operation

# 2. Clear old logs
# Delete logs older than 30 days

# 3. Reduce sync interval
# In config.json, increase syncInterval

# 4. Check for large tables
SELECT COUNT(*) FROM orders;
# If > 100,000 orders, consider archiving
```

### Issue 5: User Cannot Log In

**Symptoms:**
- "Invalid credentials" error
- PIN not working

**Solutions:**
```sql
-- On central server, verify user exists
SELECT * FROM users WHERE username = 'username';

-- Check if user is assigned to correct branch
SELECT * FROM users WHERE branchId = 'BRANCH_ID';

-- Reset password if needed
# Use web app to reset password
```

---

## Support & Resources

### Documentation Files

- `ELECTRON_ARCHITECTURE.md` - Technical architecture details
- `WINDOWS_VPS_DEPLOYMENT.md` - VPS deployment guide
- `ELECTRON_MIGRATION_SUMMARY.md` - Implementation summary

### Getting Help

If you encounter issues not covered here:

1. Check the logs: `%APPDATA%\Emperor POS\logs\`
2. Check the central server logs
3. Verify all configuration is correct
4. Test with a clean install (fresh database)

---

## Migration Checklist

### Pre-Migration
- [ ] Database backup created
- [ ] Codebase backup created
- [ ] All data counts recorded
- [ ] Central server updated
- [ ] Electron app built and tested
- [ ] Branch configurations created
- [ ] Installation packages prepared
- [ ] Staff trained on new system
- [ ] Rollback plan documented

### Migration (Per Branch)
- [ ] Current usage stopped
- [ ] Electron app installed
- [ ] App configured
- [ ] Initial sync completed
- [ ] Login tested
- [ ] Test order created
- [ ] Sync to central verified
- [ ] All users tested login
- [ ] Go live approved

### Post-Migration
- [ ] All data verified
- [ ] All functions tested
- [ ] Performance acceptable
- [ ] Users comfortable with new system
- [ ] Monitoring set up
- [ ] Backup schedule confirmed
- [ ] Web app status decided (keep or remove)

---

## Next Steps After Migration

1. **Monitor for 1-2 weeks** before decommissioning web app
2. **Train all staff** on Electron app features
3. **Set up automated backups** of local databases
4. **Document any custom configurations** per branch
5. **Plan regular updates** for Electron app
6. **Consider Kiosk mode** for dedicated POS terminals

---

## Summary

This migration guide provides a step-by-step approach to moving from web to Electron without data loss. Key points:

✅ **Backup everything** before starting
✅ **Migrate gradually** - one branch at a time
✅ **Test thoroughly** at each step
✅ **Monitor closely** during first week
✅ **Keep rollback option** available
✅ **Document everything** for future reference

By following this guide, you should have a smooth, successful migration to the Electron desktop application with zero data loss!

---

**Last Updated:** $(date)
**Version:** 1.0
**For:** Emperor POS System Migration
