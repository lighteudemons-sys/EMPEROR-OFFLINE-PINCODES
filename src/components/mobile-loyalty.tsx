'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { 
  Star, Plus, RefreshCw, Search, Gift, Trophy, TrendingUp, Users, 
  X, Award, CreditCard, Percent, ShoppingCart, Info, ChevronRight
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { MobileBranchSelector } from '@/components/mobile-branch-selector';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  loyaltyPoints: number;
  tier: string;
  totalSpent: number;
  orderCount: number;
}

interface LoyaltyTransaction {
  id: string;
  points: number;
  type: 'EARNED' | 'REDEEMED' | 'ADJUSTMENT' | 'BONUS';
  orderId?: string;
  amount?: number;
  notes?: string;
  createdAt: string;
}

interface LoyaltySettings {
  pointsPerCurrency: number;
  redemptionRate: number;
  minimumOrderAmount: number;
  enabled: boolean;
}

const TIER_COLORS: Record<string, string> = {
  BRONZE: 'bg-amber-100 text-amber-700 border-amber-200',
  SILVER: 'bg-slate-100 text-slate-700 border-slate-300',
  GOLD: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  PLATINUM: 'bg-purple-100 text-purple-700 border-purple-300',
};

const TYPE_COLORS: Record<string, string> = {
  EARNED: 'bg-emerald-100 text-emerald-700',
  REDEEMED: 'bg-red-100 text-red-700',
  ADJUSTMENT: 'bg-blue-100 text-blue-700',
  BONUS: 'bg-purple-100 text-purple-700',
};

export function MobileLoyalty() {
  const { user } = useAuth();
  const { currency, t } = useI18n();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loyaltyInfo, setLoyaltyInfo] = useState<any>(null);
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings>({
    pointsPerCurrency: 1,
    redemptionRate: 0.01,
    minimumOrderAmount: 50,
    enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [points, setPoints] = useState(0);
  const [notes, setNotes] = useState('');
  const [redeemAmount, setRedeemAmount] = useState(0);

  useEffect(() => {
    fetchCustomers();
    fetchLoyaltySettings();
  }, [search]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('phone', search);

      const response = await fetch(`/api/customers?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers || []);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLoyaltySettings = async () => {
    try {
      const response = await fetch('/api/loyalty/settings');
      if (response.ok) {
        const data = await response.json();
        setLoyaltySettings(data.settings || loyaltySettings);
      }
    } catch (error) {
      console.error('Failed to fetch loyalty settings:', error);
    }
  };

  const fetchLoyaltyInfo = async (customerId: string) => {
    try {
      const response = await fetch(`/api/loyalty?customerId=${customerId}`);
      if (response.ok) {
        const data = await response.json();
        setLoyaltyInfo(data);
      }
    } catch (error) {
      console.error('Failed to fetch loyalty info:', error);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    fetchLoyaltyInfo(customer.id);
    setIsDialogOpen(true);
  };

  const adjustPoints = async () => {
    if (!selectedCustomer) return;

    try {
      const response = await fetch('/api/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'adjust',
          customerId: selectedCustomer.id,
          points,
          notes,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.customer) {
          setSelectedCustomer(data.customer);
        } else if (selectedCustomer && data.totalPoints !== undefined) {
          setSelectedCustomer({
            ...selectedCustomer,
            loyaltyPoints: data.totalPoints,
            tier: data.tier || selectedCustomer.tier,
          });
        }
        fetchLoyaltyInfo(selectedCustomer.id);
        fetchCustomers();
        setIsAdjustDialogOpen(false);
        setPoints(0);
        setNotes('');
        showSuccessToast('Success', 'Points adjusted successfully!');
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || 'Failed to adjust points');
      }
    } catch (error) {
      console.error('Failed to adjust points:', error);
      showErrorToast('Error', 'Failed to adjust points');
    }
  };

  const redeemPoints = async () => {
    if (!selectedCustomer) return;

    try {
      const response = await fetch('/api/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'redeem',
          customerId: selectedCustomer.id,
          points: redeemAmount,
          notes: 'Points redeemed',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.customer) {
          setSelectedCustomer(data.customer);
        }
        fetchLoyaltyInfo(selectedCustomer.id);
        fetchCustomers();
        setIsRedeemDialogOpen(false);
        setRedeemAmount(0);
        showSuccessToast('Success', 'Points redeemed successfully!');
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || 'Failed to redeem points');
      }
    } catch (error) {
      console.error('Failed to redeem points:', error);
      showErrorToast('Error', 'Failed to redeem points');
    }
  };

  const saveSettings = async () => {
    try {
      const response = await fetch('/api/loyalty/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loyaltySettings),
      });

      if (response.ok) {
        setIsSettingsDialogOpen(false);
        showSuccessToast('Success', 'Loyalty settings saved!');
      } else {
        const data = await response.json();
        showErrorToast('Error', data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      showErrorToast('Error', 'Failed to save settings');
    }
  };

  // Calculate stats
  const totalPoints = customers.reduce((sum, c) => sum + (c.loyaltyPoints || 0), 0);
  const tierCounts = customers.reduce((acc, c) => {
    acc[c.tier || 'BRONZE'] = (acc[c.tier || 'BRONZE'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredCustomers = search
    ? customers.filter(customer =>
        customer.name.toLowerCase().includes(search.toLowerCase()) ||
        customer.phone?.includes(search)
      )
    : customers;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-600 to-purple-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <Award className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Loyalty Program</h1>
            <p className="text-purple-100 text-sm">Manage customer rewards</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSettingsDialogOpen(true)}
            className="text-white hover:bg-white/20 h-11 w-11"
          >
            <CreditCard className="w-5 h-5" />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-purple-100 text-xs">Customers</p>
              <p className="text-lg font-bold">{customers.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-purple-100 text-xs">Total Points</p>
              <p className="text-lg font-bold">{totalPoints.toFixed(0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-3">
              <p className="text-purple-100 text-xs">Gold+</p>
              <p className="text-lg font-bold">
                {(tierCounts['GOLD'] || 0) + (tierCounts['PLATINUM'] || 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Branch Selector */}
        <MobileBranchSelector />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12 bg-white"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Refresh Button */}
        <Button
          variant="outline"
          onClick={fetchCustomers}
          className="w-full h-12"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Customers
        </Button>

        {/* Customers List */}
        <ScrollArea className="h-[calc(100vh-420px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <div className="animate-spin h-10 w-10 border-4 border-purple-600 border-t-transparent rounded-full mb-3" />
              <p>Loading customers...</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Users className="w-16 h-16 mb-4 text-slate-300" />
              <p className="font-medium">No customers found</p>
              <p className="text-sm">Try adjusting your search</p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {filteredCustomers.map((customer) => (
                <Card
                  key={customer.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleSelectCustomer(customer)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Users className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-slate-900">{customer.name}</h3>
                            <Badge className={TIER_COLORS[customer.tier || 'BRONZE'] || 'bg-slate-100 text-slate-700 border-slate-300'}>
                              <Trophy className="h-3 w-3 mr-1" />
                              {customer.tier || 'BRONZE'}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-600 mt-1">{customer.phone}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-200">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-purple-600">
                          <Star className="h-3.5 w-3.5" />
                          <span className="font-semibold text-sm">{customer.loyaltyPoints.toFixed(0)}</span>
                        </div>
                        <p className="text-xs text-slate-500">Points</p>
                      </div>
                      <div className="text-center border-l border-slate-200">
                        <div className="flex items-center justify-center gap-1 text-emerald-600">
                          <ShoppingCart className="h-3.5 w-3.5" />
                          <span className="font-semibold text-sm">{customer.orderCount || 0}</span>
                        </div>
                        <p className="text-xs text-slate-500">Orders</p>
                      </div>
                      <div className="text-center border-l border-slate-200">
                        <div className="flex items-center justify-center gap-1 text-blue-600">
                          <TrendingUp className="h-3.5 w-3.5" />
                          <span className="font-semibold text-sm">{currency}{(customer.totalSpent || 0).toFixed(0)}</span>
                        </div>
                        <p className="text-xs text-slate-500">Spent</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Customer Detail Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-purple-600" />
              Customer Details
            </DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{selectedCustomer.name}</h3>
                  <p className="text-sm text-slate-500">{selectedCustomer.phone}</p>
                </div>
                <Badge className={TIER_COLORS[selectedCustomer.tier || 'BRONZE'] || 'bg-slate-100 text-slate-700 border-slate-300'}>
                  <Trophy className="h-3 w-3 mr-1" />
                  {selectedCustomer.tier || 'BRONZE'}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Card className="text-center">
                  <CardContent className="p-3">
                    <p className="text-xs text-slate-600 mb-1">Points</p>
                    <p className="text-xl font-bold text-purple-600">{(selectedCustomer.loyaltyPoints || 0).toFixed(0)}</p>
                  </CardContent>
                </Card>
                <Card className="text-center">
                  <CardContent className="p-3">
                    <p className="text-xs text-slate-600 mb-1">Value</p>
                    <p className="text-xl font-bold text-emerald-600">
                      {currency}{((selectedCustomer.loyaltyPoints || 0) * (loyaltySettings?.redemptionRate || 0)).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="text-center">
                  <CardContent className="p-3">
                    <p className="text-xs text-slate-600 mb-1">Spent</p>
                    <p className="text-xl font-bold text-slate-900">
                      {currency}{(selectedCustomer.totalSpent || 0).toFixed(0)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-11"
                  onClick={() => { setIsDialogOpen(false); setIsAdjustDialogOpen(true); }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adjust Points
                </Button>
                <Button
                  className="flex-1 h-11 bg-purple-600 hover:bg-purple-700"
                  onClick={() => { setIsDialogOpen(false); setIsRedeemDialogOpen(true); }}
                >
                  <Gift className="h-4 w-4 mr-2" />
                  Redeem
                </Button>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Star className="h-4 w-4 text-purple-600" />
                  Recent Transactions
                </h4>
                <ScrollArea className="h-[200px]">
                  {loyaltyInfo?.transactions?.length > 0 ? (
                    <div className="space-y-2">
                      {loyaltyInfo.transactions.map((tx: LoyaltyTransaction) => (
                        <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <Badge className={TYPE_COLORS[tx.type] || 'bg-slate-100 text-slate-700'}>{tx.type}</Badge>
                            {tx.notes && <p className="text-sm text-slate-600 mt-1 truncate">{tx.notes}</p>}
                          </div>
                          <div className="text-right ml-2">
                            <p className={`font-semibold ${(tx.points || 0) > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {(tx.points || 0) > 0 ? '+' : ''}{(tx.points || 0).toFixed(0)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : 'N/A'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                      <Info className="w-12 h-12 mb-2 text-slate-300" />
                      <p className="text-sm">No transactions yet</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto h-11">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Points Dialog */}
      <Dialog open={isAdjustDialogOpen} onOpenChange={setIsAdjustDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Adjust Customer Points
            </DialogTitle>
            <DialogDescription>
              Add or remove points from {selectedCustomer?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="points">Points to Add/Remove</Label>
              <Input
                id="points"
                type="number"
                step="1"
                value={points}
                onChange={(e) => setPoints(parseFloat(e.target.value) || 0)}
                placeholder="Positive to add, negative to remove"
                className="h-11"
              />
              <p className="text-xs text-slate-500">
                Use positive number to add points, negative to remove
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Reason</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for adjustment..."
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setIsAdjustDialogOpen(false)} className="w-full sm:w-auto h-11">
              Cancel
            </Button>
            <Button className="w-full sm:w-auto h-11 bg-blue-600 hover:bg-blue-700" onClick={adjustPoints}>
              Confirm Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem Points Dialog */}
      <Dialog open={isRedeemDialogOpen} onOpenChange={setIsRedeemDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-600" />
              Redeem Points
            </DialogTitle>
            <DialogDescription>
              Redeem points for {selectedCustomer?.name}
            </DialogDescription>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4 py-4">
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-purple-700">Available Points</p>
                      <p className="text-2xl font-bold text-purple-900">
                        {selectedCustomer.loyaltyPoints.toFixed(0)}
                      </p>
                    </div>
                    <Star className="w-12 h-12 text-purple-300" />
                  </div>
                  <p className="text-xs text-purple-600 mt-2">
                    {currency} {((selectedCustomer.loyaltyPoints || 0) * (loyaltySettings?.redemptionRate || 0)).toFixed(2)} available value
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label htmlFor="redeemAmount">Points to Redeem</Label>
                <Input
                  id="redeemAmount"
                  type="number"
                  step="1"
                  min="0"
                  max={selectedCustomer.loyaltyPoints || 0}
                  value={redeemAmount}
                  onChange={(e) => setRedeemAmount(parseFloat(e.target.value) || 0)}
                  placeholder={`Max: ${selectedCustomer.loyaltyPoints.toFixed(0)}`}
                  className="h-11"
                />
                {redeemAmount > 0 && (
                  <p className="text-sm text-slate-600 flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    Customer will receive {currency} {(redeemAmount * (loyaltySettings?.redemptionRate || 0)).toFixed(2)} discount
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setIsRedeemDialogOpen(false)} className="w-full sm:w-auto h-11">
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto h-11 bg-purple-600 hover:bg-purple-700"
              onClick={redeemPoints}
              disabled={!redeemAmount || redeemAmount <= 0}
            >
              Redeem Points
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-purple-600" />
              Loyalty Program Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pointsPerCurrency">Points per {currency}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="pointsPerCurrency"
                  type="number"
                  step="0.1"
                  value={loyaltySettings.pointsPerCurrency}
                  onChange={(e) => setLoyaltySettings({ ...loyaltySettings, pointsPerCurrency: parseFloat(e.target.value) || 0 })}
                  className="h-11"
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">points</span>
              </div>
              <p className="text-xs text-slate-500">
                Customers earn X points for every {currency}1 spent
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="redemptionRate">Redemption Rate</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="redemptionRate"
                  type="number"
                  step="0.001"
                  value={loyaltySettings.redemptionRate}
                  onChange={(e) => setLoyaltySettings({ ...loyaltySettings, redemptionRate: parseFloat(e.target.value) || 0 })}
                  className="h-11"
                />
                <span className="text-sm text-slate-600 whitespace-nowrap">{currency}/point</span>
              </div>
              <p className="text-xs text-slate-500">
                Each point is worth this amount in {currency}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="minimumOrderAmount">Minimum Order for Points</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">{currency}</span>
                <Input
                  id="minimumOrderAmount"
                  type="number"
                  step="0.01"
                  value={loyaltySettings.minimumOrderAmount}
                  onChange={(e) => setLoyaltySettings({ ...loyaltySettings, minimumOrderAmount: parseFloat(e.target.value) || 0 })}
                  className="h-11"
                />
              </div>
              <p className="text-xs text-slate-500">
                Minimum order amount required to earn points
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="enabled">Enable Loyalty Program</Label>
                <p className="text-xs text-slate-500">Turn on/off the loyalty program</p>
              </div>
              <input
                id="enabled"
                type="checkbox"
                checked={loyaltySettings.enabled}
                onChange={(e) => setLoyaltySettings({ ...loyaltySettings, enabled: e.target.checked })}
                className="h-5 w-5 rounded border-gray-300 focus:ring-purple-600"
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setIsSettingsDialogOpen(false)} className="w-full sm:w-auto h-11">
              Cancel
            </Button>
            <Button className="w-full sm:w-auto h-11 bg-purple-600 hover:bg-purple-700" onClick={saveSettings}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
