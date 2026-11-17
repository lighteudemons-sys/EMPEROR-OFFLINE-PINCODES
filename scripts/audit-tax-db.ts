// Read-only audit: check tax configuration in DB and historical orders
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  console.log('=== BRANCH TAX CONFIG ===');
  // Raw query to see ALL columns of Branch
  const branchesRaw = await db.$queryRaw`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'Branch'
    ORDER BY ordinal_position
  ` as any[];
  console.log('Branch table columns:');
  console.table(branchesRaw.map(c => ({ column: c.column_name, type: c.data_type })));

  console.log('\n=== ACTUAL BRANCH ROWS (raw) ===');
  const branches = await db.$queryRaw`SELECT * FROM "Branch"` as any[];
  console.log(JSON.stringify(branches, null, 2));

  console.log('\n=== ORDER TAX FIELDS ===');
  const ordersRaw = await db.$queryRaw`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'Order'
    ORDER BY ordinal_position
  ` as any[];
  console.log('Order table columns (tax-related):');
  console.table(ordersRaw.filter((c: any) =>
    c.column_name.toLowerCase().includes('tax')
  ));

  console.log('\n=== HISTORICAL ORDERS (tax fields) ===');
  const orders = await db.order.findMany({
    select: {
      id: true,
      orderNumber: true,
      subtotal: true,
      taxAmount: true,
      taxEnabled: true,
      totalAmount: true,
      branchId: true,
      orderTimestamp: true,
    },
    orderBy: { orderTimestamp: 'desc' },
    take: 10,
  });
  console.log('Last 10 orders (most recent first):');
  console.table(orders.map(o => ({
    id: o.id.substring(0, 12),
    orderNumber: o.orderNumber,
    subtotal: o.subtotal,
    taxAmount: o.taxAmount,
    taxEnabled: o.taxEnabled,
    totalAmount: o.totalAmount,
    branchId: o.branchId.substring(0, 12),
    date: o.orderTimestamp.toISOString().split('T')[0],
  })));

  console.log('\n=== TAX-RELATED USAGE COUNT ===');
  const ordersWithTax = await db.order.count({ where: { taxEnabled: true } });
  const ordersWithoutTax = await db.order.count({ where: { taxEnabled: false } });
  const ordersWithNonZeroTax = await db.order.count({ where: { taxAmount: { gt: 0 } } });
  console.log('Orders with taxEnabled=true:', ordersWithTax);
  console.log('Orders with taxEnabled=false:', ordersWithoutTax);
  console.log('Orders with taxAmount > 0:', ordersWithNonZeroTax);

  console.log('\n=== ETA SETTINGS (which may store tax info) ===');
  const etaCount = await db.branchETASettings.count();
  console.log('BranchETASettings records:', etaCount);
  if (etaCount > 0) {
    const etaSettings = await db.branchETASettings.findMany({
      select: {
        branchId: true,
        companyName: true,
        taxRegistrationNumber: true,
        environment: true,
      },
    });
    console.table(etaSettings);
  }

  console.log('\n=== DONE ===');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
