'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Star,
  Gift,
  TrendingUp,
  RefreshCw,
  Loader2,
  AlertCircle,
  Coins,
  Award,
  Trophy,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface ReportSummary {
  totalCustomers: number;
  totalLegacyPoints: number;
  legacyPointsValue: number;
  legacyPointsLiability: number;
  activePromotions: number;
}

interface TierRow {
  tier: string;
  customerCount: number;
  totalPoints: number;
}

interface PromotionRow {
  id: string;
  name: string;
  status: string;
  earningMethod: string;
  stampsRequired: number;
  enrolledCustomers: number;
  availableStampsOutstanding: number;
  totalRewardsClaimed: number;
  rewardsIssued: number;
  rewardsRedeemed: number;
  rewardsExpired: number;
  rewardsAvailable: number;
  rewardsPending: number;
  redeemedValue: number;
  redemptionRate: number;
}

interface StampActivityRow {
  type: string;
  count: number;
  stamps: number;
}

interface RewardStatusRow {
  status: string;
  count: number;
  value: number;
}

interface ReportData {
  scope: { role: string; branchId: string | null; from: string | null; to: string | null };
  summary: ReportSummary;
  tierDistribution: TierRow[];
  promotionPerformance: PromotionRow[];
  stampActivity: StampActivityRow[];
  rewardStatus: RewardStatusRow[];
  topPromotionsByRedemption: {
    id: string;
    name: string;
    rewardsRedeemed: number;
    redemptionRate: number;
  }[];
}

// ============================================================
// Constants
// ============================================================

const TIER_COLORS: Record<string, string> = {
  BRONZE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  SILVER: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  GOLD: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  PLATINUM: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  DIAMOND: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PAUSED: 'bg-amber-100 text-amber-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  EXPIRED: 'bg-slate-200 text-slate-600',
  ARCHIVED: 'bg-slate-200 text-slate-500',
};

const REWARD_STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-700',
  PENDING_REDEMPTION: 'bg-amber-100 text-amber-700',
  REDEEMED: 'bg-blue-100 text-blue-700',
  EXPIRED: 'bg-slate-200 text-slate-500',
};

// ============================================================
// Component
// ============================================================

export default function LoyaltyReports() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.append('from', new Date(from).toISOString());
      if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        params.append('to', d.toISOString());
      }
      const res = await fetch(`/api/loyalty/reports?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load');
      setData(json as ReportData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[LoyaltyReports] load failed:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <span className="ml-2 text-slate-500">Loading loyalty reports...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-800 dark:text-red-300">Failed to load reports</p>
            <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={load}>
              <RefreshCw className="h-3 w-3 mr-1" /> Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, tierDistribution, promotionPerformance, stampActivity, rewardStatus, topPromotionsByRedemption } =
    data;

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            Loyalty Reports
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {data.scope.role === 'BRANCH_MANAGER'
              ? `Scoped to your branch${data.scope.branchId ? '' : ' (none assigned)'}`
              : 'Cross-branch view (ADMIN)'}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-500">From</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 text-xs w-36"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-slate-500">To</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 text-xs w-36"
            />
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Total Customers</p>
                <p className="text-2xl font-bold">{summary.totalCustomers}</p>
              </div>
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-full">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Legacy Points Issued</p>
                <p className="text-2xl font-bold">{summary.totalLegacyPoints.toFixed(0)}</p>
              </div>
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/40 rounded-full">
                <Star className="h-5 w-5 text-yellow-600 dark:text-yellow-300" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Points Liability</p>
                <p className="text-2xl font-bold">{summary.legacyPointsLiability.toFixed(2)} EGP</p>
              </div>
              <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-full">
                <Coins className="h-5 w-5 text-red-600 dark:text-red-300" />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {summary.totalLegacyPoints.toFixed(0)} pts × {summary.legacyPointsValue} EGP/pt
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Active Promotions</p>
                <p className="text-2xl font-bold">{summary.activePromotions}</p>
              </div>
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-full">
                <Gift className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tier distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-purple-600" />
              Tier Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Customers</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Avg / Cust</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tierDistribution.map((row) => (
                  <TableRow key={row.tier}>
                    <TableCell>
                      <Badge className={TIER_COLORS[row.tier]} variant="outline">
                        <Award className="h-3 w-3 mr-1" />
                        {row.tier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{row.customerCount}</TableCell>
                    <TableCell className="text-right">{row.totalPoints.toFixed(0)}</TableCell>
                    <TableCell className="text-right text-slate-500 text-xs">
                      {row.customerCount > 0
                        ? (row.totalPoints / row.customerCount).toFixed(0)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Reward status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Gift className="h-4 w-4 text-amber-600" />
              Reward Status Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Value (EGP)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rewardStatus.map((row) => (
                  <TableRow key={row.status}>
                    <TableCell>
                      <Badge className={REWARD_STATUS_COLORS[row.status] || ''} variant="outline">
                        {row.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">{row.value.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Promotion performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            Promotion Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Promotion</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead className="text-right">Issued</TableHead>
                <TableHead className="text-right">Redeemed</TableHead>
                <TableHead className="text-right">Expired</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Redemption %</TableHead>
                <TableHead className="text-right">Value Redeemed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promotionPerformance.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                    No promotions configured yet.
                  </TableCell>
                </TableRow>
              ) : (
                promotionPerformance.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.name}
                      <p className="text-[10px] text-slate-500">
                        {p.earningMethod} · {p.stampsRequired} stamps
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[p.status] || ''} variant="outline">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{p.enrolledCustomers}</TableCell>
                    <TableCell className="text-right">{p.rewardsIssued}</TableCell>
                    <TableCell className="text-right text-emerald-600">{p.rewardsRedeemed}</TableCell>
                    <TableCell className="text-right text-slate-500">{p.rewardsExpired}</TableCell>
                    <TableCell className="text-right text-amber-600">{p.rewardsAvailable}</TableCell>
                    <TableCell className="text-right font-medium">{p.redemptionRate.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{p.redeemedValue.toFixed(2)} EGP</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top promotions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Promotions by Redemption</CardTitle>
          </CardHeader>
          <CardContent>
            {topPromotionsByRedemption.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No redemptions yet.</p>
            ) : (
              <ol className="space-y-2">
                {topPromotionsByRedemption.map((p, i) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between text-sm border-b border-slate-100 dark:border-slate-800 last:border-0 pb-2 last:pb-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-4">{i + 1}.</span>
                      <span className="font-medium">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-600 font-medium">{p.rewardsRedeemed} redeemed</span>
                      <span className="text-slate-500">{p.redemptionRate.toFixed(1)}%</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Stamp activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Stamp Transaction Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Stamps</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stampActivity.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-slate-500">
                      No stamp activity in window.
                    </TableCell>
                  </TableRow>
                ) : (
                  stampActivity.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell className="text-xs font-medium">
                        {row.type.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right font-medium">
                        {row.stamps > 0 ? '+' : ''}
                        {row.stamps}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
