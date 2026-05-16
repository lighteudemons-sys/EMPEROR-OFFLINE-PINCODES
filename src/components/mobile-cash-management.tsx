'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Wallet, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle,
  Building, Calendar, Filter, RefreshCw, CheckCircle, X,
  AlertCircle, DollarSign, Info, Shield
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/utils';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface CashBalance {
  branchId: string;
  branchName: string;
  isActive: boolean;
  totalIn: number;
  totalOut: number;
  currentBalance: number;
  transactionCount: number;
}

interface CashTransaction {
  id: string;
  branchId: string;
  type: 'SHIFT_CLOSING' | 'WITHDRAWAL';
  amount: number;
  description: string | null;
  shiftId: string | null;
  createdAt: string;
  branch: {
    id: string;
    branchName: string;
  };
  creator: {
    id: string;
    username: string;
    name: string | null;
  };
  shift?: {
    id: string;
    startTime: string;
    endTime: string | null;
    cashier: {
      id: string;
      username: string;
      name: string | null;
    };
  };
}

export function MobileCashManagement() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<CashBalance[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);

  // Dialogs
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);

  // Form data
  const [depositData, setDepositData] = useState({
    branchId: '',
    amount: '',
    description: '',
  });

  const [withdrawData, setWithdrawData] = useState({
    branchId: '',
    amount: '',
    description: '',
  });

  // Fetch balances
  const fetchBalances = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cash-management/balance');
      const data = await response.json();
      console.log('[MobileCashManagement] Balance data:', data);
      if (data.success) {
        setBalances(data.balances || []);
        setGrandTotal(data.grandTotal || 0);
      } else {
        console.error('[MobileCashManagement] Balance API error:', data.error);
        showErrorToast('Error', data.error || 'Failed to load cash balances');
      }
    } catch (error) {
      console.error('[MobileCashManagement] Failed to fetch balances:', error);
      showErrorToast('Error', 'Failed to load cash balances');
    } finally {
      setLoading(false);
    }
  };

  // Fetch transactions
  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranch && selectedBranch !== 'all') {
        params.append('branchId', selectedBranch);
      }
      if (selectedMonth) {
        const year = selectedMonth.split('-')[0];
        const month = selectedMonth.split('-')[1];
        const startDate = `${year}-${month}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
        params.append('startDate', startDate);
        params.append('endDate', endDate);
      }

      const response = await fetch(`/api/cash-management/transactions?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setTransactions(data.transactions);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, []);

  useEffect(() => {
    if (balances.length > 0) {
      fetchTransactions();
    }
  }, [selectedBranch, selectedMonth, balances.length]);

  // Handle deposit
  const handleDeposit = async () => {
    if (!depositData.branchId || !depositData.amount) {
      showErrorToast('Error', 'Please fill in all required fields');
      return;
    }

    const amount = parseFloat(depositData.amount);
    if (amount <= 0) {
      showErrorToast('Error', 'Amount must be greater than 0');
      return;
    }

    try {
      const response = await fetch('/api/cash-management/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: depositData.branchId,
          amount,
          description: depositData.description || 'Manual cash deposit',
          createdBy: user?.id,
        }),
      });

      const data = await response.json();
      if (data.success) {
        showSuccessToast('Success', 'Cash IN recorded successfully');
        setDepositDialogOpen(false);
        setDepositData({ branchId: '', amount: '', description: '' });
        fetchBalances();
        fetchTransactions();
      } else {
        showErrorToast('Error', data.error || 'Failed to record deposit');
      }
    } catch (error) {
      console.error('Failed to record deposit:', error);
      showErrorToast('Error', 'Failed to record deposit');
    }
  };

  // Handle withdrawal
  const handleWithdraw = async () => {
    if (!withdrawData.branchId || !withdrawData.amount) {
      showErrorToast('Error', 'Please fill in all required fields');
      return;
    }

    const amount = parseFloat(withdrawData.amount);
    if (amount <= 0) {
      showErrorToast('Error', 'Amount must be greater than 0');
      return;
    }

    // Check sufficient funds
    const balance = balances.find(b => b.branchId === withdrawData.branchId);
    if (balance && amount > balance.currentBalance) {
      showErrorToast('Error', 'Insufficient funds');
      return;
    }

    try {
      const response = await fetch('/api/cash-management/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: withdrawData.branchId,
          amount,
          description: withdrawData.description || 'Manual withdrawal',
          createdBy: user?.id,
        }),
      });

      const data = await response.json();
      if (data.success) {
        showSuccessToast('Success', 'Cash OUT recorded successfully');
        setWithdrawDialogOpen(false);
        setWithdrawData({ branchId: '', amount: '', description: '' });
        fetchBalances();
        fetchTransactions();
      } else {
        showErrorToast('Error', data.error || 'Failed to record withdrawal');
      }
    } catch (error) {
      console.error('Failed to record withdrawal:', error);
      showErrorToast('Error', 'Failed to record withdrawal');
    }
  };

  const getMonthName = (monthStr: string) => {
    const date = new Date(monthStr + '-01');
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getTransactionIcon = (type: string) => {
    return type === 'SHIFT_CLOSING' 
      ? <ArrowUpCircle className="h-5 w-5 text-emerald-600" />
      : <ArrowDownCircle className="h-5 w-5 text-red-600" />;
  };

  const getTransactionBadge = (type: string) => {
    return type === 'SHIFT_CLOSING' 
      ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Cash IN</Badge>
      : <Badge className="bg-red-100 text-red-800 border-red-200">Cash OUT</Badge>;
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="p-8 text-center">
            <Shield className="h-16 w-16 mx-auto mb-4 text-slate-300" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
            <p className="text-slate-600">Cash Management is only available to HQ Admins.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Loading State */}
      {loading && balances.length === 0 && (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
          <div className="animate-spin h-12 w-12 border-4 border-emerald-600 border-t-transparent rounded-full mb-4" />
          <p className="text-slate-600 font-medium">Loading cash data...</p>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 text-white px-4 pt-12 pb-8 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <Wallet className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Cash Management</h1>
            <p className="text-emerald-100 text-sm mt-1">Track cash flow per branch</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { fetchBalances(); fetchTransactions(); }}
            className="text-white hover:bg-white/10"
            disabled={loading}
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Grand Total Card */}
        <Card className="bg-white/10 backdrop-blur-sm border-white/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Total Cash in Safe
                </p>
                <p className="text-4xl font-bold mt-2">{formatCurrency(grandTotal)}</p>
                <p className="text-emerald-100 text-xs mt-1">Across all branches</p>
              </div>
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                <Wallet className="w-8 h-8 text-emerald-200" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="bg-white">
        <TabsList className="w-full grid grid-cols-2 p-0 h-14 border-b">
          <TabsTrigger
            value="overview"
            className="h-full rounded-none data-[state=active]:border-b-2 data-[state=active]:border-emerald-600"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="transactions"
            className="h-full rounded-none data-[state=active]:border-b-2 data-[state=active]:border-emerald-600"
          >
            Transactions
          </TabsTrigger>
        </TabsList>

        {/* Empty State */}
        {!loading && balances.length === 0 && (
          <div className="p-8 text-center">
            <Wallet className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Branches Found</h3>
            <p className="text-slate-600 text-sm">No branches are available. Please create branches first.</p>
          </div>
        )}

        {/* Overview Tab */}
        <TabsContent value="overview" className="m-0">
          {balances.length > 0 && (
            <div className="p-4 space-y-4">
            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => setDepositDialogOpen(true)}
                className="h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg flex flex-col items-center justify-center gap-2"
              >
                <ArrowUpCircle className="w-8 h-8" />
                <span className="font-semibold">Cash IN</span>
              </Button>
              <Button
                onClick={() => setWithdrawDialogOpen(true)}
                className="h-20 bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg flex flex-col items-center justify-center gap-2"
              >
                <ArrowDownCircle className="w-8 h-8" />
                <span className="font-semibold">Cash OUT</span>
              </Button>
            </div>

            {/* Branch Balances */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Building className="w-5 h-5 text-slate-600" />
                Branch Balances
              </h3>
              <div className="space-y-3">
                {balances.map((balance) => (
                  <Card 
                    key={balance.branchId} 
                    className={`overflow-hidden ${!balance.isActive ? 'opacity-60 bg-slate-50' : ''}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${balance.isActive ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                            <Building className={`w-5 h-5 ${balance.isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900">{balance.branchName}</h4>
                            {!balance.isActive && (
                              <Badge variant="secondary" className="text-xs">Inactive</Badge>
                            )}
                          </div>
                        </div>
                        <div className={`text-xl font-bold ${balance.isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                          {formatCurrency(balance.currentBalance)}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-emerald-50 rounded-lg p-3">
                          <p className="text-xs text-emerald-600 font-medium mb-1 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Cash IN
                          </p>
                          <p className="text-lg font-bold text-emerald-700">{formatCurrency(balance.totalIn)}</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3">
                          <p className="text-xs text-red-600 font-medium mb-1 flex items-center gap-1">
                            <TrendingDown className="w-3 h-3" />
                            Cash OUT
                          </p>
                          <p className="text-lg font-bold text-red-700">{formatCurrency(balance.totalOut)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          </div>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="m-0">
          {balances.length > 0 && (
            <div className="p-4 space-y-4">
            {/* Filters */}
            <Card className="bg-slate-50 border-slate-200">
              <CardContent className="p-4 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-600">Month</Label>
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-600">Branch</Label>
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="All branches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {balances.map((balance) => (
                        <SelectItem key={balance.branchId} value={balance.branchId}>
                          {balance.branchName}
                          {!balance.isActive && (
                            <span className="text-xs text-slate-400 ml-2">(Inactive)</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Transaction Summary */}
            <Card className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-emerald-700 font-medium">Transactions for</p>
                    <p className="text-lg font-bold text-emerald-900">{getMonthName(selectedMonth)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-emerald-700">Total</p>
                    <p className="text-2xl font-bold text-emerald-900">{transactions.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Transactions List */}
            <ScrollArea className="h-[calc(100vh-450px)]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <div className="animate-spin h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full mb-3" />
                  <p>Loading...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Wallet className="w-16 h-16 mb-4 text-slate-300" />
                  <p className="font-medium">No transactions found</p>
                  <p className="text-sm mt-1">Try selecting a different month or branch</p>
                </div>
              ) : (
                <div className="space-y-3 pb-4">
                  {transactions.map((transaction) => (
                    <Card key={transaction.id} className="overflow-hidden hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            transaction.type === 'SHIFT_CLOSING' ? 'bg-emerald-100' : 'bg-red-100'
                          }`}>
                            {getTransactionIcon(transaction.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <h4 className="font-semibold text-slate-900 truncate">{transaction.branch.branchName}</h4>
                              {getTransactionBadge(transaction.type)}
                            </div>
                            <p className="text-sm text-slate-600 line-clamp-1">
                              {transaction.description || (
                                transaction.type === 'SHIFT_CLOSING'
                                  ? transaction.shift 
                                    ? `Shift Closing - ${transaction.shift.cashier.name || transaction.shift.cashier.username}`
                                    : 'Manual Deposit'
                                  : 'Withdrawal'
                              )}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              {new Date(transaction.createdAt).toLocaleString('en-EG')}
                            </p>
                            <p className="text-xs text-slate-500">
                              By: {transaction.creator.name || transaction.creator.username}
                            </p>
                          </div>
                          <div className="flex flex-col items-end">
                            <div className={`text-xl font-bold ${
                              transaction.type === 'SHIFT_CLOSING' ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                              {transaction.type === 'SHIFT_CLOSING' ? '+' : '-'}
                              {formatCurrency(transaction.amount)}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Cash IN Dialog */}
      <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <ArrowUpCircle className="w-5 h-5 text-emerald-600" />
              </div>
              Cash IN
            </DialogTitle>
            <DialogDescription>
              Record manual cash deposit into the safe (e.g., from bank/card orders)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="deposit-branch">Branch *</Label>
              <Select 
                value={depositData.branchId} 
                onValueChange={(value) => setDepositData({ ...depositData, branchId: value })}
              >
                <SelectTrigger id="deposit-branch">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {balances.map((balance) => (
                    <SelectItem key={balance.branchId} value={balance.branchId}>
                      {balance.branchName}
                      {!balance.isActive && (
                        <span className="text-xs text-slate-400 ml-2">(Inactive)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deposit-amount">Amount (EGP) *</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="deposit-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={depositData.amount}
                  onChange={(e) => setDepositData({ ...depositData, amount: e.target.value })}
                  placeholder="0.00"
                  className="pl-10 h-11 text-lg font-semibold"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deposit-description">Description</Label>
              <Textarea
                id="deposit-description"
                value={depositData.description}
                onChange={(e) => setDepositData({ ...depositData, description: e.target.value })}
                placeholder="e.g., Cash from bank, card orders converted to cash..."
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 flex items-start gap-2">
              <Info className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700">
                This will add cash to the safe for the selected branch. The balance will be updated immediately.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setDepositDialogOpen(false)}
              className="w-full sm:w-auto h-11"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleDeposit}
              disabled={!depositData.branchId || !depositData.amount}
              className="w-full sm:w-auto h-11 bg-emerald-600 hover:bg-emerald-700"
            >
              Record Cash IN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash OUT Dialog */}
      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <ArrowDownCircle className="w-5 h-5 text-red-600" />
              </div>
              Cash OUT
            </DialogTitle>
            <DialogDescription>
              Record a cash withdrawal from the safe
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="withdraw-branch">Branch *</Label>
              <Select 
                value={withdrawData.branchId} 
                onValueChange={(value) => setWithdrawData({ ...withdrawData, branchId: value })}
              >
                <SelectTrigger id="withdraw-branch">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {balances.map((balance) => (
                    <SelectItem key={balance.branchId} value={balance.branchId}>
                      <div className="flex items-center justify-between w-full pr-4">
                        <span>{balance.branchName}</span>
                        <span className="text-sm text-slate-500">
                          {formatCurrency(balance.currentBalance)} available
                        </span>
                      </div>
                      {!balance.isActive && (
                        <span className="text-xs text-slate-400 ml-2">(Inactive)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdraw-amount">Amount (EGP) *</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="withdraw-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={withdrawData.amount}
                  onChange={(e) => setWithdrawData({ ...withdrawData, amount: e.target.value })}
                  placeholder="0.00"
                  className="pl-10 h-11 text-lg font-semibold"
                />
              </div>
              {withdrawData.branchId && withdrawData.amount && (
                <div className="flex items-center gap-2 mt-2">
                  {parseFloat(withdrawData.amount) > (balances.find(b => b.branchId === withdrawData.branchId)?.currentBalance || 0) ? (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Insufficient funds
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Sufficient funds
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdraw-description">Description</Label>
              <Textarea
                id="withdraw-description"
                value={withdrawData.description}
                onChange={(e) => setWithdrawData({ ...withdrawData, description: e.target.value })}
                placeholder="e.g., Purchased supplies, paid utility bill..."
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="bg-red-50 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                This will deduct cash from the safe. Make sure you have sufficient funds before proceeding.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setWithdrawDialogOpen(false)}
              className="w-full sm:w-auto h-11"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleWithdraw}
              disabled={
                !withdrawData.branchId || 
                !withdrawData.amount || 
                parseFloat(withdrawData.amount) > (balances.find(b => b.branchId === withdrawData.branchId)?.currentBalance || 0)
              }
              className="w-full sm:w-auto h-11 bg-red-600 hover:bg-red-700"
            >
              Record Cash OUT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
