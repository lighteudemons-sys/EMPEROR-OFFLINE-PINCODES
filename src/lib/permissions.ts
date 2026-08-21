import { useAuth } from '@/lib/auth-context';

export function canSeeFinancials(user: { role?: string; canViewFinancials?: boolean } | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || !!user.canViewFinancials;
}
