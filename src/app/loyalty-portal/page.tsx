'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Coffee,
  Star,
  Award,
  Gift,
  QrCode,
  LogOut,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Clock,
  TrendingUp,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface PortalProfile {
  name: string;
  membershipCode: string | null;
  tier: string;
  legacyPoints: number;
  maskedPhone: string;
  email: string | null;
}

interface Enrollment {
  id: string;
  promotionId: string;
  promotionName: string;
  isActive: boolean;
  availableStamps: number;
  rewardsClaimed: number;
  stampsRequired: number;
  earningMethod: string;
  rewardType: string;
}

interface AvailableReward {
  id: string;
  promotionId: string;
  promotionName: string;
  rewardType: string;
  status: string;
  earnedAt: string;
  expiresAt: string | null;
}

interface RecentTransaction {
  id: string;
  type: string;
  stamps: number;
  promotionId: string;
  createdAt: string;
  reason: string | null;
}

interface PortalData {
  profile: PortalProfile;
  progress: {
    customerId: string;
    legacyPoints: number;
    enrollments: Enrollment[];
    availableRewards: AvailableReward[];
  };
  recentTransactions: RecentTransaction[];
}

// ============================================================
// Constants
// ============================================================

const TIER_COLORS: Record<string, string> = {
  BRONZE: 'bg-amber-100 text-amber-800 border-amber-200',
  SILVER: 'bg-slate-100 text-slate-700 border-slate-300',
  GOLD: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  PLATINUM: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  DIAMOND: 'bg-indigo-100 text-indigo-800 border-indigo-300',
};

const TX_TYPE_LABEL: Record<string, string> = {
  EARNED: 'Earned',
  THRESHOLD_CONSUMED: 'Reward Issued',
  REWARD_REDEEMED: 'Redeemed',
  REWARD_EXPIRED: 'Expired',
  REFUND_REVERSED: 'Refund Reversal',
  ADJUSTED: 'Adjustment',
  STAMPS_EXPIRED: 'Stamps Expired',
};

// ============================================================
// Main Page Component
// ============================================================

export default function LoyaltyPortalPage() {
  const [step, setStep] = useState<'identifier' | 'otp' | 'profile'>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PortalData | null>(null);

  // On mount: try silent session check
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/loyalty-portal/profile', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setData(json);
            setStep('profile');
          }
        }
      } catch {
        // No active session — stay on identifier step
      }
    })();
  }, []);

  const handleSendOtp = async () => {
    setError(null);
    if (!identifier.trim()) {
      setError('Please enter your membership code or phone number.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/loyalty-portal/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipCodeOrPhone: identifier }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setMaskedPhone(json.maskedPhone || '');
      // Dev mode surfaces the OTP for testing
      if (json.devOtp) {
        setDevOtp(json.devOtp);
      } else {
        setDevOtp(null);
      }
      setStep('otp');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send OTP';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    if (!otp.trim()) {
      setError('Please enter the OTP sent to your phone.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/loyalty-portal/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipCodeOrPhone: identifier, otp }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      // Success — fetch profile
      await loadProfile();
      setStep('profile');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OTP verification failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/loyalty-portal/profile', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error('[LoyaltyPortal] load profile failed:', err);
    }
  }, []);

  const handleLogout = async () => {
    await fetch('/api/loyalty-portal/profile', { method: 'DELETE' });
    setData(null);
    setStep('identifier');
    setIdentifier('');
    setOtp('');
    setMaskedPhone('');
    setDevOtp(null);
  };

  // ----------------------------------------------------------
  // Identifier step
  // ----------------------------------------------------------
  if (step === 'identifier') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-emerald-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg mb-3">
              <Coffee className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Emperor Coffee</CardTitle>
            <p className="text-sm text-slate-500">Loyalty Portal</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Membership Code or Phone</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="EMP-A7K3M9 or 01012345678"
                onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
              />
              <p className="text-xs text-slate-500">
                We&apos;ll send a one-time code to your registered phone number.
              </p>
            </div>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <Button
              onClick={handleSendOtp}
              disabled={loading || !identifier.trim()}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Sending OTP...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----------------------------------------------------------
  // OTP step
  // ----------------------------------------------------------
  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-emerald-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-full flex items-center justify-center shadow-lg mb-3">
              <QrCode className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Verify Your Phone</CardTitle>
            <p className="text-sm text-slate-500">
              Enter the code we sent to <span className="font-medium">{maskedPhone}</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {devOtp && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Dev mode — SMS not configured</p>
                  <p className="mt-1">
                    Your OTP is: <span className="font-mono font-bold">{devOtp}</span>
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="otp">One-Time Code</Label>
              <Input
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="text-center text-2xl tracking-[0.5em] font-mono"
                inputMode="numeric"
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
              />
            </div>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <Button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Continue'
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep('identifier');
                setError(null);
                setOtp('');
                setDevOtp(null);
              }}
              className="w-full"
            >
              ← Use a different number
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Profile step — the dashboard
  // ----------------------------------------------------------
  if (step === 'profile' && data) {
    return <PortalDashboard data={data} onRefresh={loadProfile} onLogout={handleLogout} />;
  }

  // Fallback
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
    </div>
  );
}

// ============================================================
// Dashboard — the actual member portal view
// ============================================================

function PortalDashboard({
  data,
  onRefresh,
  onLogout,
}: {
  data: PortalData;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
}) {
  const { profile, progress, recentTransactions } = data;
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-emerald-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-amber-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center">
              <Coffee className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-sm">Emperor Loyalty</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onLogout} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Membership card */}
        <Card className="overflow-hidden border-0 shadow-xl bg-gradient-to-br from-slate-900 via-amber-900 to-orange-900 text-white">
          <CardContent className="p-6 relative">
            {/* Decorative coffee bean pattern */}
            <div className="absolute top-0 right-0 opacity-10">
              <Coffee className="h-32 w-32" />
            </div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-amber-300">Membership Card</p>
                  <h1 className="text-2xl font-bold mt-1">{profile.name}</h1>
                  <p className="text-xs text-amber-200 mt-1">{profile.maskedPhone}</p>
                </div>
                <Badge className={`${TIER_COLORS[profile.tier] || TIER_COLORS.BRONZE} border-0 text-sm`}>
                  <Award className="h-3 w-3 mr-1" />
                  {profile.tier}
                </Badge>
              </div>

              {profile.membershipCode && (
                <div className="mt-4">
                  <p className="text-xs text-amber-300 mb-1">Membership Code</p>
                  <div className="flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-amber-300" />
                    <span className="font-mono text-lg tracking-wider">{profile.membershipCode}</span>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 pt-3 border-t border-amber-700/50">
                <Star className="h-4 w-4 text-amber-300" />
                <span className="text-sm">
                  <span className="font-bold text-xl">{profile.legacyPoints.toFixed(0)}</span>{' '}
                  <span className="text-amber-200">legacy points</span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active promotions */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Active Promotions
            </h2>
            <span className="text-xs text-slate-500">{progress.enrollments.length} enrolled</span>
          </div>
          {progress.enrollments.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-slate-500">
                You&apos;re not enrolled in any promotions yet. Make a qualifying purchase to start earning!
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {progress.enrollments.map((enr) => (
                <PromotionProgressCard key={enr.id} enrollment={enr} />
              ))}
            </div>
          )}
        </section>

        {/* Available rewards */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Gift className="h-4 w-4 text-amber-600" />
              Available Rewards
            </h2>
            <span className="text-xs text-slate-500">{progress.availableRewards.length} ready</span>
          </div>
          {progress.availableRewards.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-slate-500">
                No rewards available right now. Keep earning stamps!
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {progress.availableRewards.map((r) => (
                <RewardCard key={r.id} reward={r} />
              ))}
            </div>
          )}
        </section>

        {/* Transaction history */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              Recent Activity
            </h2>
          </div>
          <Card>
            <CardContent className="p-0">
              {recentTransactions.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">No loyalty activity yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentTransactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {TX_TYPE_LABEL[tx.type] || tx.type.replace(/_/g, ' ')}
                        </p>
                        {tx.reason && (
                          <p className="text-xs text-slate-500 truncate">{tx.reason}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(tx.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className={`text-sm font-bold flex-shrink-0 ml-2 ${
                        tx.stamps > 0 ? 'text-emerald-600' : tx.stamps < 0 ? 'text-red-600' : 'text-slate-400'
                      }`}>
                        {tx.stamps > 0 ? '+' : ''}{tx.stamps}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function PromotionProgressCard({ enrollment }: { enrollment: Enrollment }) {
  const stamps = enrollment.availableStamps || 0;
  const required = enrollment.stampsRequired || 1;
  const percent = Math.min(100, Math.round((stamps / required) * 100));
  const isComplete = stamps >= required;

  return (
    <Card className={isComplete ? 'border-emerald-300 bg-emerald-50/50' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{enrollment.promotionName}</p>
            <p className="text-xs text-slate-500">
              {enrollment.earningMethod.replace(/_/g, ' ').toLowerCase()} · {required} stamps to reward
            </p>
          </div>
          <Badge
            className={`${
              isComplete
                ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                : 'bg-emerald-100 text-emerald-700'
            } border-0`}
          >
            {stamps}/{required}
          </Badge>
        </div>
        <Progress value={percent} className="h-2" />
        {isComplete && (
          <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Reward ready! Show this at the counter to redeem.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RewardCard({ reward }: { reward: AvailableReward }) {
  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
      <CardContent className="p-4">
        <p className="font-semibold text-sm truncate">{reward.promotionName}</p>
        <p className="text-xs text-amber-700 mt-1 font-medium uppercase tracking-wide">
          {reward.rewardType.replace(/_/g, ' ')}
        </p>
        {reward.expiresAt && (
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Expires {new Date(reward.expiresAt).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
