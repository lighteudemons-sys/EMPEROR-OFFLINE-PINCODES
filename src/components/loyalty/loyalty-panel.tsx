'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Star,
  Gift,
  Award,
  Sparkles,
  TrendingUp,
  Loader2,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

// ============================================================
// Types (mirror src/lib/loyalty-engine.ts CustomerProgress)
// ============================================================

interface Enrollment {
  id: string;
  promotionId: string;
  promotionName: string;
  isActive: boolean;
  enrolledAt: string;
  lastEarnedAt: string | null;
  lastRedeemedAt: string | null;
  availableStamps: number;
  rewardsClaimed: number;
  stampsRequired: number;
  earningMethod: string;
  earningValue: number;
  overlapRule: string;
  rewardType: string;
  rewardValue: number | null;
  rewardProductId: string | null;
  rewardCategoryId: string | null;
}

interface AvailableReward {
  id: string;
  promotionId: string;
  promotionName: string;
  rewardType: string;
  rewardValue: number | null;
  rewardProductId: string | null;
  rewardCategoryId: string | null;
  status: string;
  earnedAt: string;
  expiresAt: string | null;
}

interface CustomerProgress {
  customerId: string;
  legacyPoints: number;
  enrollments: Enrollment[];
  availableRewards: AvailableReward[];
}

interface RedemptionResult {
  rewardInstanceId: string;
  status: 'PENDING_REDEMPTION';
  rewardType: string;
  rewardValue: number | null;
  rewardProductId: string | null;
  rewardCategoryId: string | null;
  promotionId: string;
  promotionName: string;
  customerId: string;
  expiresAt: string | null;
  reservedExpiresAt: string;
}

// ============================================================
// Props
// ============================================================

export interface LoyaltyPanelProps {
  customerId: string;
  branchId: string;
  cashierId: string;
  onRewardRedeemed?: (reward: RedemptionResult) => void;
  onRewardReleased?: (rewardInstanceId: string) => void;
  compact?: boolean;
}

// ============================================================
// Helpers
// ============================================================

const TIER_COLORS: Record<string, string> = {
  BRONZE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  SILVER: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  GOLD: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  PLATINUM: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  DIAMOND: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
};

function tierBadgeClass(tier: string | undefined): string {
  if (!tier) return TIER_COLORS.BRONZE;
  return TIER_COLORS[tier.toUpperCase()] || TIER_COLORS.BRONZE;
}

function formatRewardLabel(reward: {
  rewardType: string;
  rewardValue: number | null;
}): string {
  switch (reward.rewardType) {
    case 'FREE_PRODUCT':
      return 'Free Product';
    case 'DISCOUNT_AMOUNT':
      return reward.rewardValue != null ? `${reward.rewardValue} EGP Off` : 'Discount';
    case 'DISCOUNT_PERCENTAGE':
      return reward.rewardValue != null ? `${reward.rewardValue}% Off` : 'Discount';
    case 'FREE_ITEM':
      return 'Free Item';
    default:
      return reward.rewardType.replace(/_/g, ' ').toLowerCase();
  }
}

function earningMethodLabel(method: string): string {
  switch (method) {
    case 'PER_ITEM':
      return 'per item';
    case 'PER_QUANTITY':
      return 'per unit';
    case 'PER_AMOUNT':
      return 'per EGP';
    case 'PER_VISIT':
      return 'per visit';
    default:
      return method.toLowerCase();
  }
}

// ============================================================
// Component
// ============================================================

export default function LoyaltyPanel({
  customerId,
  branchId,
  cashierId,
  onRewardRedeemed,
  onRewardReleased,
  compact = false,
}: LoyaltyPanelProps) {
  const [progress, setProgress] = useState<CustomerProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeemingIds, setRedeemingIds] = useState<Set<string>>(new Set());
  const [releasingIds, setReleasingIds] = useState<Set<string>>(new Set());
  // Locally-tracked reserved reward IDs — lets us show "Reserved" UI immediately
  // even before the engine has fully transitioned the reward state.
  const [reservedIds, setReservedIds] = useState<Set<string>>(new Set());
  const [customerTier, setCustomerTier] = useState<string>('BRONZE');

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/loyalty/customer-progress?customerId=${encodeURIComponent(customerId)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to load progress');
      }
      setProgress(data.progress as CustomerProgress);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[LoyaltyPanel] fetchProgress error:', err);
      setError(message);
      // Do not block the POS — show a soft error and keep going.
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Fetch on mount and when customerId changes
  useEffect(() => {
    if (!customerId) {
      setProgress(null);
      setLoading(false);
      return;
    }
    fetchProgress();
    // Reset reservation state when switching customers
    setReservedIds(new Set());
  }, [customerId, fetchProgress]);

  // Also fetch customer tier (separately — the customer-progress endpoint
  // does not currently return tier). We try /api/customers/[id] for it.
  useEffect(() => {
    let cancelled = false;
    async function loadTier() {
      if (!customerId) return;
      try {
        const res = await fetch(`/api/customers/${customerId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const tier = data?.customer?.tier || data?.tier || 'BRONZE';
        setCustomerTier(tier);
      } catch {
        // Silent — tier is decorative
      }
    }
    loadTier();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const handleRedeem = async (rewardInstanceId: string) => {
    if (redeemingIds.has(rewardInstanceId)) return;
    setRedeemingIds((prev) => new Set(prev).add(rewardInstanceId));
    try {
      const response = await fetch('/api/loyalty/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardInstanceId,
          // The actual orderId is not known until the order is finalized.
          // Use 'pending' as a placeholder; the reservation is enough for the UI.
          orderId: 'pending',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to redeem reward');
      }

      const redemption = data.redemption as RedemptionResult;
      // Track as reserved locally
      setReservedIds((prev) => new Set(prev).add(rewardInstanceId));

      showSuccessToast(
        'Reward Reserved',
        `${redemption.promotionName} • ${formatRewardLabel(redemption)}`
      );

      // Notify the POS so it can apply the reward to the cart
      onRewardRedeemed?.(redemption);

      // Refresh progress to reflect the updated reward list
      fetchProgress();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to redeem reward';
      showErrorToast('Redemption Failed', message);
    } finally {
      setRedeemingIds((prev) => {
        const next = new Set(prev);
        next.delete(rewardInstanceId);
        return next;
      });
    }
  };

  const handleRelease = async (rewardInstanceId: string) => {
    if (releasingIds.has(rewardInstanceId)) return;
    setReleasingIds((prev) => new Set(prev).add(rewardInstanceId));
    try {
      const response = await fetch('/api/loyalty/release-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardInstanceId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      // Remove from local reserved set
      setReservedIds((prev) => {
        const next = new Set(prev);
        next.delete(rewardInstanceId);
        return next;
      });

      onRewardReleased?.(rewardInstanceId);

      showSuccessToast('Reward Released', 'The reward is available again.');

      // Refresh progress
      fetchProgress();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to release reward';
      showErrorToast('Release Failed', message);
      // Even if release fails (e.g. engine already moved reward to REDEEMED),
      // remove from local reserved set so the UI doesn't get stuck.
      setReservedIds((prev) => {
        const next = new Set(prev);
        next.delete(rewardInstanceId);
        return next;
      });
    } finally {
      setReleasingIds((prev) => {
        const next = new Set(prev);
        next.delete(rewardInstanceId);
        return next;
      });
    }
  };

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return <LoyaltyPanelSkeleton compact={compact} />;
  }

  if (error && !progress) {
    return (
      <div
        className={`rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 ${
          compact ? 'text-xs' : 'text-sm'
        }`}
        role="alert"
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              Loyalty unavailable
            </p>
            <p className="text-amber-700 dark:text-amber-400 mt-0.5 break-words">
              {error}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-xs"
              onClick={fetchProgress}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!progress) {
    return null;
  }

  const enrollments = progress.enrollments || [];
  const rewards = progress.availableRewards || [];
  const legacyPoints = progress.legacyPoints || 0;

  const hasAnyActivity =
    enrollments.length > 0 || rewards.length > 0 || legacyPoints > 0;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* Header: legacy points + tier */}
      <div
        className={`flex items-center justify-between gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 ${
          compact ? 'py-2' : 'py-2.5'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Star className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-blue-700 dark:text-blue-300 font-medium uppercase tracking-wide`}>
              Legacy Points
            </p>
            <p className={`${compact ? 'text-sm' : 'text-base'} font-bold text-blue-900 dark:text-blue-100 truncate`}>
              {legacyPoints.toFixed(0)} pts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge className={`${tierBadgeClass(customerTier)} border-0 ${compact ? 'text-[9px] px-1.5 py-0' : 'text-xs'}`}>
            <Award className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} mr-1`} />
            {customerTier}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            className={`${compact ? 'h-6 w-6' : 'h-7 w-7'}`}
            onClick={fetchProgress}
            disabled={loading}
            aria-label="Refresh loyalty progress"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {!hasAnyActivity && (
        <div
          className={`text-center py-4 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 ${
            compact ? 'text-[10px]' : 'text-xs'
          } text-slate-500 dark:text-slate-400`}
        >
          <Sparkles className={`mx-auto mb-1 ${compact ? 'h-4 w-4' : 'h-5 w-5'} text-slate-400`} />
          No active promotions or rewards yet
        </div>
      )}

      {/* Desktop: two columns. Mobile/compact: single column. */}
      {compact ? (
        <div className="space-y-2">
          {enrollments.length > 0 && (
            <div className="space-y-1.5">
              {enrollments.map((enr) => (
                <PromotionProgressCard
                  key={enr.id}
                  enrollment={enr}
                  compact
                />
              ))}
            </div>
          )}
          {rewards.length > 0 && (
            <div className="space-y-1.5">
              {rewards.map((r) => (
                <RewardCard
                  key={r.id}
                  reward={r}
                  reserved={reservedIds.has(r.id)}
                  redeeming={redeemingIds.has(r.id)}
                  releasing={releasingIds.has(r.id)}
                  onRedeem={handleRedeem}
                  onRelease={handleRelease}
                  compact
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Promotions column */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Active Promotions
              </p>
            </div>
            {enrollments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic px-2 py-3">
                No active promotions
              </p>
            ) : (
              enrollments.map((enr) => (
                <PromotionProgressCard key={enr.id} enrollment={enr} />
              ))
            )}
          </div>

          {/* Rewards column */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Gift className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Available Rewards
              </p>
            </div>
            {rewards.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic px-2 py-3">
                No rewards available
              </p>
            ) : (
              rewards.map((r) => (
                <RewardCard
                  key={r.id}
                  reward={r}
                  reserved={reservedIds.has(r.id)}
                  redeeming={redeemingIds.has(r.id)}
                  releasing={releasingIds.has(r.id)}
                  onRedeem={handleRedeem}
                  onRelease={handleRelease}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function PromotionProgressCard({
  enrollment,
  compact = false,
}: {
  enrollment: Enrollment;
  compact?: boolean;
}) {
  const stamps = enrollment.availableStamps || 0;
  const required = enrollment.stampsRequired || 1;
  const percent = Math.min(100, Math.round((stamps / required) * 100));
  const isComplete = stamps >= required;

  return (
    <div
      className={`rounded-lg border ${
        isComplete
          ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20'
          : 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900'
      } ${compact ? 'p-2' : 'p-2.5'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <p className={`${compact ? 'text-[11px]' : 'text-xs'} font-semibold text-slate-900 dark:text-slate-100 truncate`}>
            {enrollment.promotionName}
          </p>
          <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-slate-500 dark:text-slate-400`}>
            {earningMethodLabel(enrollment.earningMethod)} • {required} stamps needed
          </p>
        </div>
        <Badge
          className={`${
            isComplete
              ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
          } border-0 ${compact ? 'text-[9px] px-1.5' : 'text-[10px]'}`}
        >
          {stamps}/{required}
        </Badge>
      </div>
      <Progress
        value={percent}
        className={`h-1.5 ${isComplete ? 'bg-emerald-200 dark:bg-emerald-900' : ''}`}
      />
      {isComplete && (
        <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1`}>
          <CheckCircle2 className="h-2.5 w-2.5" />
          Reward ready to claim!
        </p>
      )}
    </div>
  );
}

function RewardCard({
  reward,
  reserved,
  redeeming,
  releasing,
  onRedeem,
  onRelease,
  compact = false,
}: {
  reward: AvailableReward;
  reserved: boolean;
  redeeming: boolean;
  releasing: boolean;
  onRedeem: (id: string) => void;
  onRelease: (id: string) => void;
  compact?: boolean;
}) {
  // If the engine reports PENDING_REDEMPTION status, treat as reserved.
  const isReserved = reserved || reward.status === 'PENDING_REDEMPTION';
  const label = formatRewardLabel(reward);

  return (
    <div
      className={`rounded-lg border ${
        isReserved
          ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20'
          : 'border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900'
      } ${compact ? 'p-2' : 'p-2.5'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`${compact ? 'text-[11px]' : 'text-xs'} font-semibold text-slate-900 dark:text-slate-100 truncate`}>
            {reward.promotionName}
          </p>
          <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-amber-700 dark:text-amber-400 font-medium`}>
            {label}
          </p>
          {reward.expiresAt && (
            <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-slate-500 dark:text-slate-400 mt-0.5`}>
              Expires {new Date(reward.expiresAt).toLocaleDateString()}
            </p>
          )}
          {isReserved && (
            <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-amber-700 dark:text-amber-400 mt-0.5 flex items-center gap-1`}>
              <CheckCircle2 className="h-2.5 w-2.5" />
              Reserved
            </p>
          )}
        </div>
        <div className="flex-shrink-0">
          {isReserved ? (
            <Button
              size="sm"
              variant="outline"
              className={`${compact ? 'h-7 text-[10px] px-2' : 'h-8 text-xs'}`}
              onClick={() => onRelease(reward.id)}
              disabled={releasing}
            >
              {releasing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </>
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              className={`bg-amber-600 hover:bg-amber-700 text-white ${
                compact ? 'h-7 text-[10px] px-2' : 'h-8 text-xs'
              }`}
              onClick={() => onRedeem(reward.id)}
              disabled={redeeming}
            >
              {redeeming ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Gift className="h-3 w-3 mr-1" />
                  Redeem
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function LoyaltyPanelSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div
        className={`flex items-center justify-between rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 px-3 ${
          compact ? 'py-2' : 'py-2.5'
        }`}
      >
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <div className="space-y-1">
            <Skeleton className={compact ? 'h-2 w-16' : 'h-3 w-20'} />
            <Skeleton className={compact ? 'h-3 w-12' : 'h-4 w-16'} />
          </div>
        </div>
        <Skeleton className={compact ? 'h-4 w-12' : 'h-5 w-14'} />
      </div>
      <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
        {[1, 2].map((i) => (
          <Skeleton key={i} className={compact ? 'h-12 w-full' : 'h-14 w-full'} />
        ))}
      </div>
    </div>
  );
}
