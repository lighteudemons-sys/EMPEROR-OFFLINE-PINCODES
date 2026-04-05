import { db } from './src/lib/db.ts';

async function checkPromos() {
  const promos = await db.promotion.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: { codes: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('Total promotions:', promos.length);
  console.log('\nPromotions with code counts (sorted by newest):');
  let totalCodes = 0;
  promos.slice(0, 20).forEach(p => {
    console.log(`  ${p.name}: ${p._count.codes} codes`);
    totalCodes += p._count.codes;
  });
  console.log('\nTotal codes across first 20 promotions:', totalCodes);
  
  const grandTotal = promos.reduce((sum, p) => sum + p._count.codes, 0);
  console.log('Total codes across ALL promotions:', grandTotal);
}

checkPromos().catch(console.error).finally(() => process.exit(0));
