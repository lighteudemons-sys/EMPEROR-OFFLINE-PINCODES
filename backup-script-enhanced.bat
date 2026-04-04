@echo off
REM ========================================
REM EMPEROR POS - Comprehensive Backup Script
REM ========================================
REM Author: Emperor POS System
REM Description: Full backup of PostgreSQL database and application files
REM Schedule: Run every 24 hours via Task Scheduler
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
set RETAIN_WEEKLY=8
set RETAIN_MONTHLY=12

REM Backup Paths
set POSTGRES_BIN=C:\Program Files\PostgreSQL\17\bin
set SEVENZIP=C:\Program Files\7-Zip\7z.exe
set RCLONE_EXE=rclone.exe

REM Rclone Configuration
set RCLONE_REMOTE=gdrive
set RCLONE_PATH=POS_Backups

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
set APP_BACKUP_SIZE=0

REM ========================================
REM FUNCTIONS
REM ========================================

:Log
echo [%date% %time%] %* >> "%LOG_FILE%"
echo [%date% %time%] %*
goto :eof

:LogError
echo [%date% %time%] [ERROR] %* >> "%LOG_FILE%"
echo [%date% %time%] [ERROR] %*
set ERROR_OCCURRED=1
set ERROR_MESSAGE=!ERROR_MESSAGE! %*;
goto :eof

:LogSuccess
echo [%date% %time%] [SUCCESS] %* >> "%LOG_FILE%"
echo [%date% %time%] [SUCCESS] %*
goto :eof

:LogWarning
echo [%date% %time%] [WARNING] %* >> "%LOG_FILE%"
echo [%date% %time%] [WARNING] %*
goto :eof

:CheckError
if %ERRORLEVEL% NEQ 0 (
    call :LogError "Command failed with exit code: %ERRORLEVEL%"
    exit /b %ERRORLEVEL%
)
goto :eof

:GetFileSize
for %%A in ("%~1") do set FILE_SIZE=%%~zA
if "%~2" neq "" set %~2=%FILE_SIZE%
goto :eof

:FormatBytes
set /a MB=%~1 / 1048576
set /a REMINDER=%~1 %% 1048576
set /a KB=%REMINDER% / 1024
set %~2=%MB% MB %KB% KB
goto :eof

:SendEmail
if %ENABLE_EMAIL% EQU 0 goto :eof
echo Sending email notification: %~1
powershell -Command "Send-MailMessage -From '%EMAIL_FROM%' -To '%EMAIL_TO%' -Subject '[Backup] %~1' -Body '%~2' -SmtpServer '%SMTP_SERVER%' -Port %SMTP_PORT% -UseSsl -Credential (New-Object System.Management.Automation.PSCredential('%SMTP_USER%', (ConvertTo-SecureString '%SMTP_PASSWORD%' -AsPlainText -Force)))"
goto :eof

:CleanupOldBackups
call :Log "Cleaning up old backups..."
forfiles /p "%BACKUP_DIR%" /m *.7z /d -%RETAIN_DAYS% /c "cmd /c call :DeleteBackup @path" 2>nul
call :Log "Cleanup completed"
goto :eof

:DeleteBackup
call :Log "Deleting old backup: %~1"
del "%~1" 2>nul
if %ERRORLEVEL% EQU 0 (
    call :LogSuccess "Deleted: %~n1"
) else (
    call :LogWarning "Failed to delete: %~n1"
)
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
wmic logicaldisk get name,freespace | findstr /C:"C:" >nul
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=2" %%a in ('wmic logicaldisk where "name='C:'" get freespace /value ^| findstr "="') do set FREE_SPACE=%%a
    set /a FREE_MB=!FREE_SPACE! / 1048576
    call :Log "Available disk space on C: : !FREE_MB! MB"
    if !FREE_MB! LSS 5000 (
        call :LogError "Insufficient disk space (less than 5 GB). Aborting backup."
        exit /b 1
    )
)

REM Check PostgreSQL service
call :Log "Checking PostgreSQL service..."
sc query postgresql-x64-17 | findstr RUNNING >nul
if %ERRORLEVEL% NEQ 0 (
    call :LogWarning "PostgreSQL service is not running"
) else (
    call :LogSuccess "PostgreSQL service is running"
)

REM Check if required tools exist
if not exist "%POSTGRES_BIN%\pg_dump.exe" (
    call :LogError "pg_dump.exe not found at: %POSTGRES_BIN%\pg_dump.exe"
    exit /b 1
)

if not exist "%SEVENZIP%" (
    call :LogError "7-Zip not found at: %SEVENZIP%"
    exit /b 1
)

where %RCLONE_EXE% >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :LogWarning "rclone not found in PATH. Upload to cloud will be skipped."
    set RCLONE_AVAILABLE=0
) else (
    set RCLONE_AVAILABLE=1
    call :LogSuccess "rclone is available"
)

REM Check database connectivity
call :Log "Testing database connectivity..."
set PGPASSWORD=%DB_PASSWORD%
"%POSTGRES_BIN%\psql.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -c "SELECT 1;" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :LogError "Cannot connect to database: %DB_NAME%"
    exit /b 1
)
call :LogSuccess "Database connectivity verified"

REM Check application directory
if not exist "%APP_DIR%" (
    call :LogError "Application directory not found: %APP_DIR%"
    exit /b 1
)
call :LogSuccess "Application directory exists"

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
call :Log "Backup file: %DB_BACKUP_FILE%"

REM Create backup using custom format for better restore options
call :Log "Creating database backup (custom format)..."
set PGPASSWORD=%DB_PASSWORD%
"%POSTGRES_BIN%\pg_dump.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -F c -f "%CUSTOM_BACKUP_FILE%" -v %DB_NAME% >> "%LOG_FILE%" 2>&1
call :CheckError

REM Also create SQL backup for portability
call :Log "Creating SQL dump for portability..."
"%POSTGRES_BIN%\pg_dump.exe" -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -F p -f "%DB_BACKUP_FILE%" -v %DB_NAME% >> "%LOG_FILE%" 2>&1
call :CheckError

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
call :FormatBytes %DB_BACKUP_SIZE% FORMATTED_SIZE
call :LogSuccess "Database backup created: %FORMATTED_SIZE%"

REM Test restore (dry run)
call :Log "Testing backup integrity (dry run restore)..."
"%POSTGRES_BIN%\pg_restore.exe" -l "%CUSTOM_BACKUP_FILE%" >nul 2>&1
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

REM Create robocopy exclusion file
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
) > "%EXCLUDES_FILE%"

REM Copy application files
call :Log "Copying application files (this may take a while)..."
robocopy "%APP_DIR%" "%APP_BACKUP_DIR%" /E /Z /R:3 /W:5 /COPYALL /XD node_modules .git .next /XF *.log .env.production .env.local /LOG+:"%LOG_FILE%" /NFL /NDL /NJH /NJS
set ROBOCOPY_EXIT=%ERRORLEVEL%

REM Robocopy returns 0 or 1 for success
if %ROBOCOPY_EXIT% LEQ 1 (
    call :LogSuccess "Application files copied successfully"
) else (
    call :LogError "Robocopy failed with exit code: %ROBOCOPY_EXIT%"
)

REM Get backup size
call :Log "Calculating application backup size..."
for /f "tokens=3" %%a in ('dir "%APP_BACKUP_DIR%" /s /-c ^| find "File(s)"') do set APP_SIZE=%%a
if defined APP_SIZE (
    call :FormatBytes %APP_SIZE% FORMATTED_SIZE
    call :LogSuccess "Application backup size: %FORMATTED_SIZE%"
)

REM Clean up exclude file
if exist "%EXCLUDES_FILE%" del "%EXCLUDES_FILE%"

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
call :CheckError

REM Verify archive
call :Log "Verifying archive integrity..."
"%SEVENZIP%" t "%BACKUP_FILE%" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :LogError "Archive verification failed"
    exit /b 1
)

REM Get archive size
call :GetFileSize "%BACKUP_FILE%" BACKUP_SIZE
call :FormatBytes %BACKUP_SIZE% FORMATTED_SIZE
call :LogSuccess "Archive created successfully: %FORMATTED_SIZE%"

call :Log "==========================================="
call :Log "COMPRESSION COMPLETED"
call :Log "==========================================="
goto :eof

:UploadToCloud
call :Log "==========================================="
call :Log "UPLOADING TO CLOUD"
call :Log "==========================================="

if %RCLONE_AVAILABLE% EQU 0 (
    call :LogWarning "rclone not available, skipping cloud upload"
    goto :eof
)

REM Check if rclone is configured
call :Log "Checking rclone configuration..."
%RCLONE_EXE% listremotes | findstr /i "%RCLONE_REMOTE%:" >nul
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
    call :LogError "Cloud backup verification failed"
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
    call :FormatBytes %BACKUP_SIZE% FORMATTED_SIZE
    call :Log "Total Backup Size: %FORMATTED_SIZE%"
)

if defined DB_BACKUP_SIZE (
    call :FormatBytes %DB_BACKUP_SIZE% DB_FORMATTED
    call :Log "Database Backup: %DB_FORMATTED%"
)

if defined APP_SIZE (
    call :FormatBytes %APP_SIZE% APP_FORMATTED
    call :Log "Application Backup: %APP_FORMATTED%"
)

call :Log "Backup File: %BACKUP_FILE%"
call :Log "Log File: %LOG_FILE%"

if %ERROR_OCCURRED% EQU 1 (
    call :Log "STATUS: FAILED"
    call :Log "Errors: %ERROR_MESSAGE%"
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
    echo STATUS: %ERROR_STATUS%
    echo.
    echo Backup File: %BACKUP_FILE%
    if defined BACKUP_SIZE echo Backup Size: %FORMATTED_SIZE%
    if defined DB_BACKUP_SIZE echo Database: %DB_FORMATTED%
    if defined APP_SIZE echo Application: %APP_FORMATTED%
    if %RCLONE_AVAILABLE% EQU 1 echo Cloud Upload: Enabled
    echo.
    if %ERROR_OCCURRED% EQU 1 (
        echo ERRORS:
        echo %ERROR_MESSAGE%
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
    rd /s /q "%TEMP_BACKUP_DIR%"
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
set ERROR_STATUS=SUCCESS
call :GenerateReport
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
set ERROR_STATUS=FAILED
call :Log "==========================================="
call :Log "BACKUP FAILED"
call :Log "==========================================="

REM Cleanup on failure
if exist "%TEMP_BACKUP_DIR%" rd /s /q "%TEMP_BACKUP_DIR%"

REM Send failure notification
if %ENABLE_EMAIL% EQU 1 (
    call :SendEmail "BACKUP FAILED" "Emperor POS backup FAILED on %DATE% %TIME%. Error: %ERROR_MESSAGE%. Check log: %LOG_FILE%"
)

echo.
echo ========================================
echo ERROR: BACKUP FAILED
echo ========================================
echo Error: %ERROR_MESSAGE%
echo Log File: %LOG_FILE%
echo ========================================

call :Log "==========================================="
call :Log "BACKUP FAILED - ABORTING"
call :Log "==========================================="

exit /b 1

:End
ENDLOCAL
exit /b 0
