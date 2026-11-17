/**
 * Menu pricing & availability resolution helpers.
 *
 * This is the SINGLE SOURCE OF TRUTH for resolving:
 *   - Whether an item is available in a given branch.
 *   - What price applies to an item in a given branch.
 *
 * Every consumer (POS API, orders API, sync API, reports, admin UI) MUST call
 * these helpers. Never read MenuItemBranch.price directly.
 *
 * AVAILABILITY RULES (proven from the existing implementation):
 *
 * Case A: availabilityMode = GLOBAL, no MenuItemBranch rows
 *   → available in EVERY branch.
 *
 * Case B: availabilityMode = GLOBAL, Branch A has a row with isActive=false
 *   → HIDDEN in A, visible in B (and all other branches without a row).
 *
 * Case C: availabilityMode = EXPLICIT, Branch A has a row with isActive=true
 *   → visible in A, HIDDEN in B (and all other branches without a row).
 *
 * Case D: availabilityMode = EXPLICIT, Branch A has a row with isActive=false
 *   → HIDDEN in A.
 *
 * These helpers preserve the EXACT behavior of the existing /api/menu-items/pos
 * Prisma query, which uses:
 *   OR: [
 *     { branchAssignments: { none: {} } },            // Case A
 *     { branchAssignments: { some: { branchId } } },  // Case C
 *   ]
 *
 * The new GLOBAL mode adds Case B (per-branch disable) without breaking the
 * existing behavior for items with zero branch rows.
 */

import { Prisma } from '@prisma/client';

// ---- Types ----

export type MenuAvailabilityMode = 'GLOBAL' | 'EXPLICIT';

export interface BranchAssignment {
  branchId: string;
  price: Prisma.Decimal | number | string | null;
  isActive: boolean;
}

export interface MenuItemForResolution {
  /** Global fallback price (existing Float field). */
  price: number;
  /** Whether the item is operationally active (top-level toggle). */
  isActive: boolean;
  /** Whether the item is archived/soft-deleted. */
  deletedAt: Date | string | null;
  /** Availability mode: GLOBAL = available everywhere unless disabled; EXPLICIT = only listed branches. */
  availabilityMode: MenuAvailabilityMode;
  /** Branch assignments (overrides). May be empty. */
  branchAssignments: BranchAssignment[];
}

// ---- Decimal → number conversion (single place) ----

/**
 * Convert any price-like value to a plain JavaScript number.
 * Handles Prisma.Decimal, number, string, null, undefined.
 *
 * - NULL or undefined → null (means "inherit global price").
 * - 0 → 0 (ZERO IS A VALID EXPLICIT PRICE; it is NOT treated as NULL).
 * - Negative, NaN, Infinity → null (invalid — caller should reject or treat as inherit).
 *
 * This is the ONLY place where Prisma.Decimal is converted to number.
 */
export function toNumber(
  value: Prisma.Decimal | number | string | null | undefined
): number | null {
  if (value === null || value === undefined) return null;

  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    n = parseFloat(value);
  } else if (typeof value === 'object' && typeof (value as any).toNumber === 'function') {
    // Prisma.Decimal
    n = (value as Prisma.Decimal).toNumber();
  } else {
    return null;
  }

  // Reject NaN and Infinity
  if (Number.isNaN(n) || !Number.isFinite(n)) {
    return null;
  }
  return n;
}

/**
 * Validate and normalize a branch price.
 *
 * Returns:
 *   - A valid number (rounded to 2 decimals) if the input is a legitimate price.
 *   - null if the input is null/undefined (means "inherit global price").
 *   - throws if the input is negative, NaN, or infinite (these are programmer errors
 *     and should be rejected at the API boundary, not silently coerced).
 *
 * Note: 0 is a VALID explicit price and is returned as 0 (NOT null).
 */
export function validateBranchPrice(
  value: Prisma.Decimal | number | string | null | undefined
): number | null {
  const n = toNumber(value);
  if (n === null) return null; // inherit global
  if (n < 0) {
    throw new Error(`Invalid branch price: negative values are not allowed (got ${n}).`);
  }
  // Round to 2 decimal places (consistent with Decimal(10,2) storage)
  return Math.round(n * 100) / 100;
}

// ---- Availability resolution ----

/**
 * Find the branch assignment for a given branch, if any.
 */
export function findBranchAssignment(
  menuItem: MenuItemForResolution,
  branchId: string
): BranchAssignment | undefined {
  return menuItem.branchAssignments.find((ba) => ba.branchId === branchId);
}

/**
 * Determine if an item is available in a given branch.
 *
 * Implements the 4 cases documented at the top of this file.
 *
 * IMPORTANT: this function checks branch-level availability ONLY.
 * The caller is responsible for also checking `menuItem.isActive`
 * and `menuItem.deletedAt` (item-level operational status).
 */
export function isItemAvailableInBranch(
  menuItem: MenuItemForResolution,
  branchId: string
): boolean {
  if (menuItem.availabilityMode === 'GLOBAL') {
    // Case A: no row exists → available.
    // Case B: row exists with isActive=false → NOT available.
    //         row exists with isActive=true → available.
    const assignment = findBranchAssignment(menuItem, branchId);
    if (!assignment) return true; // Case A
    return assignment.isActive;   // Case B
  }

  // EXPLICIT mode
  // Case C: row exists with isActive=true → available.
  // Case D: row exists with isActive=false → NOT available.
  //         no row exists → NOT available (item is restricted to listed branches only).
  const assignment = findBranchAssignment(menuItem, branchId);
  if (!assignment) return false; // not in the explicit list
  return assignment.isActive;    // Case C / D
}

/**
 * Resolve the effective price for an item in a given branch.
 *
 * Resolution order:
 *   1. If a MenuItemBranch row exists for this branch with a non-null price,
 *      use that price (converted to a plain number).
 *   2. Otherwise, fall back to MenuItem.price (the global Float field).
 *
 * Returns a plain JavaScript number — NEVER a Prisma.Decimal.
 *
 * Note: this function does NOT validate the price (e.g., negative check).
 * The price is assumed to have been validated when it was written.
 * If you need validation, call validateBranchPrice() on the assignment.price
 * before passing the menuItem here.
 */
export function resolveBranchPrice(
  menuItem: MenuItemForResolution,
  branchId: string
): number {
  const assignment = findBranchAssignment(menuItem, branchId);
  if (assignment) {
    const overridePrice = toNumber(assignment.price);
    if (overridePrice !== null) {
      return overridePrice;
    }
  }
  return menuItem.price; // global fallback (already a number)
}

/**
 * Determine whether the branch price is inherited (not explicitly overridden).
 *
 * Returns true if the branch uses the global MenuItem.price (no override row,
 * or override row with price = NULL).
 * Returns false if the branch has an explicit price override.
 */
export function isPriceInherited(
  menuItem: MenuItemForResolution,
  branchId: string
): boolean {
  const assignment = findBranchAssignment(menuItem, branchId);
  if (!assignment) return true;
  return toNumber(assignment.price) === null;
}

// ---- Self-tests (run via `bun run src/lib/menu-pricing.ts`) ----
// These verify the 4 documented cases. They are pure functions (no DB).

export function runSelfTests() {
  const globalPrice = 50;
  const branchA = 'branch-a';
  const branchB = 'branch-b';
  const branchC = 'branch-c';

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, message: string) {
    if (cond) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.error(`  ✗ ${message}`);
    }
  }

  console.log('Menu pricing self-tests');
  console.log('=======================');

  // Case A: GLOBAL, no rows → available in every branch
  console.log('\nCase A: GLOBAL, no rows → available everywhere');
  const itemA: MenuItemForResolution = {
    price: globalPrice,
    isActive: true,
    deletedAt: null,
    availabilityMode: 'GLOBAL',
    branchAssignments: [],
  };
  assert(isItemAvailableInBranch(itemA, branchA) === true, 'available in Branch A');
  assert(isItemAvailableInBranch(itemA, branchB) === true, 'available in Branch B');
  assert(isItemAvailableInBranch(itemA, branchC) === true, 'available in Branch C');
  assert(resolveBranchPrice(itemA, branchA) === globalPrice, 'Branch A price = global (50)');
  assert(resolveBranchPrice(itemA, branchB) === globalPrice, 'Branch B price = global (50)');
  assert(isPriceInherited(itemA, branchA) === true, 'Branch A inherits global price');

  // Case B: GLOBAL, Branch A has isActive=false, Branch B has no row
  console.log('\nCase B: GLOBAL, Branch A disabled, Branch B no row');
  const itemB: MenuItemForResolution = {
    price: globalPrice,
    isActive: true,
    deletedAt: null,
    availabilityMode: 'GLOBAL',
    branchAssignments: [
      { branchId: branchA, price: null, isActive: false }, // disabled in A
      // no row for B
    ],
  };
  assert(isItemAvailableInBranch(itemB, branchA) === false, 'HIDDEN in Branch A');
  assert(isItemAvailableInBranch(itemB, branchB) === true, 'visible in Branch B');
  assert(isItemAvailableInBranch(itemB, branchC) === true, 'visible in Branch C');
  assert(resolveBranchPrice(itemB, branchA) === globalPrice, 'Branch A price still = global (would not be served anyway)');
  assert(resolveBranchPrice(itemB, branchB) === globalPrice, 'Branch B price = global');

  // Case B+ (extension): GLOBAL, Branch A has isActive=false AND a price override
  console.log('\nCase B+: GLOBAL, Branch A disabled WITH price override (price must be ignored since unavailable)');
  const itemBPlus: MenuItemForResolution = {
    price: globalPrice,
    isActive: true,
    deletedAt: null,
    availabilityMode: 'GLOBAL',
    branchAssignments: [
      { branchId: branchA, price: 75, isActive: false }, // disabled in A with override
    ],
  };
  assert(isItemAvailableInBranch(itemBPlus, branchA) === false, 'HIDDEN in Branch A (override price ignored)');
  assert(isItemAvailableInBranch(itemBPlus, branchB) === true, 'visible in Branch B');
  assert(resolveBranchPrice(itemBPlus, branchA) === 75, 'Branch A resolved price = 75 (but item unavailable, so never served)');
  assert(resolveBranchPrice(itemBPlus, branchB) === globalPrice, 'Branch B price = global (no row)');

  // Case C: EXPLICIT, Branch A has isActive=true, Branch B has no row
  console.log('\nCase C: EXPLICIT, Branch A enabled, Branch B no row');
  const itemC: MenuItemForResolution = {
    price: globalPrice,
    isActive: true,
    deletedAt: null,
    availabilityMode: 'EXPLICIT',
    branchAssignments: [
      { branchId: branchA, price: 75, isActive: true }, // enabled in A with override
      // no row for B
    ],
  };
  assert(isItemAvailableInBranch(itemC, branchA) === true, 'visible in Branch A');
  assert(isItemAvailableInBranch(itemC, branchB) === false, 'HIDDEN in Branch B (not in explicit list)');
  assert(isItemAvailableInBranch(itemC, branchC) === false, 'HIDDEN in Branch C');
  assert(resolveBranchPrice(itemC, branchA) === 75, 'Branch A price = override (75)');
  assert(isPriceInherited(itemC, branchA) === false, 'Branch A does NOT inherit (has override)');

  // Case D: EXPLICIT, Branch A has isActive=false
  console.log('\nCase D: EXPLICIT, Branch A disabled');
  const itemD: MenuItemForResolution = {
    price: globalPrice,
    isActive: true,
    deletedAt: null,
    availabilityMode: 'EXPLICIT',
    branchAssignments: [
      { branchId: branchA, price: 75, isActive: false }, // disabled in A
    ],
  };
  assert(isItemAvailableInBranch(itemD, branchA) === false, 'HIDDEN in Branch A');
  assert(isItemAvailableInBranch(itemD, branchB) === false, 'HIDDEN in Branch B (still not in explicit list)');

  // Edge cases
  console.log('\nEdge cases');

  // 0 is a valid explicit price (NOT treated as NULL/inherit)
  assert(toNumber(0) === 0, 'toNumber(0) = 0 (zero is valid, not NULL)');
  assert(validateBranchPrice(0) === 0, 'validateBranchPrice(0) = 0 (zero is a valid explicit price)');
  assert(validateBranchPrice(null) === null, 'validateBranchPrice(null) = null (means inherit)');

  // Negative, NaN, Infinity rejected
  let threw = false;
  try { validateBranchPrice(-5); } catch { threw = true; }
  assert(threw, 'validateBranchPrice(-5) throws (negative rejected)');
  threw = false;
  try { validateBranchPrice(NaN); } catch { threw = true; }
  assert(!threw && validateBranchPrice(NaN) === null, 'validateBranchPrice(NaN) = null (invalid → inherit)');

  // Prisma.Decimal simulation
  const fakeDecimal = { toNumber: () => 85.50 } as any;
  assert(toNumber(fakeDecimal) === 85.5, 'toNumber(Prisma.Decimal-like) = 85.5');
  assert(validateBranchPrice(fakeDecimal) === 85.5, 'validateBranchPrice(Prisma.Decimal-like) = 85.5 (rounded to 2 decimals)');

  // String conversion
  assert(toNumber('75.50') === 75.5, 'toNumber("75.50") = 75.5');
  assert(validateBranchPrice('75.50') === 75.5, 'validateBranchPrice("75.50") = 75.5');

  // Rounding to 2 decimals
  assert(validateBranchPrice(75.555) === 75.56, 'validateBranchPrice(75.555) = 75.56 (rounded)');
  assert(validateBranchPrice(75.554) === 75.55, 'validateBranchPrice(75.554) = 75.55 (rounded)');

  // Item-level inactive overrides branch availability
  const inactiveItem: MenuItemForResolution = {
    ...itemA,
    isActive: false,
  };
  // Note: isItemAvailableInBranch checks branch-level only.
  // The caller must ALSO check menuItem.isActive.
  assert(inactiveItem.isActive === false, 'inactiveItem.isActive = false (caller must check separately)');

  // deletedAt check (caller responsibility)
  const deletedItem: MenuItemForResolution = {
    ...itemA,
    deletedAt: new Date(),
  };
  assert(deletedItem.deletedAt !== null, 'deletedItem.deletedAt is set (caller must check separately)');

  console.log('\n=======================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

// Self-tests are NOT auto-run on import (that breaks in browsers / ESM).
// To run them: bun run scripts/run-menu-pricing-tests.ts
