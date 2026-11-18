/**
 * Loyalty Permissions — Phase 2
 *
 * Centralized permission helpers for the upgraded loyalty system.
 * Used by loyalty API routes to enforce role-based access control.
 *
 * Roles:
 *   - ADMIN           : full access to all loyalty operations
 *   - BRANCH_MANAGER  : can manage stamps and view reports within their branch
 *   - CASHIER         : can redeem rewards and view customer loyalty
 */

type LoyaltyUser = {
  role?: string;
  branchId?: string;
} | null | undefined;

/**
 * Whether the user can create / edit / archive loyalty promotions.
 * ADMIN only.
 */
export function canManageLoyaltyPromotions(user: LoyaltyUser): boolean {
  if (!user) return false;
  return user.role === 'ADMIN';
}

/**
 * Whether the user can manually adjust a customer's stamp balance.
 * ADMIN: any customer.
 * BRANCH_MANAGER: only customers whose home branch matches the manager's branch.
 */
export function canAdjustStamps(
  user: LoyaltyUser,
  customerHomeBranchId?: string,
  userBranchId?: string
): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'BRANCH_MANAGER') return customerHomeBranchId === userBranchId;
  return false;
}

/**
 * Whether the user can redeem loyalty rewards at checkout.
 * ADMIN, BRANCH_MANAGER, CASHIER.
 */
export function canRedeemRewards(user: LoyaltyUser): boolean {
  if (!user) return false;
  return ['ADMIN', 'BRANCH_MANAGER', 'CASHIER'].includes(user.role);
}

/**
 * Whether the user can view a customer's loyalty progress.
 * ADMIN, BRANCH_MANAGER, CASHIER.
 */
export function canViewCustomerLoyalty(user: LoyaltyUser): boolean {
  if (!user) return false;
  return ['ADMIN', 'BRANCH_MANAGER', 'CASHIER'].includes(user.role);
}

/**
 * Whether the user can view loyalty reports and analytics.
 * ADMIN, BRANCH_MANAGER.
 */
export function canViewLoyaltyReports(user: LoyaltyUser): boolean {
  if (!user) return false;
  return ['ADMIN', 'BRANCH_MANAGER'].includes(user.role);
}

/**
 * Whether the user can manage global loyalty settings (singleton config).
 * ADMIN only.
 */
export function canManageSettings(user: LoyaltyUser): boolean {
  if (!user) return false;
  return user.role === 'ADMIN';
}
