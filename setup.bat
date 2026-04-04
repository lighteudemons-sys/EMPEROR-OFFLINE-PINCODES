@echo off
REM ========================================
REM EMPEROR POS - Backup Script Setup
REM ========================================

SETLOCAL EnableDelayedExpansion

echo ========================================
echo EMPEROR POS BACKUP SCRIPT SETUP
echo ========================================
echo.

REM ========================================
REM [1/6] Creating backup directories
REM ========================================
echo [1/6] Creating backup directories...

set BACKUP_ROOT=C:\backups
set BACKUP_DIR=%BACKUP_ROOT%\daily
set TEMP_DIR=%BACKUP_ROOT%\temp
set LOG_DIR=%BACKUP_ROOT%\logs

if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo [OK] Directories created
echo.

REM ========================================
REM [2/6] Checking PostgreSQL installation
REM ========================================
echo [2/6] Checking PostgreSQL installation...

set POSTGRES_BIN=C:\Program Files\PostgreSQL\17\bin
if exist "%POSTGRES_BIN%\pg_dump.exe" (
    echo [OK] PostgreSQL 17 found at default location
) else (
    set POSTGRES_BIN=C:\Program Files\PostgreSQL\15\bin
    if exist "%POSTGRES_BIN%\pg_dump.exe" (
        echo [OK] PostgreSQL 15 found
        echo [WARNING] Please update POSTGRES_BIN variable in backup script to:
        echo          set POSTGRES_BIN=!POSTGRES_BIN!
    ) else (
        set POSTGRES_BIN=C:\Program Files\PostgreSQL\14\bin
        if exist "%POSTGRES_BIN%\pg_dump.exe" (
            echo [OK] PostgreSQL 14 found
            echo [WARNING] Please update POSTGRES_BIN variable in backup script to:
            echo          set POSTGRES_BIN=!POSTGRES_BIN!
        ) else (
            echo [WARNING] PostgreSQL not found at default location
            echo [WARNING] Please update POSTGRES_BIN variable in the backup script
        )
    )
)
echo.

REM ========================================
REM [3/6] Checking 7-Zip installation
REM ========================================
echo [3/6] Checking 7-Zip installation...

set SEVENZIP=C:\Program Files\7-Zip\7z.exe
if exist "%SEVENZIP%" (
    echo [OK] 7-Zip found at default location
) else (
    echo [WARNING] 7-Zip not found at default location
    echo Download from: https://www.7-zip.org/download.html
)
echo.

REM ========================================
REM [4/6] Checking rclone installation
REM ========================================
echo [4/6] Checking rclone installation...

where rclone.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] rclone found in PATH
) else (
    echo [INFO] rclone not found (optional for cloud backup)
    echo Download from: https://rclone.org/downloads/
)
echo.

REM ========================================
REM [5/6] Checking disk space
REM ========================================
echo [5/6] Checking disk space...

for /f "skip=1 tokens=3" %%a in ('wmic logicaldisk where "name='C:'" get freespace') do (
    set FREE_BYTES=%%a
    set /a FREE_GB=!FREE_BYTES! / 1073741824
)

if defined FREE_GB (
    echo [OK] Available disk space on C: : !FREE_GB! GB
    if !FREE_GB! LSS 10 (
        echo [WARNING] Low disk space: only !FREE_GB! GB available
        echo [WARNING] Consider cleaning up or using a different drive
    )
) else (
    echo [WARNING] Could not determine disk space
)
echo.

REM ========================================
REM [6/6] Testing PostgreSQL connectivity
REM ========================================
echo [6/6] Testing PostgreSQL connectivity...

REM Try to find PostgreSQL binaries
set PG_BIN=
if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" set PG_BIN=C:\Program Files\PostgreSQL\17\bin
if exist "C:\Program Files\PostgreSQL\15\bin\psql.exe" set PG_BIN=C:\Program Files\PostgreSQL\15\bin
if exist "C:\Program Files\PostgreSQL\14\bin\psql.exe" set PG_BIN=C:\Program Files\PostgreSQL\14\bin

if not defined PG_BIN (
    echo [WARNING] Could not find PostgreSQL executables
    echo [WARNING] Skipping database connectivity test
    goto :SetupSummary
)

set DB_PASSWORD=@Kako2010
set PGPASSWORD=%DB_PASSWORD%

"%PG_BIN%\psql.exe" -h localhost -U postgres -d emperor_pos -c "SELECT 1;" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL database connection successful
    echo   - Database: emperor_pos
    echo   - User: postgres
    echo   - Password is correct in script
) else (
    echo [WARNING] PostgreSQL connection failed
    echo   Please verify:
    echo   - Database name: emperor_pos
    echo   - User: postgres
    echo   - Password: @Kako2010
    echo   - PostgreSQL service is running
)
echo.

:SetupSummary
REM ========================================
REM SETUP SUMMARY
REM ========================================
echo ========================================
echo SETUP SUMMARY
echo ========================================
echo.
echo Next steps:
echo.
echo 1. Edit backup-script-fixed.bat to configure:
echo    - Database credentials
echo    - Backup paths
echo    - Retention periods
echo    - Email settings (optional)
echo.
echo 2. Test the backup script manually:
echo    cd C:\backups
echo    backup-script-fixed.bat
echo.
echo 3. Set up Task Scheduler:
echo    - Open Task Scheduler
echo    - Create new task to run daily
echo    - Point to: C:\backups\backup-script-fixed.bat
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
ENDLOCAL
