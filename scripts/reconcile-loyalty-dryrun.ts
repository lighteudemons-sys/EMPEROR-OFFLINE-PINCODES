/**
 * Phase 0b — DRY-RUN Reconciliation Script
 *
 * Identifies customers affected by the 10× refund over-deduction bug.
 *
 * THE BUG:
 *   - Order creation awarded: Math.floor(subtotal / 10) points  (e.g., 10 pts for 100 EGP)
 *   - Refund deducted:        Math.floor(subtotal)       points (e.g., 100 pts for 100 EGP)
 *   - Over-deduction per refund: subtotal - floor(subtotal/10) ≈ 9× the correct amount
 *
 * This script is READ-ONLY. It does NOT modify any data.
 * It produces a report showing affected customers and the expected correction.
 *
 * USAGE:
 *   DATABASE_URL='<your-connection-string>' bun run scripts/reconcile-loyalty-dryrun.ts
 */

import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  const targetInfo = await db.$queryRaw`SELECT current_database() AS db, current_user AS user` as any[];
  console.log(`[reconcile] Target database: ${targetInfo[0]?.db}  (user: ${targetInfo[0]?.user})`);
  console.log('[reconcile] DRY-RUN mode — no data will be modified.\n');
  console.log('');

  // Step 1: Find all refund-type loyalty transactions that used 'REDEEMED' instead of 'REFUND'
  // These are the erroneous refund deductions.
  const refundTransactions = await db.loyaltyTransaction.findMany({
    where: {
      type: 'REDEEMED',
      points: { lt: 0 },  // negative points = deduction
      orderId: { not: null },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`[reconcile] Found ${refundTransactions.length} suspicious REDEEMED (negative) transactions with orderId.`);

  // Step 2: For each, find the corresponding EARNED transaction on the same order
  // to determine the correct deduction amount.
  interface AffectedCustomer {
    customerId: string;
    customerName: string;
    customerPhone: string;
    currentPoints: number;
    currentTier: string;
    expectedPoints: number;
    expectedTier: string;
    difference: number;
    affectedOrders: Array<{
      orderNumber: number;
      subtotal: number;
      earnedPoints: number;      // what was originally awarded
      deductedPoints: number;   // what was actually deducted (the bug)
      correctDeduction: number;  // what should have been deducted
      overDeduction: number;     // deducted - correctDeduction
    }>;
  }

  const customerMap = new Map<string, AffectedCustomer>();

  for (const refundTxn of refundTransactions) {
    if (!refundTxn.orderId) continue;

    // Look up the order to get subtotal and orderNumber
    const order = await db.order.findUnique({
      where: { id: refundTxn.orderId },
      select: { id: true, orderNumber: true, subtotal: true, customerId: true },
    });

    if (!order || !order.customerId) continue;

    // Find the original EARNED transaction for this order
    const earnedTxn = await db.loyaltyTransaction.findFirst({
      where: {
        customerId: refundTxn.customerId,
        orderId: refundTxn.orderId,
        type: 'EARNED',
      },
      orderBy: { createdAt: 'asc' },
    });

    const earnedPoints = earnedTxn ? earnedTxn.points : Math.floor(order.subtotal / 10);
    const deductedPoints = Math.abs(refundTxn.points); // the buggy deduction (positive value)
    const correctDeduction = earnedPoints;
    const overDeduction = deductedPoints - correctDeduction;

    if (overDeduction <= 0) continue; // No over-deduction for this transaction

    const customerId = refundTxn.customerId;

    if (!customerMap.has(customerId)) {
      const customer = await db.customer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true, phone: true, loyaltyPoints: true, tier: true, totalSpent: true },
      });

      if (!customer) continue;

      customerMap.set(customerId, {
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        currentPoints: customer.loyaltyPoints,
        currentTier: customer.tier,
        expectedPoints: customer.loyaltyPoints, // will be adjusted below
        expectedTier: customer.tier,            // will be recalculated below
        difference: 0,
        affectedOrders: [],
      });
    }

    const entry = customerMap.get(customerId)!;
    entry.affectedOrders.push({
      orderNumber: order.orderNumber,
      subtotal: order.subtotal,
      earnedPoints,
      deductedPoints,
      correctDeduction,
      overDeduction,
    });
    entry.difference += overDeduction;
  }

  // Step 3: Calculate expected points and tier for each affected customer
  for (const [, entry] of customerMap) {
    entry.expectedPoints = entry.currentPoints + entry.difference;

    // Recalculate tier based on corrected points (standardized: 200/500/1000)
    if (entry.expectedPoints >= 1000) {
      entry.expectedTier = 'PLATINUM';
    } else if (entry.expectedPoints >= 500) {
      entry.expectedTier = 'GOLD';
    } else if (entry.expectedPoints >= 200) {
      entry.expectedTier = 'SILVER';
    } else {
      entry.expectedTier = 'BRONZE';
    }
  }

  // Step 4: Print the report
  const affectedCustomers = Array.from(customerMap.values()).sort((a, b) => b.difference - a.difference);

  console.log('\n========================================');
  console.log('LOYALTY RECONCILIATION — DRY-RUN REPORT');
  console.log('========================================\n');

  console.log(`Total affected customers: ${affectedCustomers.length}`);
  console.log(`Total over-deducted points: ${affectedCustomers.reduce((s, c) => s + c.difference, 0)}`);
  console.log(`Customers with tier change: ${affectedCustomers.filter(c => c.currentTier !== c.expectedTier).length}`);
  console.log(`Customers with negative current balance: ${affectedCustomers.filter(c => c.currentPoints < 0).length}`);

  console.log('\n--- AFFECTED CUSTOMERS ---\n');

  for (const customer of affectedCustomers) {
    console.log(`Customer: ${customer.customerName} (${customer.customerPhone})`);
    console.log(`  ID: ${customer.customerId}`);
    console.log(`  Current loyaltyPoints: ${customer.currentPoints}`);
    console.log(`  Expected loyaltyPoints: ${customer.expectedPoints} (difference: +${customer.difference})`);
    console.log(`  Current tier: ${customer.currentTier} → Expected tier: ${customer.expectedTier}${customer.currentTier !== customer.expectedTier ? ' ⚠️ TIER CHANGE' : ''}`);
    console.log(`  Affected orders: ${customer.affectedOrders.length}`);

    for (const order of customer.affectedOrders) {
      console.log(`    Order #${order.orderNumber}: subtotal=${order.subtotal} EGP`);
      console.log(`      Earned: ${order.earnedPoints} pts | Deducted: ${order.deductedPoints} pts | Should have deducted: ${order.correctDeduction} pts | Over-deducted: ${order.overDeduction} pts`);
    }
    console.log('');
  }

  // Step 5: Summary table
  console.log('--- SUMMARY TABLE ---\n');
  console.log('Customer ID         | Name              | Phone         | Current  | Expected | Diff    | Tier Change');
  console.log('---------------------|-------------------|--------------|----------|----------|---------|------------');

  for (const c of affectedCustomers) {
    const tierChange = c.currentTier !== c.expectedTier ? `${c.currentTier} → ${c.expectedTier}` : '—';
    console.log(
      `${c.customerId.substring(0, 19).padEnd(19)} | ${c.customerName.substring(0, 17).padEnd(17)} | ${c.customerPhone.padEnd(12)} | ${String(c.currentPoints).padStart(8)} | ${String(c.expectedPoints).padStart(8)} | ${String('+' + c.difference).padStart(7)} | ${tierChange}`
    );
  }

  // Step 6: Write JSON report to download/
  const fs = await import('fs/promises');
  const path = await import('path');
  const reportPath = path.join(process.cwd(), 'download', 'loyalty-reconciliation-dryrun.json');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalAffectedCustomers: affectedCustomers.length,
    totalOverDeductedPoints: affectedCustomers.reduce((s, c) => s + c.difference, 0),
    customersWithTierChange: affectedCustomers.filter(c => c.currentTier !== c.expectedTier).length,
    customersWithNegativeBalance: affectedCustomers.filter(c => c.currentPoints < 0).length,
    customers: affectedCustomers,
  }, null, 2));

  console.log(`\n[reconcile] Full report saved to: ${reportPath}`);
  console.log('[reconcile] DRY-RUN complete. No data was modified.');
  console.log('[reconcile] To execute the reconciliation, review the report and run the execution script.');
}

main()
  .catch((e) => {
    console.error('[reconcile] FATAL:', e);
    process.exit(2);
  })
  .finally(async () => {
    await db.$disconnect();
  });
