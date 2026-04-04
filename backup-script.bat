@echo off
REM ========================================
REM EMPEROR POS - Simple Backup Script
REM ========================================

SETLOCAL EnableDelayedExpansion

REM ========================================
REM CONFIGURATION
REM ========================================

set BACKUP_ROOT=C:\backups
set BACKUP_DIR=%BACKUP_ROOT%\daily
set TEMP_DIR=%BACKUP_ROOT%\temp
set LOG_DIR=%BACKUP_ROOT%\logs

set DB_HOST=localhost
set DB_PORT=5432
set DB_NAME=emperor_pos
set DB_USER=postgres
set DB_PASSWORD=@Kako2010

set APP_DIR=C:\projects\EMPEROR-OFFLINE-PINCODES
set RETAIN_DAYS=30

REM Auto-detect PostgreSQL
set POSTGRES_BIN=
if exist "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" set POSTGRES_BIN=C:\Program Files\PostgreSQL\17\bin
if exist "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe" set POSTGRES_BIN=C:\Program Files\PostgreSQL\15\bin
if exist "C:\Program Files\PostgreSQL\14\bin\pg_dump.exe" set POSTGRES_BIN=C:\Program Files\PostgreSQL\14\bin

set SEVENZIP=C:\Program Files\7-Zip\7z.exe

REM ========================================
REM INITIALIZE
REM ========================================

cls
echo EMPEROR POS - Backup Script
echo ============================
echo.
echo Started at: %date% %time%
echo.

REM Create directories
if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Set timestamp
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do (
    set MYDATE=%%c%%a%%b
)
for /f "tokens=1-3 delims=:." %%a in ('time /t') do (
    set MYTIME=%%a%%b%%c
)
set TIMESTAMP=%MYDATE%_%MYTIME%
set LOG_FILE=%LOG_DIR%\backup_%TIMESTAMP%.log
set BACKUP_FILE=%BACKUP_DIR%\backup_%TIMESTAMP%.7z
set TEMP_BACKUP_DIR=%TEMP_DIR%\%TIMESTAMP%

REM Initialize log
echo ======================================== > "%LOG_FILE%"
echo BACKUP STARTED >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo Date: %date% >> "%LOG_FILE%"
echo Time: %time% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo Log file: %LOG_FILE%

REM ========================================
REM CHECKS
REM ========================================
echo.
echo Checking environment...
echo.

REM Check PostgreSQL
if not defined POSTGRES_BIN (
    echo [ERROR] PostgreSQL not found!
    echo Please install PostgreSQL 17, 15, or 14
    echo [ERROR] PostgreSQL not found >> "%LOG_FILE%"
    pause
    exit /b 1
)
echo [OK] PostgreSQL: !POSTGRES_BIN!
echo [OK] PostgreSQL: !POSTGRES_BIN! >> "%LOG_FILE%"

REM Check pg_dump
if not exist "!POSTGRES_BIN!\pg_dump.exe" (
    echo [ERROR] pg_dump.exe not found!
    echo [ERROR] pg_dump not found >> "%LOG_FILE%"
    pause
    exit /b 1
)

REM Check 7-Zip
if not exist "%SEVENZIP%" (
    echo [ERROR] 7-Zip not found!
    echo Please install 7-Zip from https://www.7-zip.org/
    echo [ERROR] 7-Zip not found >> "%LOG_FILE%"
    pause
    exit /b 1
)
echo [OK] 7-Zip: %SEVENZIP%
echo [OK] 7-Zip found >> "%LOG_FILE%"

REM Check database
echo.
echo Testing database connection...
set PGPASSWORD=%DB_PASSWORD%
"!POSTGRES_BIN!\psql.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -c "SELECT 1;" >nul
if errorlevel 1 (
    echo [ERROR] Cannot connect to database!
    echo Check: DB_NAME=%DB_NAME%, DB_USER=%DB_USER%
    echo [ERROR] Database connection failed >> "%LOG_FILE%"
    pause
    exit /b 1
)
echo [OK] Database connected: %DB_NAME%
echo [OK] Database connected >> "%LOG_FILE%"

REM Check app directory
if not exist "%APP_DIR%" (
    echo [ERROR] App directory not found: %APP_DIR%
    echo [ERROR] App directory not found >> "%LOG_FILE%"
    pause
    exit /b 1
)
echo [OK] App directory: %APP_DIR%
echo [OK] App directory found >> "%LOG_FILE%"

REM Check disk space (simple version)
echo.
echo Checking disk space...
for /f "tokens=3" %%a in ('dir C:\ ^| find "bytes free"') do set FREE_SPACE=%%a
if defined FREE_SPACE (
    echo Disk free on C:: %FREE_SPACE% bytes
    echo Disk free: %FREE_SPACE% >> "%LOG_FILE%"
)

echo.
echo All checks passed!
echo.
echo ========================================
echo STARTING BACKUP
echo ========================================
echo. >> "%LOG_FILE%"

REM Create temp dir
mkdir "%TEMP_BACKUP_DIR%"

REM ========================================
REM BACKUP DATABASE
REM ========================================
echo.
echo [1/3] Backing up database...
set DB_SQL=%TEMP_BACKUP_DIR%\%DB_NAME%_backup.sql
set DB_CUSTOM=%TEMP_BACKUP_DIR%\%DB_NAME%_backup.custom

set PGPASSWORD=%DB_PASSWORD%
"!POSTGRES_BIN!\pg_dump.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -F p -f "%DB_SQL%" %DB_NAME% >nul 2>&1
if errorlevel 1 (
    echo [ERROR] SQL backup failed!
    echo [ERROR] SQL backup failed >> "%LOG_FILE%"
    pause
    exit /b 1
)
echo - SQL backup created

"!POSTGRES_BIN!\pg_dump.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -F c -f "%DB_CUSTOM%" %DB_NAME% >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Custom backup failed!
    echo [ERROR] Custom backup failed >> "%LOG_FILE%"
    pause
    exit /b 1
)
echo - Custom backup created

REM Get DB size
for %%A in ("%DB_CUSTOM%") do set DB_SIZE=%%~zA
set /a DB_MB=!DB_SIZE! / 1048576
echo - Database backup: !DB_MB! MB
echo Database backup: !DB_MB! MB >> "%LOG_FILE%"

REM Verify
"!POSTGRES_BIN!\pg_restore.exe" -l "%DB_CUSTOM%" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Backup verification failed!
    echo [ERROR] Verification failed >> "%LOG_FILE%"
    pause
    exit /b 1
)
echo - Backup verified
echo [OK] Database backup complete!
echo Database backup: OK >> "%LOG_FILE%"

REM ========================================
REM BACKUP FILES
REM ========================================
echo.
echo [2/3] Backing up application files...
set APP_BACKUP=%TEMP_BACKUP_DIR%\app

robocopy "%APP_DIR%" "%APP_BACKUP%" /E /Z /R:1 /W:3 /XD node_modules .git .next /XF *.log .env /NFL /NDL /NJH /NJS >nul
if errorlevel 8 (
    echo [ERROR] File backup failed!
    echo [ERROR] File backup failed >> "%LOG_FILE%"
    pause
    exit /b 1
)

REM Get app size
for /f "tokens=3" %%a in ('dir "%APP_BACKUP%" /s /-c ^| find "File(s)"') do set APP_SIZE=%%a
if defined APP_SIZE (
    set /a APP_MB=!APP_SIZE! / 1048576
    echo - Application files: !APP_MB! MB
    echo Application files: !APP_MB! MB >> "%LOG_FILE%"
)
echo [OK] File backup complete!
echo File backup: OK >> "%LOG_FILE%"

REM ========================================
REM COMPRESS
REM ========================================
echo.
echo [3/3] Compressing backup...
"%SEVENZIP%" a -t7z -mx=9 "%BACKUP_FILE%" "%TEMP_BACKUP_DIR%\*" >nul
if errorlevel 1 (
    echo [ERROR] Compression failed!
    echo [ERROR] Compression failed >> "%LOG_FILE%"
    pause
    exit /b 1
)

REM Get archive size
for %%A in ("%BACKUP_FILE%") do set ARCHIVE_SIZE=%%~zA
set /a ARCHIVE_MB=!ARCHIVE_SIZE! / 1048576
echo - Archive: !ARCHIVE_MB! MB
echo Archive: !ARCHIVE_MB! MB >> "%LOG_FILE%"
echo [OK] Compression complete!
echo Compression: OK >> "%LOG_FILE%"

REM ========================================
REM CLEANUP
REM ========================================
echo.
echo Cleaning up...
rd /s /q "%TEMP_BACKUP_DIR%" >nul 2>&1

echo - Removing old backups (older than %RETAIN_DAYS% days)...
forfiles /p "%BACKUP_DIR%" /m *.7z /d -%RETAIN_DAYS% /c "cmd /c del @path" >nul 2>&1

echo - Removing old logs (older than 30 days)...
forfiles /p "%LOG_DIR%" /m *.log /d -30 /c "cmd /c del @path" >nul 2>&1

echo [OK] Cleanup complete!
echo Cleanup: OK >> "%LOG_FILE%"

REM ========================================
REM SUMMARY
REM ========================================
echo.
echo ========================================
echo BACKUP SUMMARY
echo ========================================
echo Started: %START_TIME%
echo Finished: %time%
echo.
echo Backup file: %BACKUP_FILE%
echo Total size: !ARCHIVE_MB! MB
echo Database: !DB_MB! MB
echo Application: !APP_MB! MB
echo.
echo STATUS: SUCCESS
echo ========================================

echo. >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo SUMMARY >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo Backup file: %BACKUP_FILE% >> "%LOG_FILE%"
echo Total size: !ARCHIVE_MB! MB >> "%LOG_FILE%"
echo Database: !DB_MB! MB >> "%LOG_FILE%"
echo Application: !APP_MB! MB >> "%LOG_FILE%"
echo STATUS: SUCCESS >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"

echo.
echo Backup completed successfully!
echo.
pause

ENDLOCAL
exit /b 0
