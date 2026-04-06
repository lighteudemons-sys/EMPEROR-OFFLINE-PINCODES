'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DollarSign,
  TrendingUp,
  Clock,
  AlertTriangle,
  Plus,
  X,
  ChevronRight,
  RefreshCw,
  CheckCircle,
  Printer,
  Edit3,
  Trash2,
  Calendar,
  ShoppingCart,
  Package,
  Building2,
  Wrench,
  MoreHorizontal,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/utils';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/hooks/use-toast';

interface Shift {
  id: string;
  status: 'open' | 'closed';
  startedAt: string;
  endedAt?: string;
  currentRevenue: number;
  orderCount: number;
  cashierName: string;
  branchName: string;
}

interface Expense {
  id: string;
  amount: number;
  reason: string;
  category: string;
  createdAt: string;
  recordedBy: string;
  ingredientId?: string;
  quantity?: number;
  unitPrice?: number;
}

export function MobileMoney() {
  const { user } = useAuth();
  const { currency, t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'shift' | 'expenses'>('shift');
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [todayExpenses, setTodayExpenses] = useState<Expense[]>([]);
  const [previousShifts, setPreviousShifts] = useState<Shift[]>([]);
  const [shiftDetailOpen, setShiftDetailOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [shiftOrders, setShiftOrders] = useState<any[]>([]);
  const [shiftExpenses, setShiftExpenses] = useState<Expense[]>([]);

  // Add Expense Dialog
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseReason, setExpenseReason] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('OTHER');
  const [submittingExpense, setSubmittingExpense] = useState(false);
  
  // Expense categories matching desktop POS
  const [expenseCategories, setExpenseCategories] = useState<any[]>([
    { value: 'INVENTORY', label: 'Inventory', icon: Package },
    { value: 'EQUIPMENT', label: 'Equipment', icon: Wrench },
    { value: 'REPAIRS', label: 'Repairs', icon: Wrench },
    { value: 'UTILITIES', label: 'Utilities', icon: Building2 },
    { value: 'RENT', label: 'Rent', icon: Building2 },
    { value: 'MARKETING', label: 'Marketing', icon: Tag },
    { value: 'SALARIES', label: 'Salaries', icon: DollarSign },
    { value: 'TRANSPORTATION', label: 'Transportation', icon: MoreHorizontal },
    { value: 'SUPPLIES', label: 'Supplies', icon: Package },
    { value: 'MAINTENANCE', label: 'Maintenance', icon: Wrench },
    { value: 'INSURANCE', label: 'Insurance', icon: Shield },
    { value: 'TAXES', label: 'Taxes', icon: FileText },
    { value: 'OTHER', label: 'Other', icon: DollarSign },
  ]);

  // Set default category on mount
  useEffect(() => {
    setExpenseCategory('OTHER');
  }, []);

  // Listen for add expense event from Dashboard
  useEffect(() => {
    const handleAddExpenseEvent = () => {
      setAddExpenseOpen(true);
    };

    window.addEventListener('add-expense', handleAddExpenseEvent);

    return () => {
      window.removeEventListener('add-expense', handleAddExpenseEvent);
    };
  }, []);

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);

      const storage = getIndexedDBStorage();
      await storage.init();

      // Get current shift
      const allShifts = await storage.getAllShifts();
      const openShift = allShifts.find((s: any) =>
        s.cashierId === user?.id &&
        s.branchId === user?.branchId &&
        !s.isClosed
      );

      if (openShift) {
        setCurrentShift({
          id: openShift.id,
          status: 'open',
          startedAt: openShift.startedAt,
          currentRevenue: openShift.currentRevenue || 0,
          orderCount: openShift.orderCount || 0,
          cashierName: user?.name || user?.username || 'Unknown',
          branchName: 'Current Branch',
        });
      } else {
        setCurrentShift(null);
      }

      // Get today's expenses
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));

      const allExpenses = await storage.getAll('daily_expenses');
      const todayExps = allExpenses
        .filter((exp: any) => {
          const expDate = new Date(exp.createdAt);
          return expDate >= startOfDay && expDate <= endOfDay;
        })
        .map((exp: any) => ({
          id: exp.id,
          amount: exp.amount,
          reason: exp.reason,
          category: exp.category || 'OTHER',
          createdAt: exp.createdAt,
          recordedBy: exp.recordedBy,
          ingredientId: exp.ingredientId,
          quantity: exp.quantity,
          unitPrice: exp.unitPrice,
        }))
        .sort((a: Expense, b: Expense) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      setTodayExpenses(todayExps);

      // Get previous shifts
      const closedShifts = allShifts
        .filter((s: any) => s.isClosed && s.cashierId === user?.id)
        .sort((a: any, b: any) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        )
        .slice(0, 5)
        .map((s: any) => ({
          id: s.id,
          status: 'closed' as const,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          currentRevenue: s.finalRevenue || s.currentRevenue || 0,
          orderCount: s.orderCount || 0,
          cashierName: user?.name || user?.username || 'Unknown',
          branchName: 'Current Branch',
        }));

      setPreviousShifts(closedShifts);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching money data:', error);
      showErrorToast('Error', 'Failed to load data');
      setLoading(false);
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user?.id, user?.branchId]);

  const handleRefresh = () => {
    fetchData(true);
  };

  const handleOpenShift = async () => {
    try {
      // Check if user can open shift
      if (!user?.branchId) {
        showErrorToast('Error', 'No branch assigned');
        return;
      }

      // Check for business day
      const storage = getIndexedDBStorage();
      await storage.init();

      const businessDays = await storage.getBusinessDays();
      const openBusinessDay = businessDays.find((bd: any) => bd.branchId === user.branchId && bd.isOpen);

      if (!openBusinessDay) {
        showWarningToast('Business Day Closed', 'Please open the business day first');
        return;
      }

      // Create shift
      const newShift = {
        id: `shift-${Date.now()}`,
        branchId: user.branchId,
        cashierId: user.id,
        startedAt: new Date().toISOString(),
        initialCash: 0,
        currentRevenue: 0,
        orderCount: 0,
        isClosed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await storage.put('shifts', newShift);

      // Queue for sync
      await storage.addOperation({
        type: 'CREATE_SHIFT',
        data: newShift,
        branchId: user.branchId,
      });

      showSuccessToast('Shift Opened', 'Your shift has been opened successfully');
      fetchData(true);
    } catch (error) {
      console.error('Error opening shift:', error);
      showErrorToast('Error', 'Failed to open shift');
    }
  };

  const handleCloseShift = async () => {
    try {
      if (!currentShift) return;

      const storage = getIndexedDBStorage();
      await storage.init();

      // Update shift
      const updatedShift = {
        ...currentShift,
        status: 'closed' as const,
        endedAt: new Date().toISOString(),
        finalRevenue: currentShift.currentRevenue,
        isClosed: true,
        updatedAt: new Date().toISOString(),
      };

      await storage.put('shifts', updatedShift);

      // Queue for sync
      await storage.addOperation({
        type: 'CLOSE_SHIFT',
        data: updatedShift,
        branchId: user?.branchId,
      });

      showSuccessToast('Shift Closed', 'Your shift has been closed successfully');
      fetchData(true);
    } catch (error) {
      console.error('Error closing shift:', error);
      showErrorToast('Error', 'Failed to close shift');
    }
  };

  const handleAddExpense = async () => {
    if (!expenseAmount || !expenseReason) {
      showErrorToast('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setSubmittingExpense(true);

      const storage = getIndexedDBStorage();
      await storage.init();

      const newExpense = {
        id: `expense-${Date.now()}`,
        branchId: user?.branchId,
        shiftId: currentShift?.id || null,
        amount: parseFloat(expenseAmount),
        reason: expenseReason,
        category: expenseCategory,
        recordedBy: user?.id,
        createdAt: new Date().toISOString(),
      };

      await storage.put('daily_expenses', newExpense);

      // Queue for sync
      await storage.addOperation({
        type: 'CREATE_DAILY_EXPENSE',
        data: newExpense,
        branchId: user?.branchId,
      });

      showSuccessToast('Expense Added', 'Expense recorded successfully');
      setAddExpenseOpen(false);
      setExpenseAmount('');
      setExpenseReason('');
      setExpenseCategory('OTHER');
      fetchData(true);
    } catch (error) {
      console.error('Error adding expense:', error);
      showErrorToast('Error', 'Failed to add expense');
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    try {
      const storage = getIndexedDBStorage();
      await storage.init();

      await storage.delete('daily_expenses', expenseId);

      showSuccessToast('Expense Deleted', 'Expense removed successfully');
      fetchData(true);
    } catch (error) {
      console.error('Error deleting expense:', error);
      showErrorToast('Error', 'Failed to delete expense');
    }
  };

  const handleViewShift = async (shift: Shift) => {
    try {
      setSelectedShift(shift);

      const storage = getIndexedDBStorage();
      await storage.init();

      // Get shift orders
      const allOrders = await storage.getAllOrders();
      const shiftOrderList = allOrders.filter((order: any) => order.shiftId === shift.id);
      setShiftOrders(shiftOrderList);

      // Get shift expenses
      const allExpenses = await storage.getAll('daily_expenses');
      const shiftExpenseList = allExpenses.filter((exp: any) => exp.shiftId === shift.id);
      setShiftExpenses(shiftExpenseList);

      setShiftDetailOpen(true);
    } catch (error) {
      console.error('Error loading shift details:', error);
      showErrorToast('Error', 'Failed to load shift details');
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getCategoryIcon = (category: string) => {
    const cat = expenseCategories.find(c => c.value === category);
    if (cat) {
      const Icon = cat.icon;
      return <Icon className="w-4 h-4" />;
    }
    return <DollarSign className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 flex-1" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-12 w-full" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4 sticky top-0 z-40">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-slate-900">Money</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Tab Filter */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('shift')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'shift'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            Shift
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'expenses'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Expenses
          </button>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="p-4 space-y-4">
          {activeTab === 'shift' ? (
            <>
              {/* Current Shift */}
              {currentShift ? (
                <Card className="border-l-4 border-l-emerald-500 shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                        <h3 className="font-semibold text-slate-900">Current Shift</h3>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-800">
                        OPEN
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-slate-500">Started</p>
                        <p className="font-semibold text-slate-900">{formatTime(currentShift.startedAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Duration</p>
                        <p className="font-semibold text-slate-900">
                          {Math.floor((Date.now() - new Date(currentShift.startedAt).getTime()) / (1000 * 60 * 60))}h
                          {Math.floor(((Date.now() - new Date(currentShift.startedAt).getTime()) / (1000 * 60)) % 60)}m
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Revenue</p>
                        <p className="font-semibold text-emerald-600">{formatCurrency(currentShift.currentRevenue)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Orders</p>
                        <p className="font-semibold text-slate-900">{currentShift.orderCount}</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleViewShift(currentShift)}
                      >
                        View Details
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                        onClick={handleCloseShift}
                      >
                        Close Shift
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-l-4 border-l-amber-500 shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-amber-600" />
                        <div>
                          <h3 className="font-semibold text-slate-900">No Active Shift</h3>
                          <p className="text-sm text-slate-500">Open a shift to start taking orders</p>
                        </div>
                      </div>
                      <Button onClick={handleOpenShift}>Open</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Add Expense Button */}
              <Button
                className="w-full h-14 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-lg font-semibold shadow-lg"
                onClick={() => setAddExpenseOpen(true)}
              >
                <DollarSign className="w-5 h-5 mr-2" />
                Add Expense
              </Button>

              {/* Today's Expenses Summary */}
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="font-semibold text-slate-900">Today's Expenses</h3>
                  <span className="text-sm text-slate-600">
                    Total: {formatCurrency(todayExpenses.reduce((sum, exp) => sum + exp.amount, 0))}
                  </span>
                </div>

                {todayExpenses.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center text-slate-500">
                      <DollarSign className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p>No expenses recorded today</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {todayExpenses.map((expense) => (
                      <Card key={expense.id} className="overflow-hidden">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1">
                              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                {getCategoryIcon(expense.category)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900 line-clamp-1">{expense.reason}</p>
                                <p className="text-xs text-slate-500">{formatTime(expense.createdAt)}</p>
                                {expense.category !== 'OTHER' && (
                                  <Badge variant="outline" className="mt-1 text-xs">
                                    {expense.category}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-red-600">
                                -{formatCurrency(expense.amount)}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-red-600"
                                onClick={() => handleDeleteExpense(expense.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Previous Shifts */}
              {previousShifts.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 px-1">Previous Shifts</h3>
                  <div className="space-y-2">
                    {previousShifts.map((shift) => (
                      <Card
                        key={shift.id}
                        className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => handleViewShift(shift)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-slate-900">{formatDate(shift.startedAt)}</p>
                              <p className="text-sm text-slate-600">{shift.orderCount} orders</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-emerald-600">{formatCurrency(shift.currentRevenue)}</p>
                              <Badge variant="outline" className="text-xs">
                                CLOSED
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Expenses Tab */
            <>
              <Button
                className="w-full h-14 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-lg font-semibold shadow-lg"
                onClick={() => setAddExpenseOpen(true)}
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Expense
              </Button>

              {todayExpenses.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center text-slate-500">
                    <DollarSign className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <p className="font-medium">No expenses recorded</p>
                    <p className="text-sm mt-1">Tap the button above to add an expense</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {todayExpenses.map((expense) => (
                    <Card key={expense.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              {getCategoryIcon(expense.category)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-900">{expense.reason}</p>
                              <p className="text-sm text-slate-600">{formatTime(expense.createdAt)}</p>
                              {expense.category !== 'OTHER' && (
                                <Badge variant="outline" className="mt-2">
                                  {expense.category}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-xl font-bold text-red-600">
                              -{formatCurrency(expense.amount)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-red-600"
                              onClick={() => handleDeleteExpense(expense.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Add Expense Dialog */}
      <Dialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                className="text-lg font-semibold"
              />
            </div>
            <div>
              <Label htmlFor="reason">Reason *</Label>
              <Textarea
                id="reason"
                placeholder="Enter expense reason..."
                value={expenseReason}
                onChange={(e) => setExpenseReason(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <SelectItem key={cat.value} value={cat.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          <span>{cat.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddExpenseOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddExpense}
              disabled={submittingExpense || !expenseAmount || !expenseReason}
            >
              {submittingExpense ? 'Adding...' : 'Add Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift Detail Sheet */}
      <Sheet open={shiftDetailOpen} onOpenChange={setShiftDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {selectedShift && (
            <>
              <SheetHeader className="px-6 pt-6">
                <div className="flex items-center justify-between">
                  <SheetTitle>Shift Details</SheetTitle>
                  <Button variant="ghost" size="icon">
                    <Printer className="w-4 h-4" />
                  </Button>
                </div>
              </SheetHeader>

              <ScrollArea className="h-[calc(100vh-180px)] px-6 py-4">
                <div className="space-y-6">
                  {/* Shift Info */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Shift Information</h4>
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Status</span>
                          <Badge className={selectedShift.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'}>
                            {selectedShift.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Started</span>
                          <span className="font-medium">{new Date(selectedShift.startedAt).toLocaleString()}</span>
                        </div>
                        {selectedShift.endedAt && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Ended</span>
                            <span className="font-medium">{new Date(selectedShift.endedAt).toLocaleString()}</span>
                          </div>
                        )}
                        <Separator />
                        <div className="flex justify-between text-lg font-bold">
                          <span>Revenue</span>
                          <span className="text-emerald-600">{formatCurrency(selectedShift.currentRevenue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Orders</span>
                          <span className="font-medium">{selectedShift.orderCount}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Shift Orders */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Shift Orders ({shiftOrders.length})</h4>
                    {shiftOrders.length === 0 ? (
                      <Card>
                        <CardContent className="p-6 text-center text-slate-500">
                          <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                          <p>No orders in this shift</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {shiftOrders.map((order) => (
                          <Card key={order.id}>
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-slate-900">Order #{order.orderNumber}</p>
                                  <p className="text-xs text-slate-500">{formatTime(order.createdAt)}</p>
                                </div>
                                <span className="font-bold text-emerald-600">
                                  {formatCurrency(order.totalAmount)}
                                </span>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Shift Expenses */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Shift Expenses ({shiftExpenses.length})</h4>
                    {shiftExpenses.length === 0 ? (
                      <Card>
                        <CardContent className="p-6 text-center text-slate-500">
                          <DollarSign className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                          <p>No expenses in this shift</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {shiftExpenses.map((expense) => (
                          <Card key={expense.id}>
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-slate-900">{expense.reason}</p>
                                  <p className="text-xs text-slate-500">{formatTime(expense.createdAt)}</p>
                                </div>
                                <span className="font-bold text-red-600">
                                  -{formatCurrency(expense.amount)}
                                </span>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Summary */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Summary</h4>
                    <Card>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Gross Revenue</span>
                          <span className="font-medium">{formatCurrency(selectedShift.currentRevenue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Expenses</span>
                          <span className="font-medium text-red-600">
                            -{formatCurrency(shiftExpenses.reduce((sum, exp) => sum + exp.amount, 0))}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-lg font-bold">
                          <span>Net</span>
                          <span className="text-emerald-600">
                            {formatCurrency(selectedShift.currentRevenue - shiftExpenses.reduce((sum, exp) => sum + exp.amount, 0))}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
