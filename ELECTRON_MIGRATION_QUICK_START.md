# Electron Migration - Quick Start Guide

## 🚀 Fast Track to Desktop App

This is a condensed version of the full migration guide. For detailed instructions, see `ELECTRON_MIGRATION_GUIDE.md`.

---

## 📌 Critical Points

1. **Zero Data Loss** - All data stays safe in central database
2. **Gradual Migration** - Migrate one branch at a time
3. **Keep Web App Running** - Both can work together
4. **Test Thoroughly** - Don't skip verification steps

---

## ⚡ Quick 10-Step Migration

### Phase 1: Setup (Do Once)

**1. Backup Everything**
```bash
# Backup database
pg_dump -h <host> -U <user> -d <database> > backup.sql

# Record data counts
SELECT COUNT(*) FROM branches;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM orders;
```

**2. Update Central Server**
```bash
# On your Windows VPS
cd C:\path\to\EMPEROR-OFFLINE-PINCODES
git pull origin main
bun install
bunx prisma generate
bunx prisma migrate deploy
pm2 restart emperor-pos
```

**3. Build Electron App**
```bash
# On your development machine
bun add -D electron-packager electron-builder
bunx electron-builder --win --x64
# Find the installer in: dist/Emperor POS Setup x.x.x.exe
```

### Phase 2: Prepare Each Branch (Repeat per branch)

**4. Get Branch ID**
```sql
SELECT id, branchName FROM branches;
```

**5. Create Branch Config**
```json
{
  "branchId": "BRANCH_ID_FROM_STEP_4",
  "branchName": "Branch Name",
  "centralServerUrl": "https://your-domain.com",
  "kioskMode": false,
  "sync": {
    "enabled": true,
    "autoSync": true,
    "syncInterval": 300
  }
}
```

**6. Test Connection**
```bash
# From branch computer
curl https://your-domain.com/api/branches
# Should return JSON with branches
```

### Phase 3: Install & Go Live (Repeat per branch)

**7. Install Electron App**
- Run the installer as Administrator
- Or extract portable version to `C:\Program Files\Emperor POS\`

**8. Configure App**
- Launch the app
- Enter branch ID from Step 4
- Enter central server URL
- Click "Test Connection"

**9. Initial Sync**
- Click "Sync Now" button
- Wait for sync to complete (10-30 minutes)
- Verify data is downloaded:
  - Menu items ✓
  - Users ✓
  - Inventory ✓

**10. Go Live**
- Login with user account
- Create test order
- Verify it syncs to central server
- Start using for real orders

**Total Time per Branch: 30-60 minutes**

---

## 🔍 Verification Checklist

After migration, verify:

**Data:**
- [ ] All branches visible
- [ ] All users can log in
- [ ] All menu items present
- [ ] All inventory available
- [ ] Historical orders visible

**Functionality:**
- [ ] Can create new orders
- [ ] Orders sync to central
- [ ] Shifts open/close correctly
- [ ] Inventory updates work
- [ ] Receipts print correctly

**Performance:**
- [ ] App launches < 5 seconds
- [ ] Orders complete < 3 seconds
- [ ] Sync completes in reasonable time

---

## 🔄 Rollback (If Needed)

**Immediate Rollback (15 minutes):**
```bash
# 1. Stop Electron app
# 2. Open browser to https://your-domain.com
# 3. Verify all data is intact
# 4. Continue using web app
```

**Full Rollback (30 minutes):**
```bash
# 1. Restore database
psql -h <host> -U <user> -d <database} < backup.sql

# 2. Revert code
git checkout <previous-tag>
git push origin main

# 3. Redeploy
pm2 restart emperor-pos
```

---

## 🛠️ Common Issues & Fixes

### App Won't Launch
```powershell
# Run as Administrator
# Check antivirus isn't blocking
# Reinstall app
```

### Sync Fails (Red Dot)
```bash
# Check internet
ping your-domain.com

# Check server is up
curl https://your-domain.com/api/branches

# Verify config.json has correct branchId
```

### Data Missing
```bash
# Clear local database
# Delete: C:\ProgramData\Emperor POS\emperor-pos.db
# Restart app
# Trigger full sync
```

### User Can't Login
```sql
-- On central server
SELECT * FROM users WHERE username = 'username';
SELECT * FROM users WHERE branchId = 'BRANCH_ID';

-- Reset password via web app if needed
```

### Performance Issues
```bash
# Check SQLite file size (< 500MB is normal)
# Clear old logs
# Increase syncInterval in config.json
```

---

## 📞 Need Help?

1. **Check logs:** `%APPDATA%\Emperor POS\logs\`
2. **Check server logs:** Windows VPS application logs
3. **Verify config:** All settings in config.json
4. **Test clean install:** Fresh database to isolate issues

---

## 📚 Full Documentation

- `ELECTRON_MIGRATION_GUIDE.md` - Complete detailed guide
- `ELECTRON_ARCHITECTURE.md` - Technical architecture
- `WINDOWS_VPS_DEPLOYMENT.md` - Server deployment
- `ELECTRON_MIGRATION_SUMMARY.md` - Implementation summary

---

## ✅ Migration Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Setup | 1-2 days | Server update, build app, test |
| Pilot Branch | 3-5 days | First branch migration, monitor |
| Remaining Branches | 1-2 weeks | Migrate rest, verify |
| Post-Migration | 1 week | Monitor, optimize, stabilize |

**Total: 2-4 weeks for complete migration**

---

## 🎯 Success Criteria

✅ All branches migrated successfully
✅ No data loss
✅ Users comfortable with new system
✅ Performance acceptable
✅ Sync working reliably
✅ Backup processes in place
✅ Monitoring established

---

## 📝 Quick Reference Commands

```bash
# Build Electron app
bunx electron-builder --win --x64

# Test central server
curl https://your-domain.com/api/branches

# Backup database
pg_dump -h <host> -U <user> -d <database> > backup.sql

# Restore database
psql -h <host> -U <user> -d <database> < backup.sql

# Check sync status (in app)
# Look for colored dot in header
# Green = synced, Yellow = syncing, Red = offline
```

---

**Remember:** Take your time, test everything, and keep the web app running until you're 100% confident in the Electron app!
