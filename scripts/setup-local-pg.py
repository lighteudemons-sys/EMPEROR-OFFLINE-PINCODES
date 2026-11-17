#!/usr/bin/env python3
"""
Set up an isolated local PostgreSQL instance for restore testing.

Creates a fresh PostgreSQL data directory in /tmp/pg-restore-test,
starts the server on a non-standard port (5433), creates a database
called 'menu_test_restore', and prints the connection string.

This NEVER touches production. The data directory is destroyed on each run.
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

import pgserver

# Where to install postgres
PG_BIN = Path(pgserver.__file__).parent / "pginstall" / "bin"
print(f"[setup] pgserver binaries: {PG_BIN}")
print(f"[setup] Contents: {list(PG_BIN.iterdir())[:15]}")

# Locate the actual postgres binaries
def find_bin(name):
    candidates = list(PG_BIN.rglob(name))
    if not candidates:
        # Try the system path
        p = shutil.which(name)
        if p:
            return Path(p)
        raise FileNotFoundError(f"Could not find {name}")
    # Prefer the one in the same directory
    return candidates[0]

INITDB = find_bin("initdb")
POSTGRES = find_bin("postgres")
PSQL = find_bin("psql")
PG_DUMP = find_bin("pg_dump")
CREATEDB = find_bin("createdb")

print(f"[setup] initdb:   {INITDB}")
print(f"[setup] postgres: {POSTGRES}")
print(f"[setup] psql:     {PSQL}")
print(f"[setup] pg_dump:  {PG_DUMP}")

# Set up data directory
DATA_DIR = Path("/tmp/pg-restore-test-data")
PORT = 5433
HOST = "127.0.0.1"
DB_NAME = "menu_test_restore"

# Clean up any previous instance
if DATA_DIR.exists():
    print(f"[setup] Cleaning up previous data directory: {DATA_DIR}")
    # Stop any running server first
    subprocess.run(["pkill", "-f", f"-D {DATA_DIR}"], capture_output=True)
    import time
    time.sleep(1)
    shutil.rmtree(DATA_DIR, ignore_errors=True)

DATA_DIR.parent.mkdir(parents=True, exist_ok=True)

# Initialize the database cluster
print(f"[setup] Initializing PostgreSQL cluster at {DATA_DIR}")
init_result = subprocess.run(
    [str(INITDB), "-D", str(DATA_DIR), "--username=postgres", "--auth=trust", "--encoding=UTF8"],
    capture_output=True,
    text=True,
)
if init_result.returncode != 0:
    print(f"[setup] initdb FAILED:\n{init_result.stderr}", file=sys.stderr)
    sys.exit(1)
print(f"[setup] initdb succeeded")

# Configure the port
with open(DATA_DIR / "postgresql.conf", "a") as f:
    f.write(f"\nport = {PORT}\nlisten_addresses = '{HOST}'\nunix_socket_directories = '/tmp'\n")
    # Allow trust auth locally for easy restore testing
    f.write("max_connections = 50\nshared_buffers = 32MB\n")

# Start the server in the background
print(f"[setup] Starting PostgreSQL on port {PORT}...")
log_file = open("/tmp/pg-restore-test-server.log", "w")
proc = subprocess.Popen(
    [str(POSTGRES), "-D", str(DATA_DIR), "-h", HOST, "-p", str(PORT)],
    stdout=log_file,
    stderr=log_file,
    start_new_session=True,  # Detach from parent process
)
print(f"[setup] postgres PID: {proc.pid}")

# Wait for the server to be ready
import time
ready = False
for attempt in range(30):
    time.sleep(1)
    pg_isready_result = subprocess.run(
        [str(PSQL), "-h", HOST, "-p", str(PORT), "-U", "postgres", "-d", "postgres", "-c", "SELECT 1"],
        capture_output=True,
        text=True,
    )
    if pg_isready_result.returncode == 0:
        ready = True
        print(f"[setup] PostgreSQL ready after {attempt + 1}s")
        break

if not ready:
    print("[setup] PostgreSQL failed to start. Log:", file=sys.stderr)
    with open("/tmp/pg-restore-test-server.log") as f:
        print(f.read(), file=sys.stderr)
    sys.exit(2)

# Create the test database
print(f"[setup] Creating database '{DB_NAME}'...")
create_result = subprocess.run(
    [str(CREATEDB), "-h", HOST, "-p", str(PORT), "-U", "postgres", DB_NAME],
    capture_output=True,
    text=True,
)
if create_result.returncode != 0:
    print(f"[setup] createdb FAILED:\n{create_result.stderr}", file=sys.stderr)
    sys.exit(3)
print(f"[setup] Database '{DB_NAME}' created")

# Print the connection string (safe — local only, no credentials)
CONN_STRING = f"postgresql://postgres@{HOST}:{PORT}/{DB_NAME}"
print()
print(f"=== ISOLATED POSTGRES READY ===")
print(f"Connection string: {CONN_STRING}")
print(f"Server log: /tmp/pg-restore-test-server.log")
print(f"Data directory: {DATA_DIR}")
print()
print(f"To stop: pkill -f 'postgres.*{DATA_DIR}'")
