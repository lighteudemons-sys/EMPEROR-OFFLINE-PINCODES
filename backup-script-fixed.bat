@echo off
REM ========================================
REM EMPEROR POS - Fixed Comprehensive Backup Script
REM ========================================
REM Author: Emperor POS System
REM Description: Full backup of PostgreSQL database and application files
REM Schedule: Run every 24 hours via Task Scheduler
REM Version: 2.0 (Fixed)
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
set SMTP_SERVER=smtp.gmail.com
set SMTP_PORT=587
set SMTP_USER=your-email@gmail.com
set SMTP_PASSWORD=your-app-password
set EMAIL_TO=admin@yourcompany.com
set EMAIL_FROM=backup@yourcompany.com

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
REM FUNCTIONS
REM ========================================

:Log
if not exist "%LOG_FILE%" (
    echo Creating log file: %LOG_FILE%
    echo. > "%LOG_FILE%"
)
echo [%date% %time%] %* >> "%LOG_FILE%"
echo [%date% %time%] %*
goto :eof

:LogError
call :Log [ERROR] %*
set ERROR_OCCURRED=1
set ERROR_MESSAGE=!ERROR_MESSAGE! %*;
goto :eof

:LogSuccess
call :Log [SUCCESS] %*
goto :eof

:LogWarning
call :Log [WARNING] %*
goto :eof

:CheckError
if %ERRORLEVEL% NEQ 0 (
    call :LogError "Command failed with exit code: %ERRORLEVEL%"
    exit /b %ERRORLEVEL%
)
goto :eof

:GetFileSize
if exist "%~1" (
    for %%A in ("%~1") do set FILE_SIZE=%%~zA
    if "%~2" neq "" set %~2=!FILE_SIZE!
) else (
    set %~2=0
)
goto :eof

:FormatBytes
set BYTES=%~1
if "!BYTES!"=="" set BYTES=0
set /a MB=!BYTES! / 1048576
set /a REMINDER=!BYTES! %% 1048576
set /a KB=!REMINDER! / 1024
set %~2=!MB! MB !KB! KB
goto :eof

:SendEmail
if %ENABLE_EMAIL% EQU 0 goto :eof
echo Sending email notification: %~1
powershell -Command "Send-MailMessage -From '%EMAIL_FROM%' -To '%EMAIL_TO%' -Subject '[Backup] %~1' -Body '%~2' -SmtpServer '%SMTP_SERVER%' -Port %SMTP_PORT% -UseSsl -Credential (New-Object System.Management.Automation.PSCredential('%SMTP_USER%', (ConvertTo-SecureString '%SMTP_PASSWORD%' -AsPlainText -Force)))" 2>nul
if %ERRORLEVEL% NEQ 0 call :LogWarning "Failed to send email notification"
goto :eof

:CleanupOldBackups
call :Log "Cleaning up old backups (older than %RETAIN_DAYS% days)..."
set DELETED_COUNT=0
forfiles /p "%BACKUP_DIR%" /m *.7z /d -%RETAIN_DAYS% /c "cmd /c del @path 2>nul & set /a DELETED_COUNT+=1" 2>nul
call :LogSuccess "Cleanup completed"
goto :eof

:PreFlightChecks
call :Log "==========================================="
call :Log "PRE-FLIGHT CHECKS"
call :Log "==========================================="

REM Check if directories exist
if not exist "%BACKUP_ROOT%" (
    call :Log "Creating backup root directory: %BACKUP_ROOT%"
    mkdir "%BACKUP_ROOT%"
)
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Check disk space
call :Log "Checking available disk space..."
for /f "skip=1 tokens=3" %%a in ('wmic logicaldisk where "name='C:'" get freespace') do (
    set FREE_BYTES=%%a
    if defined FREE_BYTES (
        set /a FREE_MB=!FREE_BYTES! / 1048576
        set /a FREE_GB=!FREE_MB! / 1024
    )
)
if defined FREE_GB (
    call :Log "Available disk space on C: : !FREE_GB! GB"
    if !FREE_GB! LSS 5 (
        call :LogError "Insufficient disk space (less than 5 GB). Aborting backup."
        exit /b 1
    )
) else (
    call :LogWarning "Could not determine disk space, proceeding anyway"
)

REM Check PostgreSQL installation
call :Log "Checking PostgreSQL installation..."
if not defined POSTGRES_BIN (
    call :LogError "PostgreSQL binaries not found. Please set POSTGRES_BIN in the script."
    exit /b 1
)
if exist "!POSTGRES_BIN!\pg_dump.exe" (
    call :LogSuccess "PostgreSQL found at: !POSTGRES_BIN!"
) else (
    call :LogError "pg_dump.exe not found at: !POSTGRES_BIN!\pg_dump.exe"
    exit /b 1
)

REM Check PostgreSQL service
call :Log "Checking PostgreSQL service..."
sc query postgresql-x64-17 2>nul | findstr RUNNING >nul
if %ERRORLEVEL% EQU 0 (
    call :LogSuccess "PostgreSQL service is running"
) else (
    sc query postgresql-x64-15 2>nul | findstr RUNNING >nul
    if %ERRORLEVEL% EQU 0 (
        call :LogSuccess "PostgreSQL service is running"
    ) else (
        call :LogWarning "Could not verify PostgreSQL service status"
    )
)

REM Check 7-Zip
if exist "%SEVENZIP%" (
    call :LogSuccess "7-Zip found at: %SEVENZIP%"
) else (
    call :LogError "7-Zip not found at: %SEVENZIP%"
    exit /b 1
)

REM Check rclone
where %RCLONE_EXE% >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :LogWarning "rclone not found in PATH. Cloud upload will be disabled."
    set RCLONE_AVAILABLE=0
) else (
    if %RCLONE_ENABLED% EQU 1 (
        set RCLONE_AVAILABLE=1
        call :LogSuccess "rclone is available and enabled"
    ) else (
        set RCLONE_AVAILABLE=0
        call :Log "rclone found but cloud upload is disabled (set RCLONE_ENABLED=1 to enable)"
    )
)

REM Check database connectivity
call :Log "Testing database connectivity..."
set PGPASSWORD=%DB_PASSWORD%
"!POSTGRES_BIN!\psql.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -c "SELECT 1;" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :LogError "Cannot connect to database: %DB_NAME%"
    call :LogError "Please check DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD"
    exit /b 1
)
call :LogSuccess "Database connectivity verified"

REM Check application directory
if exist "%APP_DIR%" (
    call :LogSuccess "Application directory exists: %APP_DIR%"
) else (
    call :LogError "Application directory not found: %APP_DIR%"
    exit /b 1
)

call :Log "==========================================="
call :Log "All pre-flight checks passed"
call :Log "==========================================="
goto :eof

:BackupDatabase
call :Log "==========================================="
call :Log "BACKING UP POSTGRESQL DATABASE"
call :Log "==========================================="

set DB_BACKUP_FILE=%TEMP_BACKUP_DIR%\%DB_NAME%_backup.sql
set CUSTOM_BACKUP_FILE=%TEMP_BACKUP_DIR%\%DB_NAME%_backup.custom

call :Log "Database: %DB_NAME%"
call :Log "Host: %DB_HOST%:%DB_PORT%"
call :Log "Backup file: %DB_BACKUP_FILE%"

REM Create custom format backup (better for restore)
call :Log "Creating database backup (custom format)..."
set PGPASSWORD=%DB_PASSWORD%
"!POSTGRES_BIN!\pg_dump.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -F c -f "%CUSTOM_BACKUP_FILE%" -v %DB_NAME% 2>&1 | find /v "pg_dump: reading schemas" | find /v "pg_dump: reading user-defined tables" | find /v "pg_dump: reading extensions" >nul
if %ERRORLEVEL% NEQ 0 (
    call :LogError "Database backup (custom format) failed"
    exit /b 1
)

REM Also create SQL backup for portability
call :Log "Creating SQL dump for portability..."
"!POSTGRES_BIN!\pg_dump.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -F p -f "%DB_BACKUP_FILE%" -v %DB_NAME% 2>&1 | find /v "pg_dump:" >nul
if %ERRORLEVEL% NEQ 0 (
    call :LogError "Database backup (SQL format) failed"
    exit /b 1
)

REM Verify backup files
call :Log "Verifying database backup files..."
if not exist "%CUSTOM_BACKUP_FILE%" (
    call :LogError "Custom backup file not created"
    exit /b 1
)
if not exist "%DB_BACKUP_FILE%" (
    call :LogError "SQL backup file not created"
    exit /b 1
)

REM Get backup size
call :GetFileSize "%CUSTOM_BACKUP_FILE%" DB_BACKUP_SIZE
call :FormatBytes !DB_BACKUP_SIZE! FORMATTED_SIZE
call :LogSuccess "Database backup created: %FORMATTED_SIZE%"

REM Test backup integrity
call :Log "Testing backup integrity..."
"!POSTGRES_BIN!\pg_restore.exe" -l "%CUSTOM_BACKUP_FILE%" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :LogError "Backup file is corrupted or invalid"
    exit /b 1
)
call :LogSuccess "Backup integrity verified"

call :Log "==========================================="
call :Log "DATABASE BACKUP COMPLETED"
call :Log "==========================================="
goto :eof

:BackupApplicationFiles
call :Log "==========================================="
call :Log "BACKING UP APPLICATION FILES"
call :Log "==========================================="

set APP_BACKUP_DIR=%TEMP_BACKUP_DIR%\app

call :Log "Source: %APP_DIR%"
call :Log "Destination: %APP_BACKUP_DIR%"

REM Create robocopy exclusion list
set EXCLUDES_FILE=%TEMP_DIR%\robocopy_excludes.txt
(
    echo node_modules\
    echo .git\
    echo .next\
    echo node_modules
    echo .git
    echo .next
    echo *.log
    echo .env.production
    echo .env.local
    echo .env
) > "%EXCLUDES_FILE%" 2>nul

REM Copy application files with exclusions
call :Log "Copying application files (this may take a while)..."
robocopy "%APP_DIR%" "%APP_BACKUP_DIR%" /E /Z /R:3 /W:5 /COPY:DAT /XD node_modules .git .next /XF *.log .env.production .env.local .env /LOG+:"%LOG_FILE%" /NFL /NDL /NJH /NJS
set ROBOCOPY_EXIT=%ERRORLEVEL%

REM Robocopy returns 0 or 1 for success, 7 for no files to copy
if %ROBOCOPY_EXIT% LEQ 7 (
    call :LogSuccess "Application files copied successfully"
) else (
    call :LogError "Robocopy failed with exit code: %ROBOCOPY_EXIT%"
    exit /b 1
)

REM Get backup size
call :Log "Calculating application backup size..."
for /f "tokens=3" %%a in ('dir "%APP_BACKUP_DIR%" /s /-c 2^>nul ^| find "File(s)"') do set APP_SIZE=%%a
if defined APP_SIZE (
    call :FormatBytes !APP_SIZE! FORMATTED_SIZE
    call :LogSuccess "Application backup size: %FORMATTED_SIZE%"
)

REM Clean up exclude file
if exist "%EXCLUDES_FILE%" del "%EXCLUDES_FILE%" 2>nul

call :Log "==========================================="
call :Log "APPLICATION FILES BACKUP COMPLETED"
call :Log "==========================================="
goto :eof

:CreateArchive
call :Log "==========================================="
call :Log "COMPRESSING BACKUP"
call :Log "==========================================="

call :Log "Creating 7-Zip archive..."
call :Log "Source: %TEMP_BACKUP_DIR%"
call :Log "Destination: %BACKUP_FILE%"
call :Log "Compression level: Maximum (9)"

REM Create archive with maximum compression
"%SEVENZIP%" a -t7z -mx=9 -m0=lzma2 -md=1536m -mfb=64 -ms=on "%BACKUP_FILE%" "%TEMP_BACKUP_DIR%\*" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :LogError "Archive creation failed"
    exit /b 1
)

REM Verify archive
call :Log "Verifying archive integrity..."
"%SEVENZIP%" t "%BACKUP_FILE%" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :LogError "Archive verification failed"
    exit /b 1
)

REM Get archive size
call :GetFileSize "%BACKUP_FILE%" BACKUP_SIZE
call :FormatBytes !BACKUP_SIZE! FORMATTED_SIZE
call :LogSuccess "Archive created successfully: %FORMATTED_SIZE%"

call :Log "==========================================="
call :Log "COMPRESSION COMPLETED"
call :Log "==========================================="
goto :eof

:UploadToCloud
if %RCLONE_AVAILABLE% EQU 0 (
    call :LogWarning "Cloud upload is disabled or rclone not available"
    goto :eof
)

call :Log "==========================================="
call :Log "UPLOADING TO CLOUD"
call :Log "==========================================="

REM Check if rclone is configured
call :Log "Checking rclone configuration..."
%RCLONE_EXE% listremotes | findstr /i "%RCLONE_REMOTE%:" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :LogWarning "rclone remote '%RCLONE_REMOTE%' not configured, skipping upload"
    goto :eof
)

REM Upload to cloud
call :Log "Uploading to %RCLONE_REMOTE%:%RCLONE_PATH%..."
%RCLONE_EXE% copy "%BACKUP_FILE%" "%RCLONE_REMOTE%:%RCLONE_PATH%/backup_%TIMESTAMP%.7z" --progress --transfers 4 >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :LogError "Upload to cloud failed"
    call :Log "Backup file is still available locally: %BACKUP_FILE%"
    goto :eof
)

REM Verify cloud upload
call :Log "Verifying cloud upload..."
%RCLONE_EXE% ls "%RCLONE_REMOTE%:%RCLONE_PATH%/backup_%TIMESTAMP%.7z" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :LogWarning "Cloud backup verification failed, but upload may have succeeded"
    goto :eof
)

call :LogSuccess "Cloud upload verified"
call :Log "Backup is now available at: %RCLONE_REMOTE%:%RCLONE_PATH%/backup_%TIMESTAMP%.7z"

call :Log "==========================================="
call :Log "CLOUD UPLOAD COMPLETED"
call :Log "==========================================="
goto :eof

:GenerateReport
call :Log "==========================================="
call :Log "BACKUP SUMMARY REPORT"
call :Log "==========================================="

set END_TIME=%time%
call :Log "Start Time: %START_TIME%"
call :Log "End Time: %END_TIME%"

if defined BACKUP_SIZE (
    call :FormatBytes !BACKUP_SIZE! FORMATTED_SIZE
    call :Log "Total Backup Size: %FORMATTED_SIZE%"
)

if defined DB_BACKUP_SIZE (
    call :FormatBytes !DB_BACKUP_SIZE! DB_FORMATTED
    call :Log "Database Backup: %DB_FORMATTED%"
)

if defined APP_SIZE (
    call :FormatBytes !APP_SIZE! APP_FORMATTED
    call :Log "Application Backup: %APP_FORMATTED%"
)

call :Log "Backup File: %BACKUP_FILE%"
call :Log "Log File: %LOG_FILE%"

if %ERROR_OCCURRED% EQU 1 (
    call :Log "STATUS: FAILED"
    call :Log "Errors: !ERROR_MESSAGE!"
) else (
    call :Log "STATUS: SUCCESS"
)

call :Log "==========================================="

REM Save summary to separate file
set SUMMARY_FILE=%LOG_DIR%\backup_summary_%TIMESTAMP%.txt
(
    echo EMPEROR POS BACKUP SUMMARY
    echo ==========================
    echo Date: %DATE%
    echo Time: %TIME%
    echo.
    if %ERROR_OCCURRED% EQU 1 (
        echo STATUS: FAILED
    ) else (
        echo STATUS: SUCCESS
    )
    echo.
    echo Backup File: %BACKUP_FILE%
    if defined BACKUP_SIZE echo Backup Size: %FORMATTED_SIZE%
    if defined DB_BACKUP_SIZE echo Database: %DB_FORMATTED%
    if defined APP_SIZE echo Application: %APP_FORMATTED%
    if %RCLONE_AVAILABLE% EQU 1 echo Cloud Upload: Enabled
    echo.
    if %ERROR_OCCURRED% EQU 1 (
        echo ERRORS:
        echo !ERROR_MESSAGE!
    )
) > "%SUMMARY_FILE%"

goto :eof

:Cleanup
call :Log "==========================================="
call :Log "CLEANUP"
call :Log "==========================================="

REM Remove temp directory
if exist "%TEMP_BACKUP_DIR%" (
    call :Log "Removing temporary directory: %TEMP_BACKUP_DIR%"
    rd /s /q "%TEMP_BACKUP_DIR%" 2>nul
    if %ERRORLEVEL% EQU 0 (
        call :LogSuccess "Temporary directory removed"
    ) else (
        call :LogWarning "Failed to remove temporary directory"
    )
)

REM Cleanup old local backups
call :CleanupOldBackups

REM Cleanup old log files (keep last 30 days)
call :Log "Cleaning up old log files..."
forfiles /p "%LOG_DIR%" /m *.log /d -30 /c "cmd /c del @path" 2>nul

REM Cleanup old summary files (keep last 30 days)
forfiles /p "%LOG_DIR%" /m backup_summary_*.txt /d -30 /c "cmd /c del @path" 2>nul

call :Log "==========================================="
call :Log "CLEANUP COMPLETED"
call :Log "==========================================="
goto :eof

:Main
REM ========================================
REM MAIN EXECUTION
REM ========================================

cls
echo EMPEROR POS - Comprehensive Backup Script
echo ========================================
echo Started at: %DATE% %TIME%
echo.

REM Initialize log file
call :Log "==========================================="
call :Log "EMPEROR POS BACKUP STARTED"
call :Log "==========================================="
call :Log "Date: %DATE%"
call :Log "Time: %TIME%"
call :Log "Timestamp: %TIMESTAMP%"
call :Log ""

REM Run pre-flight checks
call :PreFlightChecks
if %ERRORLEVEL% NEQ 0 goto :BackupFailed

REM Create temp directory
mkdir "%TEMP_BACKUP_DIR%" 2>nul

REM Backup database
call :BackupDatabase
if %ERRORLEVEL% NEQ 0 goto :BackupFailed

REM Backup application files
call :BackupApplicationFiles
if %ERRORLEVEL% NEQ 0 goto :BackupFailed

REM Create compressed archive
call :CreateArchive
if %ERRORLEVEL% NEQ 0 goto :BackupFailed

REM Upload to cloud
call :UploadToCloud
REM Don't fail if cloud upload fails

REM Generate report
call :GenerateReport

REM Cleanup
call :Cleanup

REM Send success notification
if %ENABLE_EMAIL% EQU 1 (
    call :SendEmail "Backup Successful" "Emperor POS backup completed successfully on %DATE% %TIME%. Backup file: %BACKUP_FILE%"
)

echo.
echo ========================================
echo BACKUP COMPLETED SUCCESSFULLY
echo ========================================
echo Backup File: %BACKUP_FILE%
echo Log File: %LOG_FILE%
echo Duration: %START_TIME% to %time%
echo ========================================

call :Log "==========================================="
call :Log "BACKUP COMPLETED SUCCESSFULLY"
call :Log "==========================================="

goto :End

:BackupFailed
call :Log "==========================================="
call :Log "BACKUP FAILED"
call :Log "==========================================="

REM Cleanup on failure
if exist "%TEMP_BACKUP_DIR%" rd /s /q "%TEMP_BACKUP_DIR%" 2>nul

REM Generate failure report
call :GenerateReport

REM Send failure notification
if %ENABLE_EMAIL% EQU 1 (
    call :SendEmail "BACKUP FAILED" "Emperor POS backup FAILED on %DATE% %TIME%. Error: !ERROR_MESSAGE!. Check log: %LOG_FILE%"
)

echo.
echo ========================================
echo ERROR: BACKUP FAILED
echo ========================================
echo Error: !ERROR_MESSAGE!
echo Log File: %LOG_FILE%
echo ========================================

call :Log "==========================================="
call :Log "BACKUP FAILED - ABORTING"
call :Log "==========================================="

exit /b 1

:End
ENDLOCAL
exit /b 0
