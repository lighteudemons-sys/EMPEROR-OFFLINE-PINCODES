// Script to check and validate license keys
import { PrismaClient } from '@prisma/client';
import { generateLicenseKey, validateLicenseKey, parseLicenseKey } from '../src/lib/license/license';

// Set DATABASE_URL to match the dev script
process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_jR2nVQDJXG8O@ep-nameless-flower-alam3jmb-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const db = new PrismaClient();

async function main() {
  console.log('🔍 Checking existing licenses...\n');

  // Get all branches with licenses
  const branches = await db.branch.findMany({
    include: {
      licenses: true
    }
  });

  console.log(`Found ${branches.length} branches:\n`);

  for (const branch of branches) {
    console.log(`📍 Branch: ${branch.branchName}`);
    console.log(`   ID: ${branch.id}`);
    console.log(`   License Key: ${branch.licenseKey ? branch.licenseKey.substring(0, 50) + '...' : 'N/A'}`);
    console.log(`   Expires: ${branch.licenseExpiresAt}`);
    console.log(`   Active: ${branch.isActive}`);

    if (branch.licenseKey) {
      // Validate the existing license key
      const validation = validateLicenseKey(branch.licenseKey);
      console.log(`   Valid: ${validation.isValid}`);
      if (!validation.isValid) {
        console.log(`   Error: ${validation.error}`);
      } else {
        const parsed = parseLicenseKey(branch.licenseKey);
        console.log(`   Parsed Branch ID: ${parsed?.branchId}`);
        console.log(`   Matches Database: ${parsed?.branchId === branch.id}`);
      }
    }

    if (branch.licenses && branch.licenses.length > 0) {
      console.log(`   License Records: ${branch.licenses.length}`);
      for (const license of branch.licenses) {
        console.log(`     - ID: ${license.id.substring(0, 8)}...`);
        console.log(`       Max Devices: ${license.maxDevices}`);
        console.log(`       Revoked: ${license.isRevoked}`);
      }
    }
    console.log('');
  }

  // Generate a new license key for testing
  console.log('\n🔄 Generating a test license key...\n');
  if (branches.length > 0) {
    const testBranch = branches[0];
    const licenseData = {
      branchId: testBranch.id,
      expirationDate: new Date('2027-12-31').toISOString(),
      maxDevices: 5,
      tier: 'STANDARD'
    };

    const newLicenseKey = generateLicenseKey(licenseData);
    console.log('New License Key:');
    console.log(newLicenseKey);
    console.log('\nValidating new key...');

    const validation = validateLicenseKey(newLicenseKey);
    console.log(`Valid: ${validation.isValid}`);
    if (validation.isValid && validation.data) {
      console.log(`Branch ID: ${validation.data.branchId}`);
      console.log(`Expiration: ${validation.data.expirationDate}`);
      console.log(`Max Devices: ${validation.data.maxDevices}`);
      console.log(`Tier: ${validation.data.tier}`);
    }
  }
}

main()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
