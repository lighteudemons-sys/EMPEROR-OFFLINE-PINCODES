'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DollarSign, TrendingUp, ArrowDown, Calendar, Building, Plus, Wallet, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';

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

interface CashBalance {
  branchId: string;
  branchName: string;
  isActive: boolean;
  totalIn: number;
  totalOut: number;
  currentBalance: number;
  transactionCount: number;
}

export default function CashManagement() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<CashBalance[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDescription, setWithdrawDescription] = useState('');
  const [selectedBranchForWithdraw, setSelectedBranchForWithdraw] = useState<string>('');
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDescription, setDepositDescription] = useState('');
  const [selectedBranchForDeposit, setSelectedBranchForDeposit] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Fetch balances
  const fetchBalances = async () => {
    try {
      const response = await fetch('/api/cash-management/balance');
      const data = await response.json();
      if (data.success) {
        setBalances(data.balances);
        setGrandTotal(data.grandTotal);
      }
    } catch (error) {
      console.error('Failed to fetch balances:', error);
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
    fetchTransactions();
  }, [selectedBranch, selectedMonth]);

  // Handle withdrawal
  const handleWithdraw = async () => {
    if (!withdrawAmount || !selectedBranchForWithdraw) {
      showErrorToast('Error', 'Please fill in all required fields');
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (amount <= 0) {
      showErrorToast('Error', 'Amount must be greater than 0');
      return;
    }

    try {
      const response = await fetch('/api/cash-management/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: selectedBranchForWithdraw,
          amount,
          description: withdrawDescription || 'Manual withdrawal',
          createdBy: user?.id,
        }),
      });

      const data = await response.json();
      if (data.success) {
        showSuccessToast('Success', 'Withdrawal recorded successfully');
        setWithdrawDialogOpen(false);
        setWithdrawAmount('');
        setWithdrawDescription('');
        setSelectedBranchForWithdraw('');
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

  // Handle deposit
  const handleDeposit = async () => {
    if (!depositAmount || !selectedBranchForDeposit) {
      showErrorToast('Error', 'Please fill in all required fields');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (amount <= 0) {
      showErrorToast('Error', 'Amount must be greater than 0');
      return;
    }

    try {
      const response = await fetch('/api/cash-management/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: selectedBranchForDeposit,
          amount,
          description: depositDescription || 'Manual cash deposit',
          createdBy: user?.id,
        }),
      });

      const data = await response.json();
      if (data.success) {
        showSuccessToast('Success', 'Deposit recorded successfully');
        setDepositDialogOpen(false);
        setDepositAmount('');
        setDepositDescription('');
        setSelectedBranchForDeposit('');
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

  // Get month name
  const getMonthName = (monthStr: string) => {
    const date = new Date(monthStr + '-01');
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency: 'EGP',
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Wallet className="h-8 w-8 text-emerald-600" />
          Cash Management
        </h1>
        <p className="text-slate-600 mt-2">Track cash flow from shift closings and withdrawals per branch</p>
      </div>

      {/* Balance Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Grand Total Card */}
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Total Cash in Safe
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{formatCurrency(grandTotal)}</div>
            <p className="text-emerald-100 text-sm mt-2">Across all branches</p>
          </CardContent>
        </Card>

        {/* Branch Balances */}
        {balances.map((balance) => (
          <Card key={balance.branchId} className={`hover:shadow-lg transition-shadow ${!balance.isActive ? 'opacity-60 bg-slate-50' : ''}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Building className={`h-5 w-5 ${balance.isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                {balance.branchName}
                {!balance.isActive && (
                  <Badge variant="secondary" className="text-xs ml-2">Inactive</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${balance.isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                {formatCurrency(balance.currentBalance)}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <div className={`flex justify-between ${balance.isActive ? 'text-slate-600' : 'text-slate-400'}`}>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    Cash In:
                  </span>
                  <span className="font-semibold text-emerald-600">{formatCurrency(balance.totalIn)}</span>
                </div>
                <div className={`flex justify-between ${balance.isActive ? 'text-slate-600' : 'text-slate-400'}`}>
                  <span className="flex items-center gap-1">
                    <ArrowDown className="h-4 w-4 text-red-600" />
                    Cash Out:
                  </span>
                  <span className="font-semibold text-red-600">{formatCurrency(balance.totalOut)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transactions Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>View cash transactions by branch and month</CardDescription>
            </div>
            <div className="flex gap-2">
              {/* Cash IN Button */}
              <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700">
                    <ArrowUpCircle className="h-4 w-4 mr-2" />
                    Cash IN
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record Cash IN</DialogTitle>
                    <DialogDescription>Record manual cash deposit into the safe (e.g., from bank/card orders)</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="deposit-branch">Branch *</Label>
                      <Select value={selectedBranchForDeposit} onValueChange={setSelectedBranchForDeposit}>
                        <SelectTrigger>
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
                    <div>
                      <Label htmlFor="deposit-amount">Amount (EGP) *</Label>
                      <Input
                        id="deposit-amount"
                        type="number"
                        step="0.01"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="deposit-description">Description</Label>
                      <Textarea
                        id="deposit-description"
                        value={depositDescription}
                        onChange={(e) => setDepositDescription(e.target.value)}
                        placeholder="e.g., Cash from bank, card orders converted to cash..."
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDepositDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleDeposit} className="bg-emerald-600 hover:bg-emerald-700">
                      Record Cash IN
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Cash OUT Button */}
              <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-red-600 hover:bg-red-700">
                    <ArrowDownCircle className="h-4 w-4 mr-2" />
                    Cash OUT
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record Cash OUT</DialogTitle>
                    <DialogDescription>Record a cash withdrawal from the safe</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="branch">Branch *</Label>
                      <Select value={selectedBranchForWithdraw} onValueChange={setSelectedBranchForWithdraw}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {balances.map((balance) => (
                            <SelectItem key={balance.branchId} value={balance.branchId}>
                              {balance.branchName} ({formatCurrency(balance.currentBalance)} available)
                              {!balance.isActive && (
                                <span className="text-xs text-slate-400 ml-2">(Inactive)</span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="amount">Amount (EGP) *</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={withdrawDescription}
                        onChange={(e) => setWithdrawDescription(e.target.value)}
                        placeholder="e.g., Purchased supplies, paid utility bill..."
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setWithdrawDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleWithdraw} className="bg-red-600 hover:bg-red-700">
                      Record Cash OUT
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <div className="flex-1">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger>
                  <SelectValue placeholder="All Branches" />
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
            <div className="flex-1">
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>No transactions found for this period</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          transaction.type === 'SHIFT_CLOSING'
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            : 'bg-red-100 text-red-700 border-red-200'
                        }
                      >
                        {transaction.type === 'SHIFT_CLOSING' ? (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            Cash In
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <ArrowDown className="h-3 w-3" />
                            Cash Out
                          </span>
                        )}
                      </Badge>
                      <span className="text-sm text-slate-600">{transaction.branch.branchName}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-900 mt-1">
                      {transaction.description || (
                        transaction.type === 'SHIFT_CLOSING'
                          ? (transaction.shift ? 'Shift Closing' : 'Manual Deposit')
                          : 'Withdrawal'
                      )}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(transaction.createdAt).toLocaleString('en-EG')}
                      {transaction.shift && (
                        <span className="ml-2">
                          • Shift by {transaction.shift.cashier.name || transaction.shift.cashier.username}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <div
                      className={`text-lg font-bold ${
                        transaction.type === 'SHIFT_CLOSING' ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {transaction.type === 'SHIFT_CLOSING' ? '+' : '-'}
                      {formatCurrency(transaction.amount)}
                    </div>
                    <p className="text-xs text-slate-500">
                      By {transaction.creator.name || transaction.creator.username}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
