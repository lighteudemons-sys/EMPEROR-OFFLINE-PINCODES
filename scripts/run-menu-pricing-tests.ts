/**
 * Run the self-tests for src/lib/menu-pricing.ts.
 *
 * Usage: bun run scripts/run-menu-pricing-tests.ts
 *
 * The self-tests cannot be auto-run from the module itself because:
 *   - `require.main === module` is CommonJS and breaks in browser/ESM contexts
 *   - The module is imported by client-side components (menu-management.tsx)
 *   - We don't want tests to run every time the module is imported
 *
 * So we export `runSelfTests` and invoke it explicitly here.
 */

import { runSelfTests } from '../src/lib/menu-pricing';

runSelfTests();
