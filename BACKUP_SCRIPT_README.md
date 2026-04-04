# Emperor POS - Comprehensive Backup Script

## 📋 What Was Missing From Your Original Script

Your original script was good but missing several critical features for production-grade backups:

### ❌ Missing Features:

1. **Error Handling** - No error checking or recovery
2. **Comprehensive Logging** - No detailed logs for troubleshooting
3. **Backup Verification** - No verification that backups are valid
4. **Email Notifications** - No alerts on success/failure
5. **Disk Space Checks** - No pre-flight space validation
6. **Database Connectivity Test** - No check if DB is accessible before backup
7. **Backup Integrity Verification** - No verification of compressed archives
8. **Progress Reporting** - No clear status updates
9. **Service Health Checks** - No verification that PostgreSQL is running
10. **Backup Size Reporting** - No information about backup sizes
11. **Backup Summary** - No comprehensive report of what was backed up
12. **Retry Logic** - No automatic retry on transient failures
13. **Pre-flight Validation** - No checks before starting backup
14. **Multiple Backup Formats** - Only one format (no SQL dump for portability)
15. **Cloud Upload Verification** - No verification that upload succeeded
16. **Tool Availability Checks** - No check if required tools exist
17. **Detailed Error Messages** - Generic or no error messages
18. **Clean Exit Codes** - No proper exit codes for automation
19. **Configuration Separation** - Config mixed with logic
20. **Backup Catalog** - No record of all backups

---

## ✅ What the Enhanced Script Includes

### 🔒 Security & Reliability
- ✅ Pre-flight validation (disk space, services, tools, connectivity)
- ✅ Database backup in two formats (custom for fast restore, SQL for portability)
- ✅ Backup integrity verification (dry-run restore test)
- ✅ Archive integrity verification (7-Zip test)
- ✅ Cloud upload verification
- ✅ Proper exit codes for Task Scheduler integration

### 📊 Monitoring & Logging
- ✅ Detailed timestamped logs
- ✅ Backup summary report
- ✅ Size reporting for all components
- ✅ Progress indicators
- ✅ Separate log files for each backup
- ✅ Backup catalog/summary files

### 📧 Notifications
- ✅ Email notifications on success/failure (optional)
- ✅ Detailed error messages in notifications
- ✅ Configurable SMTP settings

### 🔄 Backup Strategy
- ✅ PostgreSQL backup with pg_dump (custom format + SQL)
- ✅ Application files with robocopy (excludes node_modules, .git, .next)
- ✅ Maximum compression (7-Zip level 9)
- ✅ Multiple backup retention policies (daily, weekly, monthly options)
- ✅ Local + Cloud backup (Google Drive via rclone)

### 🛠️ Error Handling
- ✅ Error checking at each step
- ✅ Detailed error logging
- ✅ Graceful failure handling
- ✅ Cleanup on failure
- ✅ Clear error messages

### 🧹 Maintenance
- ✅ Automatic cleanup of old backups
- ✅ Automatic cleanup of old logs
- ✅ Temporary file cleanup
- ✅ Configurable retention periods

---

## 🚀 Setup Instructions

### 1. Prerequisites

Ensure you have these installed:
- ✅ PostgreSQL 17 (with pg_dump)
- ✅ 7-Zip
- ✅ rclone (for cloud backup, optional)
- ✅ Windows Task Scheduler

### 2. Configure the Script

Edit the **CONFIGURATION** section at the top of the script:

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
set RETAIN_WEEKLY=8
set RETAIN_MONTHLY=12

REM Backup Paths
set POSTGRES_BIN=C:\Program Files\PostgreSQL\17\bin
set SEVENZIP=C:\Program Files\7-Zip\7z.exe
set RCLONE_EXE=rclone.exe

REM Rclone Configuration (for Google Drive)
set RCLONE_REMOTE=gdrive
set RCLONE_PATH=POS_Backups

REM Email Notifications (set to 1 to enable)
set ENABLE_EMAIL=0
set SMTP_SERVER=smtp.gmail.com
set SMTP_PORT=587
set SMTP_USER=your-email@gmail.com
set SMTP_PASSWORD=your-app-password
set EMAIL_TO=admin@yourcompany.com
set EMAIL_FROM=backup@yourcompany.com
```

### 3. Create Backup Directory

```batch
mkdir C:\backups
mkdir C:\backups\logs
mkdir C:\backups\daily
mkdir C:\backups\temp
```

### 4. Configure Rclone (for Google Drive Backup)

If you want cloud backup, configure rclone:

```batch
rclone config
```

Follow the prompts to set up Google Drive. Name your remote `gdrive`.

Create a folder in Google Drive named `POS_Backups`.

### 5. Setup Task Scheduler

1. Open **Task Scheduler** (`taskschd.msc`)
2. Right-click **Task Scheduler Library** → **Create Task**
3. **General Tab**:
   - Name: `Emperor POS Daily Backup`
   - Description: Daily backup of Emperor POS database and files
   - Run whether user is logged on or not: ✅
   - Run with highest privileges: ✅
   - Configure for: Windows Server 2019/2022 (or your Windows version)

4. **Triggers Tab**:
   - Click **New**
   - Begin the task: On a schedule
   - Settings: Daily
   - Start time: 2:00 AM (or your preferred time)
   - Repeat every: 1 day
   - Enabled: ✅

5. **Actions Tab**:
   - Click **New**
   - Action: Start a program
   - Program/script: `C:\backups\backup-script-enhanced.bat`
   - Start in: `C:\backups\`

6. **Conditions Tab**:
   - Start the task only if the computer is on AC power: ✅ (for laptops)
   - Stop if the computer ceases to be on AC power: ❌
   - Start only if the following network connection is available: Any

7. **Settings Tab**:
   - Allow task to be run on demand: ✅
   - Run task as soon as possible after a scheduled start is missed: ✅
   - Stop the task if it runs longer than: 2 hours
   - If the running task does not end when requested, force it to stop: ✅

8. Click **OK** to save

---

## 🧪 Testing the Backup

### Manual Test

1. Open Command Prompt as Administrator
2. Navigate to backup directory:
   ```batch
   cd C:\backups
   ```
3. Run the script:
   ```batch
   backup-script-enhanced.bat
   ```
4. Check the output and log file

### Verify Backup

1. Check that backup file was created:
   ```batch
   dir C:\backups\daily\*.7z /O-D
   ```

2. Test 7-Zip archive:
   ```batch
   "C:\Program Files\7-Zip\7z.exe" t C:\backups\daily\backup_YYYYMMDD_HHMMSS.7z
   ```

3. Test database restore (dry run):
   ```batch
   "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -l C:\backups\temp\backup\emperor_pos_backup.custom
   ```

### Full Restore Test (on a test system)

1. Extract backup:
   ```batch
   "C:\Program Files\7-Zip\7z.exe" x backup_YYYYMMDD_HHMMSS.7z -oC:\restore_test
   ```

2. Restore database:
   ```batch
   "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -d emperor_pos_test -U postgres -v C:\restore_test\backup\emperor_pos_backup.custom
   ```

---

## 📈 Backup Strategy Recommendations

### Backup Rotation

Keep multiple backup types:

1. **Daily Backups** - Last 30 days
   ```batch
   set RETAIN_DAYS=30
   ```

2. **Weekly Backups** - Last 8 weeks (manual)
   - Copy Sunday backup to weekly folder once per week

3. **Monthly Backups** - Last 12 months (manual)
   - Copy first backup of month to monthly folder once per month

### Backup Locations

1. **Local Backup** - Fast restore, no internet needed
   - Store on different drive than application
   - Example: D:\backups or external hard drive

2. **Cloud Backup** - Offsite protection
   - Google Drive, Dropbox, AWS S3, etc.
   - Protects against local disasters

3. **Offsite Physical Backup** - Weekly/Monthly
   - Copy to external hard drive
   - Store in different physical location

### Backup Testing

1. **Weekly**: Test restore on test system
2. **Monthly**: Full disaster recovery drill
3. **Quarterly**: Update and review backup procedures

---

## 📊 Monitoring Your Backups

### Check Backup Logs

```batch
type C:\backups\logs\backup_latest.log
```

### Check Backup Summary

```batch
type C:\backups\logs\backup_summary_latest.txt
```

### Review Backup History

```batch
dir C:\backups\daily\*.7z /O-D | find "backup_"
```

### Set Up Email Alerts

Enable email notifications in the script:

```batch
set ENABLE_EMAIL=1
set SMTP_SERVER=smtp.gmail.com
set SMTP_USER=your-email@gmail.com
set SMTP_PASSWORD=your-app-password  <-- Use App Password!
set EMAIL_TO=admin@yourcompany.com
```

**Gmail App Password Setup:**
1. Go to Google Account → Security
2. Enable 2-Step Verification
3. Go to App Passwords
4. Create new app password for "Mail"
5. Use that 16-character password in the script

---

## 🔧 Troubleshooting

### Issue: "pg_dump.exe not found"

**Solution:**
1. Verify PostgreSQL installation path
2. Update `POSTGRES_BIN` variable
3. Ensure PostgreSQL binaries are in the specified location

### Issue: "7-Zip not found"

**Solution:**
1. Install 7-Zip from https://www.7-zip.org/
2. Update `SEVENZIP` variable if installed in different location

### Issue: "Insufficient disk space"

**Solution:**
1. Check available disk space: `wmic logicaldisk get name,freespace`
2. Clean up old backups manually if needed
3. Change backup location to a drive with more space
4. Reduce retention period: `set RETAIN_DAYS=15`

### Issue: "Cannot connect to database"

**Solution:**
1. Verify PostgreSQL service is running:
   ```batch
   sc query postgresql-x64-17
   ```
2. Check database credentials in script
3. Test connection manually:
   ```batch
   "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d emperor_pos
   ```

### Issue: "rclone not found"

**Solution:**
1. Install rclone from https://rclone.org/downloads/
2. Add rclone.exe to system PATH
3. Or update `RCLONE_EXE` with full path

### Issue: "Cloud upload failed"

**Solution:**
1. Check rclone configuration:
   ```batch
   rclone listremotes
   rclone ls gdrive:POS_Backups
   ```
2. Verify internet connectivity
3. Check Google Drive storage space
4. Script will continue - backup is saved locally

### Issue: Task Scheduler not running

**Solution:**
1. Check Task Scheduler History for errors
2. Verify user account has permissions
3. Test task manually: Right-click → Run
4. Check "Last Run Result" in Task Scheduler
5. Ensure "Run whether user is logged on or not" is checked

---

## 📝 Maintenance

### Monthly Checklist

- [ ] Review backup logs for errors
- [ ] Test restore from latest backup
- [ ] Verify cloud uploads are working
- [ ] Check disk space on backup drive
- [ ] Update backup script if needed
- [ ] Review retention policy

### Quarterly Checklist

- [ ] Full disaster recovery test
- [ ] Update backup script to latest version
- [ ] Review backup size and adjust retention
- [ ] Test email notifications
- [ ] Update documentation

### Yearly Checklist

- [ ] Review backup strategy
- [ ] Update backup software (PostgreSQL, 7-Zip, rclone)
- [ ] Check backup hardware health
- [ ] Review disaster recovery plan
- [ ] Training new staff on backup procedures

---

## 🎯 Best Practices

1. **3-2-1 Backup Rule**:
   - 3 copies of data (production, backup, offsite)
   - 2 different storage types (disk, cloud, tape)
   - 1 copy offsite (cloud or remote location)

2. **Test Your Backups**:
   - A backup you can't restore is worthless
   - Test at least monthly

3. **Monitor Backup Size**:
   - Sudden increase may indicate issues
   - Helps with capacity planning

4. **Keep Your Backup Script Versioned**:
   - Track changes in Git
   - Document why changes were made

5. **Encrypt Your Backups**:
   - Especially for cloud storage
   - Use 7-Zip encryption if needed

6. **Document Your Restore Procedure**:
   - Keep step-by-step guide
   - Update when infrastructure changes

---

## 📞 Support

If you encounter issues:

1. Check the log file: `C:\backups\logs\backup_latest.log`
2. Review the error message
3. Consult this README
4. Test components individually (pg_dump, 7-Zip, rclone)
5. Verify system resources (disk space, memory, network)

---

## 📄 License

This backup script is part of Emperor POS System.
© 2024 Emperor POS. All rights reserved.
