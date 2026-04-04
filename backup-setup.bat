@echo off
REM ========================================
REM Emperor POS - Backup Script Setup Helper
REM ========================================

echo.
echo ========================================
echo EMPEROR POS BACKUP SCRIPT SETUP
echo ========================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] This script must be run as Administrator
    echo Right-click the script and select "Run as administrator"
    pause
    exit /b 1
)

echo [1/6] Creating backup directories...
mkdir C:\backups 2>nul
mkdir C:\backups\daily 2>nul
mkdir C:\backups\weekly 2>nul
mkdir C:\backups\monthly 2>nul
mkdir C:\backups\temp 2>nul
mkdir C:\backups\logs 2>nul
echo [OK] Directories created

echo.
echo [2/6] Checking PostgreSQL installation...
if exist "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" (
    echo [OK] PostgreSQL 17 found at default location
) else if exist "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" (
    echo [OK] PostgreSQL 16 found (will need to update script)
) else if exist "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe" (
    echo [OK] PostgreSQL 15 found (will need to update script)
) else (
    echo [WARNING] PostgreSQL not found at default location
    echo Please update POSTGRES_BIN variable in the backup script
)

echo.
echo [3/6] Checking 7-Zip installation...
if exist "C:\Program Files\7-Zip\7z.exe" (
    echo [OK] 7-Zip found at default location
) else (
    echo [WARNING] 7-Zip not found
    echo Please download from: https://www.7-zip.org/
)

echo.
echo [4/6] Checking rclone installation...
where rclone.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] rclone found in PATH
) else (
    echo [INFO] rclone not found (optional for cloud backup)
    echo Download from: https://rclone.org/downloads/
)

echo.
echo [5/6] Checking disk space...
for /f "tokens=2" %%a in ('wmic logicaldisk where "name='C:'" get freespace /value ^| findstr "="') do set FREE_SPACE=%%a
set /a FREE_GB=!FREE_SPACE! / 1073741824
if !FREE_GB! GTR 10 (
    echo [OK] Sufficient disk space: !FREE_GB! GB available
) else (
    echo [WARNING] Low disk space: only !FREE_GB! GB available
    echo Consider cleaning up or using a different drive
)

echo.
echo [6/6] Testing PostgreSQL connectivity...
set PGPASSWORD=@Kako2010
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d emperor_pos -c "SELECT version();" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL database connection successful
) else (
    echo [ERROR] Cannot connect to PostgreSQL database
    echo Please verify:
    echo   - PostgreSQL service is running
    echo   - Database name is correct (emperor_pos)
    echo   - Password is correct in script
)

echo.
echo ========================================
echo SETUP SUMMARY
echo ========================================
echo.
echo Next steps:
echo.
echo 1. Edit backup-script-enhanced.bat to configure:
echo    - Database credentials
echo    - Backup paths
echo    - Retention periods
echo    - Email settings (optional)
echo.
echo 2. Test the backup script manually:
echo    cd C:\backups
echo    backup-script-enhanced.bat
echo.
echo 3. Set up Task Scheduler:
echo    - Open Task Scheduler
echo    - Create new task to run daily
echo    - Point to: C:\backups\backup-script-enhanced.bat
echo    - Run as: SYSTEM or a service account
echo.
echo 4. Configure rclone for cloud backup (optional):
echo    rclone config
echo    Follow prompts to set up Google Drive
echo.
echo For detailed instructions, see BACKUP_SCRIPT_README.md
echo.
echo ========================================
echo.

pause
