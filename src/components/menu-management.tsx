/**
 * Menu Management — main entry point.
 *
 * The original 2155-line component has been replaced with a modular
 * implementation in src/components/menu/. This file re-exports the
 * new MenuManagement component for backward compatibility with
 * src/app/page.tsx which imports from '@/components/menu-management'.
 *
 * Phase 3.4 (UI redesign) — the old file is preserved at
 * menu-management.tsx.old.bak for reference.
 */

export { default } from './menu/menu-management';
