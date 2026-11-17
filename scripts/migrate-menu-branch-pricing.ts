/**
 * One-time menu branch pricing migration.
 *
 * SECURITY: This script refuses to run unless DATABASE_URL is set in the environment.
 * It never prints the connection string.
 *
 * IDEMPOTENCY: The script is idempotent — running it multiple times produces the
 * same end state. Each UPDATE statement uses a WHERE clause that excludes rows
 * already migrated.
 *
 * ONE-TIME GATE: The script records a marker in the _MigrationLog table (created
 * if it doesn't exist) with the migration name. If the marker already exists,
 * the script exits without modifying anything. This prevents accidental re-runs
 * in future environments from changing an intentionally-GLOBAL item to EXPLICIT.
 *
 * USAGE:
 *   DATABASE_URL='postgresql://...' bun run scripts/migrate-menu-branch-pricing.ts
 *
 * WHAT THIS SCRIPT DOES:
 *   1. Sets MenuItem.availabilityMode = 'EXPLICIT' for items that have at least
 *      one MenuItemBranch row (preserving today's "explicit list" behavior).
 *   2. Items with no MenuItemBranch rows remain 'GLOBAL' (set by db push default).
 *      No action needed.
 *   3. Records the migration in _MigrationLog.
 *
 * WHAT THIS SCRIPT DOES NOT DO:
 *   - Does NOT touch MenuItemBranch.price (new column, defaults to NULL = inherit).
 *   - Does NOT touch MenuItemBranch.isActive (new column, defaults to TRUE).
 *   - Does NOT touch MenuItemBranch.updatedAt (new column, defaults to NOW()).
 *   - Does NOT touch OrderItem.priceSource (left NULL for historical orders).
 *   - Does NOT touch OrderItem.unitPrice or any other existing data.
 *
 * WHY: After `prisma db push`, all existing MenuItemBranch rows already have
 * isActive=TRUE and updatedAt=NOW() (NOT NULL columns with defaults), and all
 * MenuItemBranch.price values are NULL (the intended "inherit global" state).
 * There is nothing to repair. The only meaningful work is setting
 * availabilityMode = 'EXPLICIT' for items with branch rows.
 */

import { PrismaClient } from '@prisma/client';

const MIGRATION_NAME = 'menu-branch-pricing-2026-11-17';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  console.error('This script refuses to run without an explicit DATABASE_URL.');
  console.error('Usage: DATABASE_URL=<your-connection-string> bun run scripts/migrate-menu-branch-pricing.ts');
  process.exit(1);
}

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  // Print target database name (NOT credentials) for operator verification
  const targetInfo = await db.$queryRaw`SELECT current_database() AS db, current_user AS user` as any[];
  console.log(`[migrate] Target database: ${targetInfo[0]?.db}  (user: ${targetInfo[0]?.user})`);
  console.log(`[migrate] Migration name: ${MIGRATION_NAME}`);
  console.log('');

  // ---- ONE-TIME GATE ----
  // Check if the migration has already been run. Use a dedicated table so
  // accidental re-runs in future environments cannot change items that the
  // operator intentionally set to GLOBAL after the initial migration.
  console.log('[migrate] Checking one-time migration gate...');

  // Create the migration log table if it doesn't exist (idempotent DDL)
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_MigrationLog" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT UNIQUE NOT NULL,
      "appliedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "details" TEXT
    )
  `);

  // Check if this migration is already recorded
  const alreadyRun = await db.$queryRawUnsafe(
    `SELECT "name", "appliedAt", "details" FROM "_MigrationLog" WHERE "name" = $1`,
    MIGRATION_NAME
  ) as any[];

  if (alreadyRun.length > 0) {
    console.log(`[migrate] ⚠️  Migration '${MIGRATION_NAME}' was already applied on ${alreadyRun[0].appliedAt}.`);
    console.log(`[migrate]    Details: ${alreadyRun[0].details || '(none)'}`);
    console.log('');
    console.log('[migrate] This script is gated against accidental re-runs.');
    console.log('[migrate] If you genuinely need to re-apply, drop the row from "_MigrationLog" first:');
    console.log(`[migrate]   DELETE FROM "_MigrationLog" WHERE "name" = '${MIGRATION_NAME}';`);
    console.log('[migrate] Aborting without modifying any data.');
    await db.$disconnect();
    return;
  }
  console.log('[migrate] ✓ Migration has not been applied yet. Proceeding.');

  // ---- PRE-MIGRATION AUDIT ----
  console.log('');
  console.log('[migrate] Pre-migration state:');
  const preStats = await db.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "MenuItem") AS total_items,
      (SELECT COUNT(*) FROM "MenuItem" WHERE "availabilityMode" = 'GLOBAL') AS global_items,
      (SELECT COUNT(*) FROM "MenuItem" WHERE "availabilityMode" = 'EXPLICIT') AS explicit_items,
      (SELECT COUNT(*) FROM "MenuItemBranch") AS total_branch_rows,
      (SELECT COUNT(*) FROM "OrderItem") AS total_order_items
  ` as any[];
  console.log('[migrate]  Total MenuItem rows:        ', preStats[0].total_items);
  console.log('[migrate]  GLOBAL items:                ', preStats[0].global_items);
  console.log('[migrate]  EXPLICIT items:              ', preStats[0].explicit_items);
  console.log('[migrate]  MenuItemBranch rows:         ', preStats[0].total_branch_rows);
  console.log('[migrate]  OrderItem rows (historical): ', preStats[0].total_order_items);
  console.log('');

  // ---- STEP 1: Set availabilityMode = 'EXPLICIT' for items with MenuItemBranch rows ----
  console.log('[migrate] Step 1: Setting availabilityMode = EXPLICIT for items with branch rows...');
  const step1Result = await db.$executeRaw`
    UPDATE "MenuItem"
    SET "availabilityMode" = 'EXPLICIT'
    WHERE "availabilityMode" = 'GLOBAL'
      AND EXISTS (
        SELECT 1 FROM "MenuItemBranch" mib
        WHERE mib."menuItemId" = "MenuItem"."id"
      )
  `;
  console.log(`[migrate] ✓ Updated ${step1Result} MenuItem rows to EXPLICIT.`);

  // (Step 2: items with no branch rows stay GLOBAL — already set by db push default. No action.)

  // (Step 3 removed per user instruction — defensive repair of isActive/updatedAt is
  //  unnecessary because db push creates them as NOT NULL with defaults. And we must
  //  never touch the price column.)

  // ---- POST-MIGRATION AUDIT ----
  console.log('');
  console.log('[migrate] Post-migration state:');
  const postStats = await db.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM "MenuItem") AS total_items,
      (SELECT COUNT(*) FROM "MenuItem" WHERE "availabilityMode" = 'GLOBAL') AS global_items,
      (SELECT COUNT(*) FROM "MenuItem" WHERE "availabilityMode" = 'EXPLICIT') AS explicit_items,
      (SELECT COUNT(*) FROM "MenuItemBranch") AS total_branch_rows,
      (SELECT COUNT(*) FROM "OrderItem") AS total_order_items,
      (SELECT COUNT(*) FROM "OrderItem" WHERE "priceSource" IS NULL) AS historical_items
  ` as any[];
  console.log('[migrate]  Total MenuItem rows:        ', postStats[0].total_items);
  console.log('[migrate]  GLOBAL items:                ', postStats[0].global_items);
  console.log('[migrate]  EXPLICIT items:              ', postStats[0].explicit_items);
  console.log('[migrate]  MenuItemBranch rows:         ', postStats[0].total_branch_rows);
  console.log('[migrate]  OrderItem rows (historical): ', postStats[0].total_order_items);
  console.log('[migrate]  OrderItem.priceSource=NULL:  ', postStats[0].historical_items, '(must match total_order_items — historical prices untouched)');

  // Verify no OrderItem was modified
  if (postStats[0].historical_items !== postStats[0].total_order_items) {
    console.error('[migrate] ❌ ERROR: Some OrderItem.priceSource values are not NULL!');
    console.error('[migrate]    The migration should NOT touch OrderItem.priceSource.');
    console.error('[migrate]    Aborting without recording the migration as complete.');
    await db.$disconnect();
    process.exit(3);
  }
  console.log('[migrate] ✓ All historical OrderItem.priceSource values remain NULL (untouched).');

  // ---- RECORD THE MIGRATION ----
  console.log('');
  console.log('[migrate] Recording migration in _MigrationLog...');
  // BigInt-safe JSON serialization (Prisma COUNT returns BigInt)
  const details = JSON.stringify({
    items_total: Number(postStats[0].total_items),
    items_global: Number(postStats[0].global_items),
    items_explicit: Number(postStats[0].explicit_items),
    branch_rows: Number(postStats[0].total_branch_rows),
    order_items_untouched: Number(postStats[0].total_order_items),
  });
  await db.$executeRawUnsafe(
    `INSERT INTO "_MigrationLog" ("id", "name", "details") VALUES ($1, $2, $3)`,
    `migration-${Date.now()}`,
    MIGRATION_NAME,
    details
  );
  console.log(`[migrate] ✓ Migration '${MIGRATION_NAME}' recorded in _MigrationLog.`);
  console.log('');
  console.log('========================================');
  console.log('✅ Migration complete.');
  console.log('========================================');
  console.log('Summary:');
  console.log(`  - ${step1Result} MenuItem row(s) set to EXPLICIT`);
  console.log(`  - 0 OrderItem rows touched (historical prices preserved)`);
  console.log(`  - 0 MenuItemBranch.price values modified`);
  console.log(`  - Migration gated against accidental re-runs via _MigrationLog`);
}

main()
  .catch((e) => {
    console.error('[migrate] FATAL ERROR:', e);
    process.exit(2);
  })
  .finally(async () => {
    await db.$disconnect();
  });
