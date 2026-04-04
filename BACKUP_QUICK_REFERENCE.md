# Emperor POS Backup - Quick Reference

## 🚀 Common Commands

### Run Backup Manually
```batch
cd C:\backups
backup-script-enhanced.bat
```

### Check Latest Backup Log
```batch
type C:\backups\logs\backup_latest.log
```

### Check Backup Summary
```batch
type C:\backups\logs\backup_summary_latest.txt
```

### List All Backups
```batch
dir C:\backups\daily\*.7z /O-D
```

### Verify Backup Integrity
```batch
"C:\Program Files\7-Zip\7z.exe" t C:\backups\daily\backup_YYYYMMDD_HHMMSS.7z
```

### Extract Backup
```batch
"C:\Program Files\7-Zip\7z.exe" x C:\backups\daily\backup_YYYYMMDD_HHMMSS.7z -oC:\restore_location
```

### Restore Database
```batch
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -d emperor_pos -U postgres -v C:\restore_location\backup\emperor_pos_backup.custom
```

### Check PostgreSQL Service Status
```batch
sc query postgresql-x64-17
```

### Check Disk Space
```batch
wmic logicaldisk get name,freespace,size
```

### Test Database Connection
```batch
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d emperor_pos
```

### List rclone Remotes
```batch
rclone listremotes
```

### Check Cloud Backups
```batch
rclone ls gdrive:POS_Backups
```

### Download Cloud Backup
```batch
rclone copy gdrive:POS_Backups/backup_YYYYMMDD_HHMMSS.7z C:\backups
```

---

## 📊 File Locations

| Item | Location |
|------|----------|
| Backup Script | `C:\backups\backup-script-enhanced.bat` |
| Daily Backups | `C:\backups\daily\` |
| Weekly Backups | `C:\backups\weekly\` |
| Monthly Backups | `C:\backups\monthly\` |
| Logs | `C:\backups\logs\` |
| Temp Files | `C:\backups\temp\` |
| Latest Log | `C:\backups\logs\backup_latest.log` |
| Backup Summary | `C:\backups\logs\backup_summary_latest.txt` |

---

## 🔧 Configuration Files

| File | Purpose |
|------|---------|
| `backup-script-enhanced.bat` | Main backup script |
| `backup-setup.bat` | Setup helper script |
| `BACKUP_SCRIPT_README.md` | Full documentation |
| `BACKUP_QUICK_REFERENCE.md` | This file |

---

## 🎯 Quick Setup

1. **Run Setup Script**
   ```batch
   backup-setup.bat
   ```

2. **Configure Script**
   - Edit `backup-script-enhanced.bat`
   - Update DATABASE section
   - Update paths if needed
   - Set retention periods

3. **Test Backup**
   ```batch
   cd C:\backups
   backup-script-enhanced.bat
   ```

4. **Schedule Backup**
   - Open Task Scheduler
   - Create new task
   - Run daily at 2:00 AM

---

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Backup fails | Check log: `type C:\backups\logs\backup_latest.log` |
| Database error | Test: `psql -U postgres -d emperor_pos` |
| 7-Zip error | Install 7-Zip from https://www.7-zip.org/ |
| Low disk space | Check: `wmic logicaldisk get name,freespace` |
| Cloud upload fails | Check: `rclone listremotes` |
| Task not running | Check Task Scheduler History |

---

## 📧 Enable Email Alerts

Edit `backup-script-enhanced.bat`:

```batch
set ENABLE_EMAIL=1
set SMTP_SERVER=smtp.gmail.com
set SMTP_PORT=587
set SMTP_USER=your-email@gmail.com
set SMTP_PASSWORD=your-app-password
set EMAIL_TO=admin@yourcompany.com
set EMAIL_FROM=backup@yourcompany.com
```

**Gmail App Password:**
1. Google Account → Security
2. Enable 2-Step Verification
3. App Passwords → Create new
4. Use 16-character password in script

---

## 🗓️ Backup Schedule

| Type | Frequency | Retention |
|------|-----------|-----------|
| Daily | Every day at 2:00 AM | 30 days |
| Weekly | Every Sunday | 8 weeks |
| Monthly | 1st of month | 12 months |

---

## 📈 Monitor Backup Health

### Daily
- [ ] Check email notification
- [ ] Verify backup file created

### Weekly
- [ ] Review backup logs
- [ ] Check backup size trends
- [ ] Test restore on test system

### Monthly
- [ ] Full disaster recovery test
- [ ] Review backup strategy
- [ ] Update documentation

---

## 🆘 Emergency Recovery

### 1. Stop Application
```batch
net stop "Emperor POS Service"
```

### 2. Restore Database
```batch
"C:\Program Files\PostgreSQL\17\bin\dropdb.exe" -U postgres emperor_pos
"C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres emperor_pos
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -d emperor_pos -U postgres -v C:\backups\temp\backup\emperor_pos_backup.custom
```

### 3. Restore Application Files
```batch
"C:\Program Files\7-Zip\7z.exe" x C:\backups\daily\backup_latest.7z -oC:\ -aoa
```

### 4. Start Application
```batch
net start "Emperor POS Service"
```

### 5. Verify
- Check application logs
- Test database connection
- Verify data integrity

---

## 📞 Support Contacts

| Issue | Contact |
|-------|---------|
| Backup Script Failures | System Administrator |
| Database Issues | DBA |
| Infrastructure Issues | IT Support |
| Cloud Storage Issues | Cloud Provider |

---

**Last Updated:** 2024
**Version:** 2.0 - Enhanced
**Author:** Emperor POS Team
