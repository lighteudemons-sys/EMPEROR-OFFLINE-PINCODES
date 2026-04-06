'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  DollarSign, 
  Play, 
  Square, 
  Calendar, 
  User, 
  TrendingUp, 
  Store, 
  CreditCard, 
  Wallet, 
  X, 
  ChevronRight,
  Lock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { getIndexedDBStorage } from '@/lib/storage/indexeddb-storage';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

const storage = getIndexedDBStorage();

interface Shift {
  id: string;
  branchId: string;
  branchName?: string;
  cashierId: string;
  cashierName?: string;
  startTime: string;
  endTime?: string;
  openingCash: number;
  closingCash?: number;
  openingOrders: number;
  closingOrders?: number;
  openingRevenue: number;
  closingRevenue?: number;
  isClosed: boolean;
  notes?: string;
  orderCount: number;
  currentRevenue?: number;
  currentOrders?: number;
}

interface PaymentBreakdown {
  cash: number;
  card: number;
  instapay: number;
  wallet: number;
  total: number;
}

// Helper functions (SAME AS DESKTOP)
async function createShiftOffline(shiftData: any, user: any): Promise<void> {
  try {
    console.log('[Mobile Shift] Creating shift offline, shiftData:', shiftData);

    const indexedDBStorage = getIndexedDBStorage();
    await indexedDBStorage.init();

    const branches = await indexedDBStorage.getAllBranches();
    const branch = branches.find((b: any) => b.id === shiftData.branchId);
    const branchName = branch?.branchName || 'Unknown Branch';

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newShift = {
      id: tempId,
      branchId: shiftData.branchId,
      branchName: branchName,
      cashierId: shiftData.cashierId,
      cashierName: user.name || user.username,
      cashierUsername: user.username,
      dayId: shiftData.dayId,
      startTime: new Date().toISOString(),
      openingCash: shiftData.openingCash,
      openingOrders: 0,
      openingRevenue: 0,
      shiftNumber: 1,
      isClosed: false,
      notes: shiftData.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      orderCount: 0,
      currentRevenue: 0,
      currentOrders: 0,
    };

    await indexedDBStorage.put('shifts', newShift);

    await indexedDBStorage.addOperation({
      type: 'CREATE_SHIFT',
      data: {
        ...shiftData,
        id: tempId,
        dayId: shiftData.dayId,
        startTime: newShift.startTime,
        isClosed: newShift.isClosed,
        createdAt: newShift.createdAt,
        updatedAt: newShift.updatedAt,
        cashierName: newShift.cashierName,
        cashierUsername: newShift.cashierUsername,
        branchName: newShift.branchName,
      },
      branchId: shiftData.branchId,
    });

    console.log('[Mobile Shift] Shift created offline successfully:', newShift);
  } catch (error) {
    console.error('[Mobile Shift] Failed to create shift offline, error:', error);
    throw error;
  }
}

async function openBusinessDayOffline(businessDayData: any, user: any): Promise<any> {
  try {
    console.log('[Mobile Business Day] Opening business day offline, data:', businessDayData);

    const indexedDBStorage = getIndexedDBStorage();
    await indexedDBStorage.init();

    const existingBusinessDays = await indexedDBStorage.getBusinessDays();

    const existingOpenDay = existingBusinessDays.find(
      (bd: any) => bd.branchId === businessDayData.branchId && bd.isOpen
    );

    if (existingOpenDay) {
      console.log('[Mobile Business Day] Business day already open for this branch:', existingOpenDay);
      return existingOpenDay;
    }

    const tempId = `temp-day-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newBusinessDay = {
      id: tempId,
      branchId: businessDayData.branchId,
      openedBy: user.id,
      openedAt: new Date().toISOString(),
      isOpen: true,
      openingCash: 0,
      notes: businessDayData.notes,
      totalOrders: 0,
      totalSales: 0,
      shifts: [],
    };

    await indexedDBStorage.saveBusinessDay(newBusinessDay);

    await indexedDBStorage.addOperation({
      type: 'OPEN_BUSINESS_DAY',
      data: {
        ...businessDayData,
        id: tempId,
        openedAt: newBusinessDay.openedAt,
        openedBy: newBusinessDay.openedBy,
      },
      branchId: businessDayData.branchId,
    });

    console.log('[Mobile Business Day] Returning new business day:', newBusinessDay);
    return newBusinessDay;
  } catch (error) {
    console.error('[Mobile Business Day] Failed to open business day offline, error:', error);
    throw error;
  }
}

async function closeShiftOffline(
  shift: any,
  closingCash: number,
  notes: string,
  paymentBreakdown: PaymentBreakdown
): Promise<any> {
  try {
    console.log('[Mobile Shift] Closing shift offline, shift:', shift);

    const indexedDBStorage = getIndexedDBStorage();
    await indexedDBStorage.init();

    const allOrders = await indexedDBStorage.getAllOrders();
    const shiftOrders = allOrders.filter((order: any) => order.shiftId === shift.id);

    const subtotal = shiftOrders.reduce((sum: number, order: any) => sum + (order.subtotal || 0), 0);
    const cashierRevenue = subtotal;

    const totalLoyaltyDiscounts = shiftOrders.reduce((sum: number, order: any) => sum + (order.loyaltyDiscount || 0), 0);
    const totalPromoDiscounts = shiftOrders.reduce((sum: number, order: any) => sum + (order.promoDiscount || 0), 0);
    const totalManualDiscounts = shiftOrders.reduce((sum: number, order: any) => sum + (order.manualDiscountAmount || 0), 0);

    const allDailyExpenses = await indexedDBStorage.getAllDailyExpenses();
    const shiftDailyExpenses = allDailyExpenses.filter((exp: any) => exp.shiftId === shift.id);
    const totalDailyExpenses = shiftDailyExpenses.reduce((sum: number, exp: any) => sum + (exp.amount || 0), 0);

    const updatedShift = {
      ...shift,
      endTime: new Date().toISOString(),
      closingCash: closingCash,
      closingOrders: shiftOrders.length,
      closingRevenue: cashierRevenue,
      closingLoyaltyDiscounts: totalLoyaltyDiscounts,
      closingPromoDiscounts: totalPromoDiscounts,
      closingDailyExpenses: totalDailyExpenses,
      closingVoidedItems: 0,
      closingRefunds: 0,
      isClosed: true,
      notes: notes || shift.notes,
      paymentBreakdown: paymentBreakdown || shift.paymentBreakdown,
      updatedAt: new Date().toISOString(),
      cashierName: shift.cashierName || shift.cashier?.name,
      cashierUsername: shift.cashierUsername || shift.cashier?.username,
      branchName: shift.branchName || shift.branch?.branchName,
      branchId: shift.branchId,
      shiftNumber: shift.shiftNumber || shift.openingOrders || shiftOrders.length,
      startTime: shift.startTime || new Date().toISOString(),
    };

    await indexedDBStorage.put('shifts', updatedShift);

    await indexedDBStorage.addOperation({
      type: 'CLOSE_SHIFT',
      data: {
        id: shift.id,
        branchId: shift.branchId,
        cashierId: shift.cashierId,
        startTime: shift.startTime,
        closingCash: closingCash,
        notes: notes || shift.notes,
        paymentBreakdown: paymentBreakdown || shift.paymentBreakdown,
        endTime: updatedShift.endTime,
        cashierName: updatedShift.cashierName,
        cashierUsername: updatedShift.cashierUsername,
        branchName: updatedShift.branchName,
      },
      branchId: shift.branchId,
    });

    console.log('[Mobile Shift] Shift closed offline successfully:', updatedShift);
    return updatedShift;
  } catch (error) {
    console.error('[Mobile Shift] Failed to close shift offline, error:', error);
    throw error;
  }
}

export function MobileShifts() {
  const { user } = useAuth();
  const { t, currency } = useI18n();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdown>({
    cash: 0,
    card: 0,
    instapay: 0,
    wallet: 0,
    total: 0,
  });

  // Business Day states
  const [businessDayStatus, setBusinessDayStatus] = useState<{
    isOpen: boolean;
    businessDayId?: string;
  }>({ isOpen: false });
  const [openDayDialogOpen, setOpenDayDialogOpen] = useState(false);
  const [dayOpeningNotes, setDayOpeningNotes] = useState('');

  // Fetch branches
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const response = await fetch('/api/branches');
        const data = await response.json();

        if (response.ok && data.branches) {
          const branchesList = data.branches.map((branch: any) => ({
            id: branch.id,
            name: branch.branchName,
          }));
          setBranches(branchesList);
        }
      } catch (error) {
        console.error('Failed to fetch branches:', error);
      }
    };

    fetchBranches();
  }, []);

  // Set user branch on mount
  useEffect(() => {
    if (user) {
      if (user.branchId) {
        setSelectedBranch(user.branchId);
      } else if (user.role === 'ADMIN' && branches.length > 0) {
        setSelectedBranch(branches[0].id);
      }
    }
  }, [user, branches]);

  // Fetch shifts when branch changes
  useEffect(() => {
    if (!selectedBranch) return;

    const fetchShifts = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ branchId: selectedBranch });
        const response = await fetch(`/api/shifts?${params.toString()}`);
        const data = await response.json();

        let allShifts: Shift[] = [];
        if (response.ok && data.shifts) {
          allShifts = data.shifts;
        }

        // Also check IndexedDB for offline shifts
        try {
          await storage.init();
          const offlineShifts = await storage.getAllShifts();
          
          // Filter offline shifts for this branch
          const branchOfflineShifts = offlineShifts.filter((s: any) => 
            s.branchId === selectedBranch
          );
          
          // Merge online and offline shifts (avoiding duplicates)
          const onlineShiftIds = new Set(allShifts.map(s => s.id));
          const uniqueOfflineShifts = branchOfflineShifts.filter((s: any) => !onlineShiftIds.has(s.id));
          
          allShifts = [...allShifts, ...uniqueOfflineShifts];
        } catch (dbError) {
          console.error('Failed to fetch offline shifts:', dbError);
        }

        // Sort by start time (newest first)
        allShifts.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

        setShifts(allShifts);
      } catch (error) {
        console.error('Failed to fetch shifts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchShifts();
  }, [selectedBranch]);

  // Fetch business day status
  const fetchBusinessDayStatus = async () => {
    if (!selectedBranch) return;

    try {
      const response = await fetch(`/api/business-days/status?branchId=${selectedBranch}`);
      const data = await response.json();

      if (response.ok && data.status === 'OPEN' && data.businessDay) {
        setBusinessDayStatus({
          isOpen: true,
          businessDayId: data.businessDay.id,
        });
        return;
      }
    } catch (error) {
      console.error('Failed to fetch business day status from API:', error);
    }

    // Check IndexedDB as fallback
    try {
      await storage.init();
      const businessDays = await storage.getBusinessDays();
      const openBusinessDay = businessDays.find(
        (bd: any) => bd.branchId === selectedBranch && bd.isOpen
      );

      if (openBusinessDay) {
        setBusinessDayStatus({
          isOpen: true,
          businessDayId: openBusinessDay.id,
        });
      } else {
        setBusinessDayStatus({ isOpen: false });
      }
    } catch (dbError) {
      console.error('Failed to check IndexedDB for business day:', dbError);
      setBusinessDayStatus({ isOpen: false });
    }
  };

  useEffect(() => {
    if (selectedBranch) {
      fetchBusinessDayStatus();
    }
  }, [selectedBranch]);

  // Handle open shift
  const handleOpenShift = async () => {
    if (!selectedBranch) {
      showErrorToast('Error', 'Please select a branch');
      return;
    }

    if (!user?.id) {
      showErrorToast('Error', 'User not authenticated');
      return;
    }

    const cashAmount = parseFloat(openingCash) || 0;

    const shiftData = {
      branchId: selectedBranch,
      cashierId: user.id,
      openingCash: cashAmount,
      notes: shiftNotes || undefined,
    };

    try {
      // Try API first
      const response = await fetch('/api/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shiftData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', 'Shift opened successfully');
        setOpenDialogOpen(false);
        setOpeningCash('0');
        setShiftNotes('');
        
        // Refresh shifts and business day status
        const event = new CustomEvent('refreshShiftStatus');
        window.dispatchEvent(event);
        
        return;
      }
    } catch (error) {
      console.log('API failed, trying offline mode');
    }

    // Offline mode
    try {
      await createShiftOffline(shiftData, user);
      showSuccessToast('Success', 'Shift opened (offline mode)');
      setOpenDialogOpen(false);
      setOpeningCash('0');
      setShiftNotes('');

      // Refresh status
      const event = new CustomEvent('refreshShiftStatus');
      window.dispatchEvent(event);
    } catch (error) {
      console.error('Failed to open shift:', error);
      showErrorToast('Error', 'Failed to open shift');
    }
  };

  // Handle open business day
  const handleOpenBusinessDay = async () => {
    if (!selectedBranch) {
      showErrorToast('Error', 'Please select a branch');
      return;
    }

    if (!user?.id) {
      showErrorToast('Error', 'User not authenticated');
      return;
    }

    const businessDayData = {
      branchId: selectedBranch,
      userId: user.id,
      notes: dayOpeningNotes || undefined,
    };

    try {
      const response = await fetch('/api/business-days/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(businessDayData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccessToast('Success', 'Business day opened successfully');
        setOpenDayDialogOpen(false);
        setDayOpeningNotes('');
        setBusinessDayStatus({
          isOpen: true,
          businessDayId: data.businessDay.id,
        });

        // Refresh status
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('refreshBusinessDayStatus'));
        }, 100);
        return;
      }
    } catch (error) {
      console.log('API failed, trying offline mode');
    }

    // Offline mode
    try {
      const offlineBusinessDay = await openBusinessDayOffline(businessDayData, user);
      showSuccessToast('Success', 'Business day opened (offline mode)');
      setOpenDayDialogOpen(false);
      setDayOpeningNotes('');
      setBusinessDayStatus({
        isOpen: true,
        businessDayId: offlineBusinessDay.id,
      });

      // Refresh status
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('refreshBusinessDayStatus'));
      }, 100);
    } catch (error) {
      console.error('Failed to open business day:', error);
      showErrorToast('Error', 'Failed to open business day');
    }
  };

  // Handle close shift
  const handleCloseShift = async () => {
    if (!selectedShift) return;

    const cashAmount = parseFloat(closingCash) || 0;

    try {
      await closeShiftOffline(selectedShift, cashAmount, shiftNotes, paymentBreakdown);
      showSuccessToast('Success', 'Shift closed successfully');
      setCloseDialogOpen(false);
      setClosingCash('');
      setShiftNotes('');
      setPaymentBreakdown({
        cash: 0,
        card: 0,
        instapay: 0,
        wallet: 0,
        total: 0,
      });
      setSelectedShift(null);

      // Refresh
      const event = new CustomEvent('refreshShiftStatus');
      window.dispatchEvent(event);
    } catch (error) {
      console.error('Failed to close shift:', error);
      showErrorToast('Error', 'Failed to close shift');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <Clock className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Shifts</h1>
            <p className="text-emerald-100 text-sm">Manage your shifts and business day</p>
          </div>
        </div>

        {/* Branch Selector (for admins) */}
        {user?.role === 'ADMIN' && branches.length > 0 && (
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="bg-white/20 border-white/30 text-white">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="p-4 space-y-4">
          {/* Business Day Status */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    businessDayStatus.isOpen ? 'bg-green-100' : 'bg-slate-100'
                  }`}>
                    <Store className={`w-6 h-6 ${businessDayStatus.isOpen ? 'text-green-600' : 'text-slate-400'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Business Day</h3>
                    <p className={`text-sm ${businessDayStatus.isOpen ? 'text-green-600' : 'text-slate-500'}`}>
                      {businessDayStatus.isOpen ? 'Open' : 'Closed'}
                    </p>
                  </div>
                </div>
                {!businessDayStatus.isOpen && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setOpenDayDialogOpen(true)}
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Open
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Current Shift Card */}
          {shifts.length > 0 && !shifts[0].isClosed && (
            <Card className="border-2 border-emerald-200 bg-emerald-50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-600" />
                    Current Shift
                  </CardTitle>
                  <Badge className="bg-emerald-600">Active</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Revenue</p>
                    <p className="text-lg font-bold text-emerald-600">
                      {formatCurrency(shifts[0].currentRevenue || shifts[0].closingRevenue || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Orders</p>
                    <p className="text-lg font-bold text-slate-900">
                      {shifts[0].currentOrders || shifts[0].orderCount || 0}
                    </p>
                  </div>
                </div>
                <Separator />
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    setSelectedShift(shifts[0]);
                    setCloseDialogOpen(true);
                  }}
                >
                  <Square className="w-4 h-4 mr-2" />
                  Close Shift
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Open Shift Button (if no active shift) */}
          {(!shifts.length || shifts[0]?.isClosed) && (
            <Button
              className="w-full h-14 text-lg bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setOpenDialogOpen(true)}
            >
              <Play className="w-5 h-5 mr-2" />
              Start New Shift
            </Button>
          )}

          {/* Shift History */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3 px-1">Shift History</h3>
            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-8 text-slate-500">
                  <div className="animate-spin h-8 w-8 border-2 border-emerald-600 border-t-transparent rounded-full mx-auto mb-2" />
                  <p>Loading shifts...</p>
                </div>
              ) : shifts.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No shifts yet</p>
                    <p className="text-sm text-slate-400 mt-1">Start a shift to begin</p>
                  </CardContent>
                </Card>
              ) : (
                shifts.map((shift) => (
                  <Card key={shift.id} className={shift.isClosed ? 'opacity-75' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-slate-900">
                              {shift.isClosed ? 'Shift Closed' : 'Shift Active'}
                            </p>
                            {!shift.isClosed && (
                              <Badge className="bg-green-600 text-xs">Open</Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-500">
                            {new Date(shift.startTime).toLocaleDateString()} • 
                            {new Date(shift.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-slate-500">Revenue</p>
                          <p className="font-semibold text-slate-900">
                            {formatCurrency(shift.closingRevenue || shift.currentRevenue || 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Orders</p>
                          <p className="font-semibold text-slate-900">
                            {shift.closingOrders || shift.currentOrders || shift.orderCount || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Opening</p>
                          <p className="font-semibold text-slate-900">
                            {formatCurrency(shift.openingCash)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Open Shift Dialog */}
      <Dialog open={openDialogOpen} onOpenChange={setOpenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Shift</DialogTitle>
            <DialogDescription>
              Enter the opening cash amount for this shift
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="openingCash">Opening Cash Amount ({currency})</Label>
              <Input
                id="openingCash"
                type="number"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="shiftNotes">Notes (optional)</Label>
              <Textarea
                id="shiftNotes"
                value={shiftNotes}
                onChange={(e) => setShiftNotes(e.target.value)}
                placeholder="Any notes for this shift..."
                className="mt-2"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleOpenShift} className="bg-emerald-600 hover:bg-emerald-700">
              Start Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open Business Day Dialog */}
      <Dialog open={openDayDialogOpen} onOpenChange={setOpenDayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open Business Day</DialogTitle>
            <DialogDescription>
              Start a new business day for this branch
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="dayNotes">Notes (optional)</Label>
              <Textarea
                id="dayNotes"
                value={dayOpeningNotes}
                onChange={(e) => setDayOpeningNotes(e.target.value)}
                placeholder="Any notes for this business day..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDayDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleOpenBusinessDay} className="bg-emerald-600 hover:bg-emerald-700">
              Open Day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Shift Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Close Shift</DialogTitle>
            <DialogDescription>
              Enter the closing details for this shift
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="closingCash">Closing Cash Amount ({currency})</Label>
              <Input
                id="closingCash"
                type="number"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                placeholder="0.00"
                className="mt-2"
              />
            </div>

            {selectedShift && (
              <Card className="bg-slate-50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Opening Cash</span>
                    <span className="font-medium">{formatCurrency(selectedShift.openingCash)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Revenue</span>
                    <span className="font-medium">{formatCurrency(selectedShift.currentRevenue || selectedShift.closingRevenue || 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Expected Cash</span>
                    <span className="text-emerald-600">
                      {formatCurrency((selectedShift.openingCash || 0) + (selectedShift.currentRevenue || selectedShift.closingRevenue || 0))}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            <div>
              <Label htmlFor="closeNotes">Notes (optional)</Label>
              <Textarea
                id="closeNotes"
                value={shiftNotes}
                onChange={(e) => setShiftNotes(e.target.value)}
                placeholder="Any notes for shift closing..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCloseShift} className="bg-emerald-600 hover:bg-emerald-700">
              Close Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
