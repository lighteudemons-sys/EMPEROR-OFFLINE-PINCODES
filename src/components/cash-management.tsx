'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DollarSign, TrendingUp, ArrowDown, Calendar, Building, Plus, Wallet,
  ArrowUpCircle, ArrowDownCircle, Pencil, Trash2, Loader2,
} from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function getTodayStr(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function getFirstOfCurrentMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
}
function getFirstOfLastMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()).padStart(2, '0')}-01`;
}
function getLastOfLastMonth(): string {
  const n = new Date();
  const y = n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear();
  const m = n.getMonth() === 0 ? 12 : n.getMonth();
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CashTransaction {
  id: string;
  branchId: string;
  type: 'SHIFT_CLOSING' | 'WITHDRAWAL';
  amount: number;
  description: string | null;
  shiftId: string | null;
  createdAt: string;
  transactionDate?: string | null;
  branch: { id: string; branchName: string };
  creator: { id: string; username: string; name: string | null };
  shift?: {
    id: string;
    startTime: string;
    endTime: string | null;
    cashier: { id: string; username: string; name: string | null };
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CashManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  // Data state
  const [balances, setBalances] = useState<CashBalance[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [isFiltered, setIsFiltered] = useState(false);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);

  // Filter state
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>(getFirstOfCurrentMonth());
  const [dateTo, setDateTo] = useState<string>(getTodayStr());

  // Withdraw dialog
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDescription, setWithdrawDescription] = useState('');
  const [selectedBranchForWithdraw, setSelectedBranchForWithdraw] = useState<string>('');
  const [withdrawDate, setWithdrawDate] = useState<string>(getTodayStr());
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // Deposit dialog
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDescription, setDepositDescription] = useState('');
  const [selectedBranchForDeposit, setSelectedBranchForDeposit] = useState<string>('');
  const [depositDate, setDepositDate] = useState<string>(getTodayStr());
  const [depositLoading, setDepositLoading] = useState(false);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<CashTransaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState<CashTransaction | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // General loading
  const [loading, setLoading] = useState(false);

  // -----------------------------------------------------------------------
  // Quick filters
  // -----------------------------------------------------------------------
  const handleThisMonth = () => { setDateFrom(getFirstOfCurrentMonth()); setDateTo(getTodayStr()); };
  const handleLastMonth = () => { setDateFrom(getFirstOfLastMonth()); setDateTo(getLastOfLastMonth()); };
  const handleAllTime = () => { setDateFrom(''); setDateTo(''); };

  // -----------------------------------------------------------------------
  // Period label for the balance card
  // -----------------------------------------------------------------------
  const getPeriodLabel = () => {
    if (!dateFrom && !dateTo) return 'All Time';
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
      if (sameMonth) return from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return `${from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (dateFrom) return `From ${new Date(dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    return `Until ${new Date(dateTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------
  const fetchBalances = async (dFrom?: string, dTo?: string) => {
    try {
      const params = new URLSearchParams();
      const from = dFrom ?? dateFrom;
      const to = dTo ?? dateTo;
      if (from) params.append('startDate', from);
      if (to) params.append('endDate', to);

      const response = await fetch(`/api/cash-management/balance?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setBalances(data.balances);
        setGrandTotal(data.grandTotal);
        setIsFiltered(!!data.filtered);
      }
    } catch (error) {
      console.error('Failed to fetch balances:', error);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranch && selectedBranch !== 'all') params.append('branchId', selectedBranch);
      if (dateFrom) params.append('startDate', dateFrom);
      if (dateTo) params.append('endDate', dateTo);

      const response = await fetch(`/api/cash-management/transactions?${params.toString()}&limit=100`);
      const data = await response.json();
      if (data.success) setTransactions(data.transactions);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch balances & transactions whenever filters change
  useEffect(() => {
    fetchBalances();
    fetchTransactions();
  }, [selectedBranch, dateFrom, dateTo]);

  // -----------------------------------------------------------------------
  // Deposit
  // -----------------------------------------------------------------------
  const handleDeposit = async () => {
    if (!depositAmount || !selectedBranchForDeposit || !depositDate) {
      showErrorToast('Error', 'Please fill in all required fields');
      return;
    }
    const amount = parseFloat(depositAmount);
    if (amount <= 0) { showErrorToast('Error', 'Amount must be greater than 0'); return; }

    setDepositLoading(true);
    try {
      const res = await fetch('/api/cash-management/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: selectedBranchForDeposit,
          amount,
          description: depositDescription || 'Manual cash deposit',
          createdBy: user?.id,
          transactionDate: depositDate,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showSuccessToast('Success', 'Deposit recorded successfully');
        setDepositDialogOpen(false);
        setDepositAmount(''); setDepositDescription(''); setSelectedBranchForDeposit('');
        setDepositDate(getTodayStr());
        fetchBalances(); fetchTransactions();
      } else {
        showErrorToast('Error', data.error || 'Failed to record deposit');
      }
    } catch { showErrorToast('Error', 'Failed to record deposit'); }
    finally { setDepositLoading(false); }
  };

  // -----------------------------------------------------------------------
  // Withdraw
  // -----------------------------------------------------------------------
  const handleWithdraw = async () => {
    if (!withdrawAmount || !selectedBranchForWithdraw || !withdrawDate) {
      showErrorToast('Error', 'Please fill in all required fields');
      return;
    }
    const amount = parseFloat(withdrawAmount);
    if (amount <= 0) { showErrorToast('Error', 'Amount must be greater than 0'); return; }

    setWithdrawLoading(true);
    try {
      const res = await fetch('/api/cash-management/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: selectedBranchForWithdraw,
          amount,
          description: withdrawDescription || 'Manual withdrawal',
          createdBy: user?.id,
          transactionDate: withdrawDate,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showSuccessToast('Success', 'Withdrawal recorded successfully');
        setWithdrawDialogOpen(false);
        setWithdrawAmount(''); setWithdrawDescription(''); setSelectedBranchForWithdraw('');
        setWithdrawDate(getTodayStr());
        fetchBalances(); fetchTransactions();
      } else {
        showErrorToast('Error', data.error || 'Failed to record withdrawal');
      }
    } catch { showErrorToast('Error', 'Failed to record withdrawal'); }
    finally { setWithdrawLoading(false); }
  };

  // -----------------------------------------------------------------------
  // Edit
  // -----------------------------------------------------------------------
  const openEditDialog = (tx: CashTransaction) => {
    setEditingTransaction(tx);
    setEditAmount(String(tx.amount));
    setEditDescription(tx.description || '');
    setEditDate(
      tx.transactionDate
        ? tx.transactionDate.substring(0, 10)
        : tx.createdAt.substring(0, 10)
    );
    setEditDialogOpen(true);
  };

  const handleEdit = async () => {
    if (!editingTransaction) return;
    const amount = parseFloat(editAmount);
    if (!amount || amount <= 0) { showErrorToast('Error', 'Amount must be greater than 0'); return; }

    setEditLoading(true);
    try {
      const res = await fetch(`/api/cash-management/transactions/${editingTransaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          description: editDescription || null,
          transactionDate: editDate || null,
          updatedBy: user?.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showSuccessToast('Updated', 'Transaction updated successfully');
        setEditDialogOpen(false);
        setEditingTransaction(null);
        fetchBalances(); fetchTransactions();
      } else {
        showErrorToast('Error', data.error || 'Failed to update transaction');
      }
    } catch { showErrorToast('Error', 'Failed to update transaction'); }
    finally { setEditLoading(false); }
  };

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------
  const openDeleteDialog = (tx: CashTransaction) => {
    setDeletingTransaction(tx);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingTransaction) return;

    setDeleteLoading(true);
    try {
      const res = await fetch(
        `/api/cash-management/transactions/${deletingTransaction.id}?deletedBy=${user?.id || ''}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (data.success) {
        showSuccessToast('Deleted', 'Transaction deleted successfully');
        setDeleteDialogOpen(false);
        setDeletingTransaction(null);
        fetchBalances(); fetchTransactions();
      } else {
        showErrorToast('Error', data.error || 'Failed to delete transaction');
      }
    } catch { showErrorToast('Error', 'Failed to delete transaction'); }
    finally { setDeleteLoading(false); }
  };

  // -----------------------------------------------------------------------
  // Currency formatter
  // -----------------------------------------------------------------------
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(amount);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------
  const isManual = (tx: CashTransaction) => !tx.shiftId;

  const formatDate = (tx: CashTransaction) =>
    new Date(tx.transactionDate || tx.createdAt).toLocaleString('en-EG', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------
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

      {/* ─── Balance Cards ─── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Grand Total */}
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {isFiltered ? 'Cash in Safe (Filtered)' : 'Total Cash in Safe'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{formatCurrency(grandTotal)}</div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="bg-white/20 text-white border-0 text-xs">
                {getPeriodLabel()}
              </Badge>
              {isFiltered && (
                <button
                  onClick={handleAllTime}
                  className="text-emerald-100 hover:text-white text-xs underline underline-offset-2 transition-colors"
                >
                  View all time
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Per-branch cards */}
        {balances.map((balance) => (
          <Card key={balance.branchId} className={`hover:shadow-lg transition-shadow ${!balance.isActive ? 'opacity-60 bg-slate-50' : ''}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Building className={`h-5 w-5 ${balance.isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                {balance.branchName}
                {!balance.isActive && <Badge variant="secondary" className="text-xs ml-2">Inactive</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${balance.isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                {formatCurrency(balance.currentBalance)}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <div className={`flex justify-between ${balance.isActive ? 'text-slate-600' : 'text-slate-400'}`}>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-emerald-600" /> Cash In:
                  </span>
                  <span className="font-semibold text-emerald-600">{formatCurrency(balance.totalIn)}</span>
                </div>
                <div className={`flex justify-between ${balance.isActive ? 'text-slate-600' : 'text-slate-400'}`}>
                  <span className="flex items-center gap-1">
                    <ArrowDown className="h-4 w-4 text-red-600" /> Cash Out:
                  </span>
                  <span className="font-semibold text-red-600">{formatCurrency(balance.totalOut)}</span>
                </div>
                <div className="text-xs text-slate-400 pt-1">
                  {balance.transactionCount} transaction{balance.transactionCount !== 1 ? 's' : ''} in range
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Transactions Section ─── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>View cash transactions by branch and date range</CardDescription>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                {/* Cash IN */}
                <Dialog open={depositDialogOpen} onOpenChange={(open) => {
                  if (!open) setDepositDate(getTodayStr());
                  setDepositDialogOpen(open);
                }}>
                  <DialogTrigger asChild>
                    <Button className="bg-emerald-600 hover:bg-emerald-700">
                      <ArrowUpCircle className="h-4 w-4 mr-2" /> Cash IN
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Record Cash IN</DialogTitle>
                      <DialogDescription>Record manual cash deposit into the safe</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Branch *</Label>
                        <Select value={selectedBranchForDeposit} onValueChange={setSelectedBranchForDeposit}>
                          <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                          <SelectContent>
                            {balances.map((b) => (
                              <SelectItem key={b.branchId} value={b.branchId}>
                                {b.branchName} {!b.isActive && <span className="text-xs text-slate-400 ml-2">(Inactive)</span>}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="flex items-center gap-1"><Calendar className="h-4 w-4" /> Transaction Date *</Label>
                        <Input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} className="mt-1" />
                      </div>
                      <div>
                        <Label>Amount (EGP) *</Label>
                        <Input type="number" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.00" />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea value={depositDescription} onChange={(e) => setDepositDescription(e.target.value)} placeholder="e.g., Cash from bank, card orders..." rows={3} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDepositDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleDeposit} disabled={depositLoading} className="bg-emerald-600 hover:bg-emerald-700">
                        {depositLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Record Cash IN
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Cash OUT */}
                <Dialog open={withdrawDialogOpen} onOpenChange={(open) => {
                  if (!open) setWithdrawDate(getTodayStr());
                  setWithdrawDialogOpen(open);
                }}>
                  <DialogTrigger asChild>
                    <Button className="bg-red-600 hover:bg-red-700">
                      <ArrowDownCircle className="h-4 w-4 mr-2" /> Cash OUT
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Record Cash OUT</DialogTitle>
                      <DialogDescription>Record a cash withdrawal from the safe</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Branch *</Label>
                        <Select value={selectedBranchForWithdraw} onValueChange={setSelectedBranchForWithdraw}>
                          <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                          <SelectContent>
                            {balances.map((b) => (
                              <SelectItem key={b.branchId} value={b.branchId}>
                                {b.branchName} ({formatCurrency(b.currentBalance)} available)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="flex items-center gap-1"><Calendar className="h-4 w-4" /> Transaction Date *</Label>
                        <Input type="date" value={withdrawDate} onChange={(e) => setWithdrawDate(e.target.value)} className="mt-1" />
                      </div>
                      <div>
                        <Label>Amount (EGP) *</Label>
                        <Input type="number" step="0.01" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.00" />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea value={withdrawDescription} onChange={(e) => setWithdrawDescription(e.target.value)} placeholder="e.g., Purchased supplies, paid utility bill..." rows={3} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setWithdrawDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleWithdraw} disabled={withdrawLoading} className="bg-red-600 hover:bg-red-700">
                        {withdrawLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Record Cash OUT
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>

          {/* ─── Filters ─── */}
          <div className="flex items-end gap-3 mt-4">
            <div className="flex-1">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger><SelectValue placeholder="All Branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {balances.map((b) => (
                    <SelectItem key={b.branchId} value={b.branchId}>
                      {b.branchName} {!b.isActive && <span className="text-xs text-slate-400 ml-2">(Inactive)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs text-slate-500 mb-1 block">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-slate-500 mb-1 block">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={handleThisMonth}>This Month</Button>
            <Button variant="outline" size="sm" onClick={handleLastMonth}>Last Month</Button>
            <Button variant="outline" size="sm" onClick={handleAllTime}>All Time</Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p>No transactions found for this period</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors group"
                >
                  {/* Left */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        className={
                          tx.type === 'SHIFT_CLOSING'
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            : 'bg-red-100 text-red-700 border-red-200'
                        }
                      >
                        {tx.type === 'SHIFT_CLOSING' ? (
                          <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Cash In</span>
                        ) : (
                          <span className="flex items-center gap-1"><ArrowDown className="h-3 w-3" /> Cash Out</span>
                        )}
                      </Badge>
                      <span className="text-sm text-slate-600">{tx.branch.branchName}</span>
                      {tx.shiftId && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400">Auto</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-900 mt-1 truncate">
                      {tx.description || (tx.type === 'SHIFT_CLOSING'
                        ? (tx.shift ? 'Shift Closing' : 'Manual Deposit')
                        : 'Withdrawal')}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {formatDate(tx)}
                      {tx.shift && (
                        <span className="ml-2">• Shift by {tx.shift.cashier.name || tx.shift.cashier.username}</span>
                      )}
                    </p>
                  </div>

                  {/* Right: amount + actions */}
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <div className="text-right">
                      <div className={`text-lg font-bold ${tx.type === 'SHIFT_CLOSING' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {tx.type === 'SHIFT_CLOSING' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </div>
                      <p className="text-xs text-slate-500">By {tx.creator.name || tx.creator.username}</p>
                    </div>

                    {/* Edit / Delete buttons — only for manual entries & admins */}
                    {isAdmin && isManual(tx) && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                          onClick={() => openEditDialog(tx)}
                          title="Edit transaction"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => openDeleteDialog(tx)}
                          title="Delete transaction"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        if (!open) { setEditingTransaction(null); setEditLoading(false); }
        setEditDialogOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              Modify amount, description, or date for this manual transaction.
            </DialogDescription>
          </DialogHeader>
          {editingTransaction && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Badge className={
                  editingTransaction.type === 'SHIFT_CLOSING'
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-red-100 text-red-700 border-red-200'
                }>
                  {editingTransaction.type === 'SHIFT_CLOSING' ? 'Cash In' : 'Cash Out'}
                </Badge>
                <span className="text-sm text-slate-600">{editingTransaction.branch.branchName}</span>
              </div>
              <div>
                <Label>Amount (EGP) *</Label>
                <Input
                  type="number" step="0.01" value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)} placeholder="0.00"
                />
              </div>
              <div>
                <Label className="flex items-center gap-1"><Calendar className="h-4 w-4" /> Transaction Date</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Transaction description..." rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editLoading}>
              {editLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!open) { setDeletingTransaction(null); setDeleteLoading(false); }
        setDeleteDialogOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingTransaction && (
                <span>
                  Are you sure you want to delete this{' '}
                  <strong>
                    {deletingTransaction.type === 'SHIFT_CLOSING' ? 'Cash In' : 'Cash Out'}{' '}
                    of {formatCurrency(deletingTransaction.amount)}
                  </strong>{' '}
                  from <strong>{deletingTransaction.branch.branchName}</strong>?
                  <br />
                  <span className="text-slate-500 text-xs mt-1 block">
                    {deletingTransaction.description || (deletingTransaction.type === 'SHIFT_CLOSING' ? 'Manual Deposit' : 'Withdrawal')} • {formatDate(deletingTransaction)}
                  </span>
                </span>
              )}
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}