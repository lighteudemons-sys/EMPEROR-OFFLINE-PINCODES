# EMPEROR POS - Backup Script Documentation

## Overview

This backup system provides comprehensive, automated backup for the Emperor POS system including:
- PostgreSQL database backups (multiple formats)
- Application source code backups
- Automatic compression with 7-Zip
- Optional cloud storage via Google Drive (rclone)
- Automatic cleanup of old backups (30-day retention)
- Detailed logging and error handling
- Email notifications (optional)

## Files

### 1. `setup.bat`
Initial setup script that verifies the environment and creates necessary directories.

**What it checks:**
- Creates backup directories (C:\backups\daily, temp, logs)
- Detects PostgreSQL installation (versions 17, 15, 14)
- Checks 7-Zip installation
- Checks rclone installation (optional)
- Checks available disk space
- Tests database connectivity

**Usage:**
```batch
cd C:\backups
setup.bat
```

### 2. `backup-script-fixed.bat`
The main backup script that performs all backup operations.

**Features:**
- ✅ Auto-detects PostgreSQL version
- ✅ Pre-flight checks (disk space, connectivity, tool availability)
- ✅ Database backup in two formats:
  - Custom format (`.custom`) - Best for restoring
  - SQL format (`.sql`) - Portable, can be edited
- ✅ Application files backup (excludes node_modules, .git, .next, .env files)
- ✅ Maximum compression with 7-Zip (LZMA2, 1.5GB dictionary)
- ✅ Archive integrity verification
- ✅ Backup integrity verification (pg_restore test)
- ✅ Optional cloud upload to Google Drive via rclone
- ✅ Automatic cleanup of old backups (configurable retention)
- ✅ Detailed logging with timestamps
- ✅ Optional email notifications on success/failure
- ✅ Comprehensive error handling

**Configuration Options:**

Edit the configuration section at the top of `backup-script-fixed.bat`:

```batch
REM Backup Directories
set BACKUP_ROOT=C:\backups
set BACKUP_DIR=%BACKUP_ROOT%\daily
set TEMP_DIR=%BACKUP_ROOT%\temp
set LOG_DIR=%BACKUP_ROOT%\logs

REM Database Configuration
set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=emperor_pos
set DB_USER=postgres
set DB_PASSWORD=@Kako2010

REM Application Path
set APP_DIR=C:\projects\EMPEROR-OFFLINE-PINCODES

REM Backup Retention (days)
set RETAIN_DAYS=30

REM PostgreSQL Binary Path (auto-detected, but can be overridden)
set POSTGRES_BIN=C:\Program Files\PostgreSQL\17\bin

REM 7-Zip Path
set SEVENZIP=C:\Program Files\7-Zip\7z.exe

REM Rclone Configuration (Optional)
set RCLONE_ENABLED=0           [Set to 1 to enable]
set RCLONE_REMOTE=gdrive       [Your rclone remote name]
set RCLONE_PATH=POS_Backups    [Folder in cloud storage]

REM Email Notifications (Optional)
set ENABLE_EMAIL=0             [Set to 1 to enable]
set SMTP_SERVER=smtp.gmail.com
set SMTP_PORT=587
set SMTP_USER=your-email@gmail.com
set SMTP_PASSWORD=your-app-password
set EMAIL_TO=admin@yourcompany.com
set EMAIL_FROM=backup@yourcompany.com
```

## Installation Steps

### Step 1: Copy Scripts
Copy all backup scripts to `C:\backups\`:
- `setup.bat`
- `backup-script-fixed.bat`
- `BACKUP_SCRIPT_README.md`

### Step 2: Run Setup
```batch
cd C:\backups
setup.bat
```

This will:
- Create necessary directories
- Check your environment
- Test database connectivity
- Report any issues

### Step 3: Configure Backup Script
Edit `backup-script-fixed.bat` and verify/update:
- Database credentials
- Application path
- Backup retention period
- (Optional) Rclone settings
- (Optional) Email settings

### Step 4: Test Manually
```batch
cd C:\backups
backup-script-fixed.bat
```

Verify that:
- Database backup completes successfully
- Application files are copied
- Archive is created
- Log file shows "BACKUP COMPLETED SUCCESSFULLY"

### Step 5: Schedule with Task Scheduler

1. Open **Task Scheduler** (Run `taskschd.msc`)
2. Click **Create Basic Task** in the right panel
3. Name: `Emperor POS Daily Backup`
4. Description: `Automated daily backup of Emperor POS database and files`
5. Trigger: **Daily**
   - Start date: Today
   - Start time: 2:00 AM (or your preferred low-usage time)
   - Recur every: 1 day
6. Action: **Start a program**
   - Program/script: `C:\backups\backup-script-fixed.bat`
   - Start in (optional): `C:\backups`
7. Finish and check "Open the Properties dialog for this task when I click Finish"
8. In Properties:
   - **General** tab:
     - ✅ Run whether user is logged on or not
     - ✅ Do not store password
     - ✅ Run with highest privileges
   - **Conditions** tab:
     - ✅ Start the task only if the computer is on AC power
     - ✅ Stop if the computer switches to battery power
   - **Settings** tab:
     - ✅ Allow task to be run on demand
     - ✅ Run task as soon as possible after a scheduled start is missed
     - ✅ Stop the task if it runs longer than: 4 hours
9. Click OK and enter Windows account credentials when prompted
10. Test by right-clicking the task and selecting **Run**

## Optional: Enable Cloud Backup with Google Drive

### Install rclone
1. Download rclone from https://rclone.org/downloads/
2. Extract to a folder in your PATH (e.g., `C:\Windows` or `C:\Program Files`)
3. Verify installation: `rclone version`

### Configure Google Drive
```batch
rclone config
```

Follow the prompts:
1. **New remote**: `gdrive`
2. **Type of storage**: `drive` (Google Drive)
3. **client_id**: Press Enter (use default)
4. **client_secret**: Press Enter (use default)
5. **scope**: Choose `1` (Full access)
6. **root_folder_id**: Press Enter
7. **service_account_file**: Press Enter
8. **Advanced config**: `n`
9. **Auto config**: `y`
10. Browser will open - sign in to Google and grant permissions
11. **Configure this as a team drive**: `n`
12. **y** to confirm

### Enable in Backup Script
Edit `backup-script-fixed.bat`:
```batch
set RCLONE_ENABLED=1
set RCLONE_REMOTE=gdrive
set RCLONE_PATH=POS_Backups
```

## Optional: Enable Email Notifications

### For Gmail
1. Enable 2-Factor Authentication on your Google Account
2. Generate an App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer"
   - Generate and copy the 16-character password
3. Edit `backup-script-fixed.bat`:
```batch
set ENABLE_EMAIL=1
set SMTP_SERVER=smtp.gmail.com
set SMTP_PORT=587
set SMTP_USER=your-email@gmail.com
set SMTP_PASSWORD=your-16-char-app-password
set EMAIL_TO=admin@yourcompany.com
set EMAIL_FROM=backup@yourcompany.com
```

## Backup Structure

After running, your backups will be organized as follows:

```
C:\backups\
├── daily\                          # Compressed backup archives
│   ├── backup_20260504_020000.7z
│   ├── backup_20260503_020000.7z
│   └── ...
├── logs\                           # Log files and summaries
│   ├── backup_20260504_020000.log
│   ├── backup_summary_20260504_020000.txt
│   └── ...
└── temp\                           # Temporary files (cleared after backup)
    └── (empty after backup completes)
```

Each backup archive contains:
```
backup_YYYYMMDD_HHMMSS.7z
├── 20260504_020000\
│   ├── emperor_pos_backup.custom    # PostgreSQL custom format
│   ├── emperor_pos_backup.sql      # PostgreSQL SQL dump
│   └── app\                        # Application files
│       ├── src\
│       ├── public\
│       ├── prisma\
│       ├── components\
│       ├── package.json
│       ├── tsconfig.json
│       └── ...
```

## Restoring from Backup

### Restore Database

**Option 1: Restore from Custom Format (Recommended)**
```batch
set PGPASSWORD=@Kako2010
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -h localhost -U postgres -d emperor_pos -v "C:\backups\temp\20260504_020000\emperor_pos_backup.custom"
```

**Option 2: Restore from SQL Dump**
```batch
set PGPASSWORD=@Kako2010
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -d emperor_pos -f "C:\backups\temp\20260504_020000\emperor_pos_backup.sql"
```

### Restore Application Files

1. Extract the backup archive:
```batch
"C:\Program Files\7-Zip\7z.exe" x C:\backups\daily\backup_20260504_020000.7z -oC:\backups\temp\restore
```

2. Copy files to application directory:
```batch
robocopy C:\backups\temp\restore\20260504_020000\app C:\projects\EMPEROR-OFFLINE-PINCODES /E
```

3. Install dependencies:
```batch
cd C:\projects\EMPEROR-OFFLINE-PINCODES
bun install
```

## Monitoring Backups

### Check Last Backup Status
View the latest log file:
```
C:\backups\logs\backup_YYYYMMDD_HHMMSS.log
```

Or view the summary:
```
C:\backups\logs\backup_summary_YYYYMMDD_HHMMSS.txt
```

### Check Disk Space
```batch
wmic logicaldisk get name,freespace,size
```

### List Recent Backups
```batch
dir C:\backups\daily\*.7z /O-D
```

## Troubleshooting

### Issue: "PostgreSQL binaries not found"
**Solution:** The script auto-detects PostgreSQL versions 17, 15, and 14. If you have a different version or installation path, manually set:
```batch
set POSTGRES_BIN=C:\path\to\postgresql\bin
```

### Issue: "Insufficient disk space"
**Solution:**
1. Clean up old backups manually: `del C:\backups\daily\*.7z`
2. Reduce retention period: `set RETAIN_DAYS=15`
3. Use a different drive: `set BACKUP_ROOT=D:\backups`

### Issue: "Database connection failed"
**Solution:** Verify:
1. PostgreSQL service is running: `sc query postgresql-x64-17`
2. Database credentials are correct in the script
3. Database exists: `"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -l`

### Issue: "7-Zip not found"
**Solution:** Install 7-Zip from https://www.7-zip.org/download.html

### Issue: Backup fails with robocopy error
**Solution:** This is usually not critical. Robocopy returns various exit codes:
- 0 = No files copied (no changes)
- 1 = Files copied successfully
- 7 = No files to copy (source and destination are the same)

Exit codes 0, 1, and 7 are all considered success.

### Issue: Task Scheduler doesn't run the backup
**Solution:**
1. Check Task Scheduler History for errors
2. Ensure "Run whether user is logged on or not" is checked
3. Verify account credentials are stored correctly
4. Test by right-clicking the task and selecting "Run"

## What's Included vs What's Missing

### ✅ What IS Included

1. **Database Backup**
   - Full PostgreSQL dump (custom format)
   - SQL dump for portability
   - Backup integrity verification
   - Database connectivity pre-check

2. **Application Files**
   - Source code
   - Configuration files (except sensitive .env)
   - Dependencies (package.json, lock files)
   - Prisma schema
   - Excludes: node_modules, .git, .next, logs

3. **Compression**
   - Maximum compression (LZMA2)
   - Large dictionary (1.5GB)
   - Archive integrity verification

4. **Cloud Backup** (Optional)
   - Google Drive via rclone
   - Upload verification
   - Configurable remote and path

5. **Automation**
   - Windows Task Scheduler compatible
   - Pre-flight checks
   - Automatic cleanup
   - Configurable retention

6. **Monitoring**
   - Detailed logs
   - Summary reports
   - Email notifications (optional)
   - Status tracking

### ❌ What is NOT Included (And Why)

1. **Incremental Backups**
   - Not included because:
   - PostgreSQL dumps are typically full backups
   - Simplifies restore process
   - For large databases, consider PostgreSQL's native WAL archiving or pgBackRest

2. **Database Snapshots**
   - Not included because:
   - Requires PostgreSQL configuration changes
   - More complex to set up and maintain
   - Consider using PostgreSQL's pg_basebackup for snapshot-style backups

3. **Multiple Database Backup**
   - Currently only backs up `emperor_pos` database
   - To backup additional databases, add calls to pg_dump for each database

4. **Cloud Database (Neon) Backup**
   - Neon has its own automated backup system
   - Can use Neon's API or dashboard to export backups
   - Consider separate script for cloud database

5. **Encryption**
   - Not included because:
   - 7-Zip archives can be password protected (add -p option)
   - For sensitive data, consider encrypting at rest with BitLocker or similar

6. **Version Control Sync**
   - Not pushing to GitHub
   - This is intentional - backups are for recovery, not version control
   - Use `git push` separately for code versioning

## Best Practices

1. **Test Restores Regularly**
   - Schedule monthly restore tests
   - Verify database integrity after restore
   - Test application functionality with restored data

2. **Monitor Backup Logs**
   - Check logs weekly
   - Look for warnings or errors
   - Verify backup sizes are reasonable

3. **Offsite Storage**
   - Enable cloud backup (rclone + Google Drive)
   - Consider multiple cloud providers (Dropbox, OneDrive, AWS S3)
   - Keep at least one backup copy offsite

4. **Retention Strategy**
   - Daily backups: 30 days
   - Consider weekly/monthly archives for long-term retention
   - Store critical monthly backups for 1 year

5. **Security**
   - Protect backup script with appropriate file permissions
   - Use service account with minimum required permissions
   - Don't store plain-text passwords if possible (use Windows Credential Manager)

## Support

For issues or questions:
1. Check the log file: `C:\backups\logs\backup_*.log`
2. Review this README
3. Verify all prerequisites are installed
4. Test the backup script manually before scheduling

## Changelog

### Version 2.0 (Fixed)
- ✅ Fixed disk space detection
- ✅ Auto-detects PostgreSQL version
- ✅ Improved error handling
- ✅ Better logging
- ✅ Fixed variable expansion issues
- ✅ Added comprehensive documentation

### Version 1.0
- Initial release
- Basic backup functionality
