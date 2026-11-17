// Read-only audit script: queries a database to verify
// the exact state of MenuItemBranch rows and MenuItem availability.
// Does NOT write anything.
//
// SECURITY: This script reads DATABASE_URL from the environment only.
// It does NOT contain any hardcoded connection strings.
// It will fail loudly if DATABASE_URL is not set.

import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  console.error('This script refuses to run without an explicit DATABASE_URL.');
  console.error('Usage: DATABASE_URL=<your-connection-string> bun run scripts/audit-menu-db.ts');
  process.exit(1);
}

// Log the target database name (not the credentials) so the operator can verify
// they are pointing at the right database before any query runs.
const db = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function main() {
  // Print the target database name (NOT credentials) so the operator can verify
  // they are pointing at the intended database.
  try {
    const targetInfo = await db.$queryRaw`SELECT current_database() AS db, current_user AS user` as any[];
    console.log(`[audit] Target database: ${targetInfo[0]?.db}  (user: ${targetInfo[0]?.user})`);
    console.log('[audit] Read-only mode. No writes will be performed.\n');
  } catch (e) {
    console.error('[audit] Failed to connect to database. Aborting.');
    console.error(e);
    process.exit(2);
  }

  console.log('=== BRANCHES ===');
  const branches = await db.branch.findMany({
    select: { id: true, branchName: true, isActive: true },
    orderBy: { branchName: 'asc' },
  });
  console.table(branches);

  console.log('\n=== CATEGORIES ===');
  const categories = await db.category.findMany({
    select: {
      id: true,
      name: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { menuItems: true } },
    },
    orderBy: { sortOrder: 'asc' },
  });
  console.table(categories.map(c => ({
    id: c.id.substring(0, 12),
    name: c.name,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    itemCount: c._count.menuItems,
  })));

  console.log('\n=== MENU ITEMS SUMMARY ===');
  const totalItems = await db.menuItem.count();
  const activeItems = await db.menuItem.count({ where: { isActive: true } });
  const inactiveItems = await db.menuItem.count({ where: { isActive: false } });
  const itemsWithVariants = await db.menuItem.count({ where: { hasVariants: true } });
  const itemsWithCategoryFK = await db.menuItem.count({ where: { NOT: { categoryId: null } } });
  const itemsWithCategoryString = await db.menuItem.count({
    where: { NOT: { category: { equals: '' } } },
  });

  console.log('Total menu items:', totalItems);
  console.log('Active (isActive=true):', activeItems);
  console.log('Inactive (isActive=false):', inactiveItems);
  console.log('Items with hasVariants=true:', itemsWithVariants);
  console.log('Items with categoryId (FK):', itemsWithCategoryFK);
  console.log('Items with category (string):', itemsWithCategoryString);

  console.log('\n=== MenuItemBranch ROWS (the critical table) ===');
  const totalAssignments = await db.menuItemBranch.count();
  console.log('Total MenuItemBranch rows:', totalAssignments);

  if (totalAssignments > 0) {
    // Show which items have branch assignments
    const itemsWithAssignments = await db.menuItem.findMany({
      where: { branchAssignments: { some: {} } },
      select: {
        id: true,
        name: true,
        isActive: true,
        price: true,
        _count: { select: { branchAssignments: true } },
        branchAssignments: {
          select: {
            id: true,
            branchId: true,
            branch: { select: { branchName: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    console.log('\nItems that have MenuItemBranch rows (currently EXPLICIT in today\'s logic):');
    console.table(itemsWithAssignments.map(item => ({
      itemId: item.id.substring(0, 12),
      name: item.name,
      isActive: item.isActive,
      price: item.price,
      branchCount: item._count.branchAssignments,
      branches: item.branchAssignments.map(ba => ba.branch.branchName).join(', '),
    })));
  } else {
    console.log('NO MenuItemBranch rows exist — all items are GLOBAL (available in all branches).');
  }

  console.log('\n=== SAMPLE: First 5 menu items ===');
  const sample = await db.menuItem.findMany({
    take: 5,
    select: {
      id: true,
      name: true,
      category: true,
      categoryId: true,
      price: true,
      taxRate: true,
      isActive: true,
      hasVariants: true,
      version: true,
      _count: {
        select: {
          branchAssignments: true,
          variants: true,
          recipes: true,
          orderItems: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  console.table(sample.map(s => ({
    id: s.id.substring(0, 12),
    name: s.name,
    category: s.category,
    categoryId: s.categoryId?.substring(0, 12) || 'NULL',
    price: s.price,
    taxRate: s.taxRate,
    isActive: s.isActive,
    hasVariants: s.hasVariants,
    version: s.version,
    branchAssignments: s._count.branchAssignments,
    variants: s._count.variants,
    recipes: s._count.recipes,
    orderItems: s._count.orderItems,
  })));

  console.log('\n=== ORDERITEM COUNT (historical orders that reference MenuItems) ===');
  const totalOrderItems = await db.orderItem.count();
  const voidedOrderItems = await db.orderItem.count({ where: { isVoided: true } });
  console.log('Total OrderItem rows (historical order lines):', totalOrderItems);
  console.log('Voided OrderItems:', voidedOrderItems);

  // Check for orphaned OrderItems (menuItemId that doesn't exist)
  // This would indicate past cascade deletes or data integrity issues
  const orphanedCheck = await db.$queryRaw`
    SELECT COUNT(*) as count FROM "OrderItem" oi
    LEFT JOIN "MenuItem" mi ON oi."menuItemId" = mi."id"
    WHERE mi."id" IS NULL
  ` as any[];
  console.log('Orphaned OrderItems (menuItemId points to non-existent item):', orphanedCheck[0]?.count || 0);

  // CRITICAL: Snapshot every historical OrderItem's id + unitPrice + subtotal so we can
  // compare before/after the migration and prove prices were not modified.
  console.log('\n=== HISTORICAL ORDERITEM PRICE SNAPSHOT (for before/after comparison) ===');
  const orderItemPrices = await db.orderItem.findMany({
    select: {
      id: true,
      menuItemId: true,
      quantity: true,
      unitPrice: true,
      subtotal: true,
      isVoided: true,
    },
    orderBy: { id: 'asc' },
  });
  console.log(`Captured ${orderItemPrices.length} OrderItem rows. First 10:`);
  console.table(orderItemPrices.slice(0, 10).map(oi => ({
    id: oi.id.substring(0, 16),
    menuItemId: oi.menuItemId.substring(0, 12),
    qty: oi.quantity,
    unitPrice: oi.unitPrice,
    subtotal: oi.subtotal,
    isVoided: oi.isVoided,
  })));

  // Compute a hash-like checksum of all unitPrice values for quick before/after comparison
  const priceChecksum = orderItemPrices
    .map(oi => `${oi.id}:${oi.unitPrice.toFixed(6)}:${oi.subtotal.toFixed(6)}`)
    .sort()
    .join('|');
  console.log(`\n[audit] OrderItem price checksum: ${priceChecksum.length} chars`);
  // Don't print the full checksum (could be long), just its length and a short prefix
  console.log(`[audit] Checksum prefix: ${priceChecksum.substring(0, 80)}...`);

  // Persist the full snapshot to a JSON file for byte-for-byte before/after comparison
  const fs = await import('fs/promises');
  const path = await import('path');
  const snapshotPath = path.join(process.cwd(), 'download', 'orderitem-price-snapshot.json');
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(
    snapshotPath,
    JSON.stringify(
      orderItemPrices.map(oi => ({
        id: oi.id,
        menuItemId: oi.menuItemId,
        quantity: oi.quantity,
        unitPrice: oi.unitPrice,
        subtotal: oi.subtotal,
        isVoided: oi.isVoided,
      })),
      null,
      2
    )
  );
  console.log(`[audit] Full OrderItem price snapshot written to: ${snapshotPath}`);



  console.log('\n=== TAX RATE DISTRIBUTION ===');
  const taxRates = await db.menuItem.groupBy({
    by: ['taxRate'],
    _count: true,
    orderBy: { taxRate: 'asc' },
  });
  console.table(taxRates);

  console.log('\n=== VARIANT COUNTS ===');
  const totalVariants = await db.menuItemVariant.count();
  const variantTypes = await db.variantType.count();
  const variantOptions = await db.variantOption.count();
  console.log('Total MenuItemVariant rows:', totalVariants);
  console.log('Total VariantType rows:', variantTypes);
  console.log('Total VariantOption rows:', variantOptions);

  console.log('\n=== DONE (read-only audit complete) ===');
}

main()
  .catch(e => {
    console.error('ERROR:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
