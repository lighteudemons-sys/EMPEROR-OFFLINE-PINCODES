@echo off
REM ========================================
REM EMPEROR POS - Comprehensive Backup Script (Simplified)
REM ========================================

SETLOCAL EnableDelayedExpansion

REM ========================================
REM CONFIGURATION
REM ========================================

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

REM Backup Retention
set RETAIN_DAYS=30

REM Backup Paths - Auto-detect PostgreSQL version
set POSTGRES_BIN=
if exist "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" set POSTGRES_BIN=C:\Program Files\PostgreSQL\17\bin
if exist "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe" set POSTGRES_BIN=C:\Program Files\PostgreSQL\15\bin
if exist "C:\Program Files\PostgreSQL\14\bin\pg_dump.exe" set POSTGRES_BIN=C:\Program Files\PostgreSQL\14\bin

set SEVENZIP=C:\Program Files\7-Zip\7z.exe

REM Rclone Configuration (Optional)
set RCLONE_EXE=rclone.exe
set RCLONE_REMOTE=gdrive
set RCLONE_PATH=POS_Backups
set RCLONE_ENABLED=0

REM Email Notifications (Optional)
set ENABLE_EMAIL=0

REM ========================================
REM INITIALIZE VARIABLES
REM ========================================

set START_TIME=%time%
set DATE=%date:~-4,4%%date:~-7,2%%date:~-10,2%
set TIME=%time:~0,2%%time:~3,2%%time:~6,2%
set TIME=%TIME: =0%
set TIMESTAMP=%DATE%_%TIME%

set LOG_FILE=%LOG_DIR%\backup_%TIMESTAMP%.log
set BACKUP_FILE=%BACKUP_DIR%\backup_%TIMESTAMP%.7z
set TEMP_BACKUP_DIR=%TEMP_DIR%\%TIMESTAMP%

set ERROR_OCCURRED=0
set ERROR_MESSAGE=
set BACKUP_SIZE=0
set DB_BACKUP_SIZE=0
set APP_SIZE=0
set RCLONE_AVAILABLE=0

REM ========================================
REM MAIN EXECUTION
REM ========================================

cls
echo EMPEROR POS - Comprehensive Backup Script
echo ========================================
echo Started at: %DATE% %TIME%
echo.

REM Create directories
if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Initialize log file
echo ======================================== > "%LOG_FILE%"
echo EMPEROR POS BACKUP STARTED >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo Date: %DATE% >> "%LOG_FILE%"
echo Time: %TIME% >> "%LOG_FILE%"
echo Timestamp: %TIMESTAMP% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo [OK] Log file initialized: %LOG_FILE%

REM ========================================
REM PRE-FLIGHT CHECKS
REM ========================================
echo.
echo ========================================
echo PRE-FLIGHT CHECKS
echo ========================================

echo.
echo [1/7] Checking disk space...
for /f "skip=1 tokens=3" %%a in ('wmic logicaldisk where "name='C:'" get freespace') do (
    set FREE_BYTES=%%a
    if defined FREE_BYTES (
        set /a FREE_MB=!FREE_BYTES! / 1048576
        set /a FREE_GB=!FREE_MB! / 1024
    )
)
if defined FREE_GB (
    echo [OK] Available disk space on C: : !FREE_GB! GB
    echo [OK] Available disk space on C: : !FREE_GB! GB >> "%LOG_FILE%"
    if !FREE_GB! LSS 5 (
        echo [ERROR] Insufficient disk space (less than 5 GB). Aborting backup.
        echo [ERROR] Insufficient disk space - Aborting >> "%LOG_FILE%"
        pause
        exit /b 1
    )
) else (
    echo [WARNING] Could not determine disk space, proceeding anyway
    echo [WARNING] Could not determine disk space >> "%LOG_FILE%"
)

echo.
echo [2/7] Checking PostgreSQL installation...
if not defined POSTGRES_BIN (
    echo [ERROR] PostgreSQL binaries not found.
    echo [ERROR] Please install PostgreSQL or update POSTGRES_BIN in the script.
    echo [ERROR] PostgreSQL not found >> "%LOG_FILE%"
    pause
    exit /b 1
)
if exist "!POSTGRES_BIN!\pg_dump.exe" (
    echo [OK] PostgreSQL found at: !POSTGRES_BIN!
    echo [OK] PostgreSQL found at: !POSTGRES_BIN! >> "%LOG_FILE%"
) else (
    echo [ERROR] pg_dump.exe not found at: !POSTGRES_BIN!\pg_dump.exe
    echo [ERROR] pg_dump.exe not found >> "%LOG_FILE%"
    pause
    exit /b 1
)

echo.
echo [3/7] Checking PostgreSQL service...
sc query postgresql-x64-17 2>nul | findstr RUNNING >nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL 17 service is running
    echo [OK] PostgreSQL service is running >> "%LOG_FILE%"
) else (
    sc query postgresql-x64-15 2>nul | findstr RUNNING >nul
    if %ERRORLEVEL% EQU 0 (
        echo [OK] PostgreSQL 15 service is running
        echo [OK] PostgreSQL service is running >> "%LOG_FILE%"
    ) else (
        echo [WARNING] Could not verify PostgreSQL service status
        echo [WARNING] Could not verify PostgreSQL service >> "%LOG_FILE%"
    )
)

echo.
echo [4/7] Checking 7-Zip installation...
if exist "%SEVENZIP%" (
    echo [OK] 7-Zip found at: %SEVENZIP%
    echo [OK] 7-Zip found >> "%LOG_FILE%"
) else (
    echo [ERROR] 7-Zip not found at: %SEVENZIP%
    echo [ERROR] 7-Zip not found >> "%LOG_FILE%"
    pause
    exit /b 1
)

echo.
echo [5/7] Checking rclone installation...
where %RCLONE_EXE% >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] rclone not found in PATH. Cloud upload will be disabled.
    echo [INFO] rclone not found - cloud disabled >> "%LOG_FILE%"
    set RCLONE_AVAILABLE=0
) else (
    if %RCLONE_ENABLED% EQU 1 (
        set RCLONE_AVAILABLE=1
        echo [OK] rclone is available and enabled
        echo [OK] rclone enabled >> "%LOG_FILE%"
    ) else (
        set RCLONE_AVAILABLE=0
        echo [INFO] rclone found but cloud upload is disabled
        echo [INFO] rclone disabled by config >> "%LOG_FILE%"
    )
)

echo.
echo [6/7] Testing database connectivity...
set PGPASSWORD=%DB_PASSWORD%
"!POSTGRES_BIN!\psql.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -c "SELECT 1;" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Cannot connect to database: %DB_NAME%
    echo [ERROR] Database connection failed >> "%LOG_FILE%"
    echo Please check:
    echo   - Database name: %DB_NAME%
    echo   - User: %DB_USER%
    echo   - PostgreSQL service is running
    echo   - Password is correct
    pause
    exit /b 1
)
echo [OK] Database connectivity verified
echo [OK] Database connectivity verified >> "%LOG_FILE%"

echo.
echo [7/7] Checking application directory...
if exist "%APP_DIR%" (
    echo [OK] Application directory exists: %APP_DIR%
    echo [OK] Application directory found >> "%LOG_FILE%"
) else (
    echo [ERROR] Application directory not found: %APP_DIR%
    echo [ERROR] Application directory not found >> "%LOG_FILE%"
    pause
    exit /b 1
)

echo.
echo ========================================
echo All pre-flight checks passed
echo ========================================
echo. >> "%LOG_FILE%"

REM Create temp directory
mkdir "%TEMP_BACKUP_DIR%" 2>nul

REM ========================================
REM BACKUP DATABASE
REM ========================================
echo.
echo ========================================
echo BACKING UP POSTGRESQL DATABASE
echo ========================================

set DB_BACKUP_FILE=%TEMP_BACKUP_DIR%\%DB_NAME%_backup.sql
set CUSTOM_BACKUP_FILE=%TEMP_BACKUP_DIR%\%DB_NAME%_backup.custom

echo.
echo Database: %DB_NAME%
echo Host: %DB_HOST%:%DB_PORT%
echo Backup file: %DB_BACKUP_FILE%
echo.

echo [1/3] Creating database backup (custom format)...
set PGPASSWORD=%DB_PASSWORD%
"!POSTGRES_BIN!\pg_dump.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -F c -f "%CUSTOM_BACKUP_FILE%" -v %DB_NAME% >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Database backup (custom format) failed
    echo [ERROR] Custom backup failed >> "%LOG_FILE%"
    pause
    exit /b 1
)
echo [OK] Custom backup created

echo [2/3] Creating SQL dump for portability...
"!POSTGRES_BIN!\pg_dump.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -F p -f "%DB_BACKUP_FILE%" -v %DB_NAME% >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Database backup (SQL format) failed
    echo [ERROR] SQL backup failed >> "%LOG_FILE%"
    pause
    exit /b 1
)
echo [OK] SQL backup created

echo [3/3] Verifying database backup files...
if not exist "%CUSTOM_BACKUP_FILE%" (
    echo [ERROR] Custom backup file not created
    echo [ERROR] Custom backup file missing >> "%LOG_FILE%"
    pause
    exit /b 1
)
if not exist "%DB_BACKUP_FILE%" (
    echo [ERROR] SQL backup file not created
    echo [ERROR] SQL backup file missing >> "%LOG_FILE%"
    pause
    exit /b 1
)

REM Get backup size
for %%A in ("%CUSTOM_BACKUP_FILE%") do set DB_BACKUP_SIZE=%%~zA
set /a DB_BACKUP_MB=!DB_BACKUP_SIZE! / 1048576
set /a DB_BACKUP_REM=!DB_BACKUP_SIZE! %% 1048576
set /a DB_BACKUP_KB=!DB_BACKUP_REM! / 1024
echo [OK] Database backup created: !DB_BACKUP_MB! MB !DB_BACKUP_KB! KB
echo [OK] Database backup: !DB_BACKUP_MB! MB !DB_BACKUP_KB! KB >> "%LOG_FILE%"

echo Testing backup integrity...
"!POSTGRES_BIN!\pg_restore.exe" -l "%CUSTOM_BACKUP_FILE%" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Backup file is corrupted or invalid
    echo [ERROR] Backup corrupted >> "%LOG_FILE%"
    pause
    exit /b 1
)
echo [OK] Backup integrity verified
echo [OK] Backup integrity verified >> "%LOG_FILE%"

echo.
echo DATABASE BACKUP COMPLETED
echo. >> "%LOG_FILE%"

REM ========================================
REM BACKUP APPLICATION FILES
REM ========================================
echo.
echo ========================================
echo BACKING UP APPLICATION FILES
echo ========================================

set APP_BACKUP_DIR=%TEMP_BACKUP_DIR%\app

echo Source: %APP_DIR%
echo Destination: %APP_BACKUP_DIR%
echo.

echo Copying application files (this may take a while)...
robocopy "%APP_DIR%" "%APP_BACKUP_DIR%" /E /Z /R:3 /W:5 /COPY:DAT /XD node_modules .git .next /XF *.log .env.production .env.local .env /LOG+:"%LOG_FILE%" /NFL /NDL /NJH /NJS
set ROBOCOPY_EXIT=%ERRORLEVEL%

REM Robocopy returns 0 or 1 for success, 7 for no files to copy
if %ROBOCOPY_EXIT% LEQ 7 (
    echo [OK] Application files copied successfully
    echo [OK] Application files copied >> "%LOG_FILE%"
) else (
    echo [ERROR] Robocopy failed with exit code: %ROBOCOPY_EXIT%
    echo [ERROR] Robocopy failed: %ROBOCOPY_EXIT% >> "%LOG_FILE%"
    pause
    exit /b 1
)

REM Get backup size
for /f "tokens=3" %%a in ('dir "%APP_BACKUP_DIR%" /s /-c ^| find "File(s)"') do set APP_SIZE=%%a
if defined APP_SIZE (
    set /a APP_MB=!APP_SIZE! / 1048576
    set /a APP_REM=!APP_SIZE! %% 1048576
    set /a APP_KB=!APP_REM! / 1024
    echo [OK] Application backup size: !APP_MB! MB !APP_KB! KB
    echo [OK] Application backup: !APP_MB! MB !APP_KB! KB >> "%LOG_FILE%"
)

echo.
echo APPLICATION FILES BACKUP COMPLETED
echo. >> "%LOG_FILE%"

REM ========================================
REM COMPRESS BACKUP
REM ========================================
echo.
echo ========================================
echo COMPRESSING BACKUP
echo ========================================

echo.
echo Creating 7-Zip archive...
echo Source: %TEMP_BACKUP_DIR%
echo Destination: %BACKUP_FILE%
echo Compression level: Maximum (9)
echo.

"%SEVENZIP%" a -t7z -mx=9 -m0=lzma2 -md=1536m -mfb=64 -ms=on "%BACKUP_FILE%" "%TEMP_BACKUP_DIR%\*" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Archive creation failed
    echo [ERROR] Archive creation failed >> "%LOG_FILE%"
    pause
    exit /b 1
)

echo Verifying archive integrity...
"%SEVENZIP%" t "%BACKUP_FILE%" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Archive verification failed
    echo [ERROR] Archive verification failed >> "%LOG_FILE%"
    pause
    exit /b 1
)

REM Get archive size
for %%A in ("%BACKUP_FILE%") do set BACKUP_SIZE=%%~zA
set /a BACKUP_MB=!BACKUP_SIZE! / 1048576
set /a BACKUP_REM=!BACKUP_SIZE! %% 1048576
set /a BACKUP_KB=!BACKUP_REM! / 1024
echo [OK] Archive created successfully: !BACKUP_MB! MB !BACKUP_KB! KB
echo [OK] Archive: !BACKUP_MB! MB !BACKUP_KB! KB >> "%LOG_FILE%"

echo.
echo COMPRESSION COMPLETED
echo. >> "%LOG_FILE%"

REM ========================================
REM UPLOAD TO CLOUD (Optional)
REM ========================================
if %RCLONE_AVAILABLE% EQU 1 (
    echo.
    echo ========================================
    echo UPLOADING TO CLOUD
    echo ========================================

    echo Checking rclone configuration...
    %RCLONE_EXE% listremotes | findstr /i "%RCLONE_REMOTE%:" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [WARNING] rclone remote '%RCLONE_REMOTE%' not configured, skipping upload
        echo [WARNING] rclone not configured >> "%LOG_FILE%"
    ) else (
        echo Uploading to %RCLONE_REMOTE%:%RCLONE_PATH%...
        %RCLONE_EXE% copy "%BACKUP_FILE%" "%RCLONE_REMOTE%:%RCLONE_PATH%/backup_%TIMESTAMP%.7z" --progress --transfers 4 >> "%LOG_FILE%" 2>&1
        if %ERRORLEVEL% NEQ 0 (
            echo [ERROR] Upload to cloud failed
            echo [ERROR] Cloud upload failed >> "%LOG_FILE%"
        ) else (
            echo Verifying cloud upload...
            %RCLONE_EXE% ls "%RCLONE_REMOTE%:%RCLONE_PATH%/backup_%TIMESTAMP%.7z" >nul 2>&1
            if %ERRORLEVEL% NEQ 0 (
                echo [WARNING] Cloud backup verification failed
                echo [WARNING] Cloud verification failed >> "%LOG_FILE%"
            ) else (
                echo [OK] Cloud upload verified
                echo [OK] Cloud upload verified >> "%LOG_FILE%"
            )
        )
    )

    echo.
    echo CLOUD UPLOAD COMPLETED
    echo. >> "%LOG_FILE%"
)

REM ========================================
 CLEANUP
REM ========================================
echo.
echo ========================================
echo CLEANUP
echo ========================================

if exist "%TEMP_BACKUP_DIR%" (
    echo Removing temporary directory: %TEMP_BACKUP_DIR%
    rd /s /q "%TEMP_BACKUP_DIR%" 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Temporary directory removed
        echo [OK] Temp directory removed >> "%LOG_FILE%"
    ) else (
        echo [WARNING] Failed to remove temporary directory
        echo [WARNING] Failed to remove temp >> "%LOG_FILE%"
    )
)

echo Cleaning up old backups (older than %RETAIN_DAYS% days)...
forfiles /p "%BACKUP_DIR%" /m *.7z /d -%RETAIN_DAYS% /c "cmd /c del @path 2>nul" 2>nul
echo [OK] Old backups cleaned up
echo [OK] Old backups cleaned up >> "%LOG_FILE%"

echo Cleaning up old log files (older than 30 days)...
forfiles /p "%LOG_DIR%" /m *.log /d -30 /c "cmd /c del @path 2>nul" 2>nul
echo [OK] Old log files cleaned up
echo [OK] Old logs cleaned up >> "%LOG_FILE%"

echo.
echo CLEANUP COMPLETED
echo. >> "%LOG_FILE%"

REM ========================================
REM SUMMARY
REM ========================================
echo.
echo ========================================
echo BACKUP SUMMARY REPORT
echo ========================================

set END_TIME=%time%
echo Start Time: %START_TIME%
echo End Time: %END_TIME%
echo Backup File: %BACKUP_FILE%
echo Log File: %LOG_FILE%
echo.
echo Backup Sizes:
echo   - Total Archive: !BACKUP_MB! MB !BACKUP_KB! KB
echo   - Database: !DB_BACKUP_MB! MB !DB_BACKUP_KB! KB
if defined APP_SIZE (
    echo   - Application: !APP_MB! MB !APP_KB! KB
)
echo.
echo STATUS: SUCCESS
echo ========================================

echo. >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo BACKUP SUMMARY >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo Start Time: %START_TIME% >> "%LOG_FILE%"
echo End Time: %END_TIME% >> "%LOG_FILE%"
echo Backup File: %BACKUP_FILE% >> "%LOG_FILE%"
echo Total Archive: !BACKUP_MB! MB !BACKUP_KB! KB >> "%LOG_FILE%"
echo Database: !DB_BACKUP_MB! MB !DB_BACKUP_KB! KB >> "%LOG_FILE%"
if defined APP_SIZE echo Application: !APP_MB! MB !APP_KB! KB >> "%LOG_FILE%"
echo STATUS: SUCCESS >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
echo BACKUP COMPLETED SUCCESSFULLY >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"

echo.
echo Backup completed successfully!
echo.
pause

ENDLOCAL
exit /b 0
