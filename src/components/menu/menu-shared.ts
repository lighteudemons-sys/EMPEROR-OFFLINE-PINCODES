/**
 * Menu Management — Shared types, helpers, and API client.
 *
 * Used by all components in src/components/menu/.
 */

import { Prisma } from '@prisma/client';
import { toNumber } from '@/lib/menu-pricing';

// ---- Types ----

export interface Branch {
  id: string;
  branchName: string;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  imagePath?: string | null;
  defaultVariantTypeId?: string | null;
  requiresCaptainReceipt: boolean;
  _count?: { menuItems: number };
}

export interface BranchAssignment {
  id?: string;
  branchId: string;
  price: Prisma.Decimal | number | string | null;
  isActive: boolean;
  updatedAt?: Date | string;
  branch?: Branch;
}

// ---- Variant types and options ----

export interface VariantOption {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface VariantType {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  isCustomInput: boolean;
  options?: VariantOption[];
}

export interface MenuItemVariant {
  id: string;
  menuItemId: string;
  variantTypeId: string;
  variantOptionId: string;
  priceModifier: number;
  sortOrder: number;
  isActive: boolean;
  variantType?: { id: string; name: string; isCustomInput: boolean };
  variantOption?: { id: string; name: string };
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  categoryId?: string | null;
  price: number;
  taxRate: number;
  isActive: boolean;
  deletedAt?: Date | string | null;
  availabilityMode: 'GLOBAL' | 'EXPLICIT';
  imagePath?: string | null;
  sortOrder?: number | null;
  hasVariants: boolean;
  version: number;
  productCode?: string | null;
  categoryRel?: Category | null;
  branchAssignments?: BranchAssignment[];
  variants?: MenuItemVariant[];
  _count?: {
    branchAssignments?: number;
    variants?: number;
    recipes?: number;
    orderItems?: number;
  };
}

export interface MenuItemFormData {
  name: string;
  category: string;
  categoryId: string;
  price: string;
  taxRate: string;
  isActive: boolean;
  hasVariants: boolean;
  sortOrder: string;
  imagePath: string;
  availabilityMode: 'GLOBAL' | 'EXPLICIT';
  branchPrices: BranchPriceEntry[];
  productCode: string;
}

export interface BranchPriceEntry {
  branchId: string;
  branchName: string;
  price: string; // string for input control; empty = inherit
  isActive: boolean;
  isOverridden: boolean; // derived: price !== '' && price !== null
}

// ---- Helpers ----

/**
 * Parse a price value (Prisma.Decimal, number, string, or null) into a plain number.
 * Returns null if the value is null/undefined/invalid.
 */
export function parsePrice(value: Prisma.Decimal | number | string | null | undefined): number | null {
  return toNumber(value);
}

/**
 * Format a price for display in the UI.
 * Returns '—' if the value is null/undefined (means "inherit").
 */
export function formatPrice(value: Prisma.Decimal | number | string | null | undefined, currency = 'EGP'): string {
  const n = parsePrice(value);
  if (n === null) return '—';
  return `${n.toFixed(2)} ${currency}`;
}

/**
 * Convert a branch assignment's price to a string suitable for an input field.
 * Returns '' if the price is null/undefined (means "inherit").
 */
export function priceToInputValue(value: Prisma.Decimal | number | string | null | undefined): string {
  const n = parsePrice(value);
  if (n === null) return '';
  return n.toFixed(2);
}

/**
 * Build a branch-price entry for the form, given a list of all branches and the
 * item's existing branch assignments.
 *
 * - If an assignment exists for a branch, use its price and isActive.
 * - If no assignment exists, the entry defaults to: isActive=true, price='' (inherit).
 */
export function buildBranchPriceEntries(
  branches: Branch[],
  assignments: BranchAssignment[] | undefined,
): BranchPriceEntry[] {
  return branches.map((branch) => {
    const assignment = assignments?.find((a) => a.branchId === branch.id);
    const priceStr = assignment ? priceToInputValue(assignment.price) : '';
    return {
      branchId: branch.id,
      branchName: branch.branchName,
      price: priceStr,
      isActive: assignment ? assignment.isActive : true,
      isOverridden: priceStr !== '',
    };
  });
}

/**
 * Convert the form's branch-price entries into the API payload format.
 * Only includes branches that need a row in MenuItemBranch:
 *   - Branches with a price override
 *   - Branches that are explicitly disabled (isActive=false)
 *   - For EXPLICIT mode: all branches that should be available (we need a row to mark availability)
 */
export function branchPriceEntriesToPayload(
  entries: BranchPriceEntry[],
  availabilityMode: 'GLOBAL' | 'EXPLICIT',
): { branchId: string; price: number | null; isActive: boolean }[] {
  return entries
    .filter((entry) => {
      if (entry.price !== '' && entry.price !== null) return true;
      if (!entry.isActive) return true;
      if (availabilityMode === 'EXPLICIT' && entry.isActive) return true;
      return false;
    })
    .map((entry) => ({
      branchId: entry.branchId,
      price: entry.price !== '' && entry.price !== null ? Number(entry.price) : null,
      isActive: entry.isActive,
    }));
}

export function emptyMenuItemFormData(): MenuItemFormData {
  return {
    name: '',
    category: '',
    categoryId: '',
    price: '',
    taxRate: '0.14',
    isActive: true,
    hasVariants: false,
    sortOrder: '0',
    imagePath: '',
    availabilityMode: 'GLOBAL',
    branchPrices: [],
    productCode: '',
  };
}

export function menuItemToFormData(
  item: MenuItem,
  branches: Branch[],
): MenuItemFormData {
  return {
    name: item.name,
    category: item.category,
    categoryId: item.categoryId || '',
    price: item.price.toString(),
    taxRate: item.taxRate.toString(),
    isActive: item.isActive,
    hasVariants: item.hasVariants,
    sortOrder: item.sortOrder?.toString() || '0',
    imagePath: item.imagePath || '',
    availabilityMode: item.availabilityMode,
    branchPrices: buildBranchPriceEntries(branches, item.branchAssignments),
    productCode: item.productCode || '',
  };
}

// ---- API client ----

export async function fetchMenuItems(includeInactive = false): Promise<MenuItem[]> {
  // The admin UI needs to see ALL items (active, inactive, and archived),
  // PLUS their variants and branch assignments.
  //
  // IMPORTANT: we do NOT pass `active=false` because the API interprets
  // `active=false` as "ONLY return inactive items" (a positive filter).
  // When we want ALL items, we simply omit the `active` param — the API
  // returns everything by default.
  //
  // `includeArchived=true` tells the API to also return soft-deleted items
  // (deletedAt IS NOT NULL). Without it, soft-deleted items are excluded.
  //
  // `includeVariants=true` tells the API to include variant rows for each item.
  const url = new URL('/api/menu-items', window.location.origin);
  url.searchParams.set('includeVariants', 'true');
  if (includeInactive) {
    url.searchParams.set('includeArchived', 'true');
    // NOTE: we intentionally do NOT set 'active' — that would filter to only
    // inactive items, which is the opposite of what we want.
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch menu items');
  const data = await res.json();
  return data.menuItems || data || [];
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch('/api/categories');
  if (!res.ok) throw new Error('Failed to fetch categories');
  const data = await res.json();
  return data.categories || data || [];
}

export async function fetchBranches(): Promise<Branch[]> {
  const res = await fetch('/api/branches');
  if (!res.ok) throw new Error('Failed to fetch branches');
  const data = await res.json();
  return data.branches || data || [];
}

export async function createMenuItem(payload: any): Promise<MenuItem> {
  const res = await fetch('/api/menu-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to create menu item');
  }
  return data.menuItem;
}

export async function updateMenuItem(id: string, payload: any): Promise<MenuItem> {
  const res = await fetch('/api/menu-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _method: 'PATCH', id, ...payload }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to update menu item');
  }
  return data.menuItem;
}

export async function deleteMenuItem(id: string): Promise<void> {
  const res = await fetch(`/api/menu-items?id=${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete menu item');
  }
}

export async function createCategory(payload: any): Promise<Category> {
  const res = await fetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create category');
  return data.category || data;
}

export async function updateCategory(id: string, payload: any): Promise<Category> {
  const res = await fetch(`/api/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update category');
  return data.category || data;
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete category');
  }
}

export async function saveBranchPrices(
  menuItemId: string,
  entries: BranchPriceEntry[],
  availabilityMode: 'GLOBAL' | 'EXPLICIT',
): Promise<void> {
  const branchPrices = branchPriceEntriesToPayload(entries, availabilityMode);
  await updateMenuItem(menuItemId, { branchPrices, availabilityMode });
}

// ---- Variant types and options API ----

export async function fetchVariantTypes(): Promise<VariantType[]> {
  // includeInactiveOptions=true so the admin UI can show ALL options (active + inactive).
  const res = await fetch('/api/variant-types?includeOptions=true&includeInactiveOptions=true');
  if (!res.ok) throw new Error('Failed to fetch variant types');
  const data = await res.json();
  return data.variantTypes || data || [];
}

export async function createVariantType(payload: any): Promise<VariantType> {
  const res = await fetch('/api/variant-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create variant type');
  return data.variantType || data;
}

export async function updateVariantType(id: string, payload: any): Promise<VariantType> {
  const res = await fetch(`/api/variant-types/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update variant type');
  return data.variantType || data;
}

export async function deleteVariantType(id: string): Promise<void> {
  const res = await fetch(`/api/variant-types/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete variant type');
  }
}

export async function createVariantOption(payload: any): Promise<VariantOption> {
  const res = await fetch('/api/variant-options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create variant option');
  return data.variantOption || data;
}

export async function updateVariantOption(id: string, payload: any): Promise<VariantOption> {
  const res = await fetch(`/api/variant-options/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update variant option');
  return data.variantOption || data;
}

export async function deleteVariantOption(id: string): Promise<void> {
  const res = await fetch(`/api/variant-options/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete variant option');
  }
}

// ---- Menu item variants API (the per-item variant rows) ----

export async function fetchMenuItemVariants(menuItemId: string): Promise<MenuItemVariant[]> {
  const res = await fetch(`/api/menu-item-variants?menuItemId=${menuItemId}`);
  if (!res.ok) throw new Error('Failed to fetch menu item variants');
  const data = await res.json();
  return data.variants || [];
}

export async function createMenuItemVariant(payload: any): Promise<MenuItemVariant> {
  const res = await fetch('/api/menu-item-variants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to create menu item variant');
  }
  return data.variant || data;
}

export async function updateMenuItemVariant(id: string, payload: any): Promise<MenuItemVariant> {
  const res = await fetch(`/api/menu-item-variants/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to update menu item variant');
  }
  return data.variant || data;
}

export async function deleteMenuItemVariant(id: string): Promise<void> {
  const res = await fetch(`/api/menu-item-variants/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete menu item variant');
  }
}
