'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  FileText,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles,
  CreditCard,
  Shield,
  Zap,
  ArrowRight,
  X,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  orderId?: string;
  referenceNumber?: string;
  notes?: string;
  previousBalance: number;
  newBalance: number;
  createdAt: string;
}

interface CreditInfo {
  id: string;
  name: string;
  phone: string;
  creditLimit: number;
  creditBalance: number;
  availableCredit: number;
  customerType: string;
  isVatRegistered: boolean;
  taxRegistrationNumber?: string;
}

interface CreditManagementProps {
  customerId: string;
  customerName: string;
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
}

export default function CreditManagement({
  customerId,
  customerName,
  isOpen,
  onClose,
  userId = '',
}: CreditManagementProps) {
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showAddAdjustment, setShowAddAdjustment] = useState(false);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Adjustment form state
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');

  // Fetch credit information
  const fetchCreditInfo = async () => {
    if (!customerId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/customers/${customerId}/credit`);
      if (response.ok) {
        const data = await response.json();
        setCreditInfo(data.customer);
        setTransactions(data.transactions || []);
      } else {
        const error = await response.json();
        showErrorToast('Error', error.error || 'Failed to fetch credit information');
      }
    } catch (error) {
      console.error('Error fetching credit info:', error);
      showErrorToast('Error', 'Failed to fetch credit information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && customerId) {
      fetchCreditInfo();
    }
  }, [isOpen, customerId]);

  // Handle payment submission
  const handlePaymentSubmit = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      showErrorToast('Error', 'Please enter a valid payment amount');
      return;
    }

    try {
      const response = await fetch(`/api/customers/${customerId}/credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'CREDIT_PAYMENT',
          amount: parseFloat(paymentAmount),
          referenceNumber: paymentReference || undefined,
          notes: paymentNotes || undefined,
          createdBy: userId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        showSuccessToast('Success', data.message);
        setPaymentAmount('');
        setPaymentReference('');
        setPaymentNotes('');
        setShowAddPayment(false);
        fetchCreditInfo();
      } else {
        const error = await response.json();
        showErrorToast('Error', error.error || 'Failed to record payment');
      }
    } catch (error) {
      console.error('Error recording payment:', error);
      showErrorToast('Error', 'Failed to record payment');
    }
  };

  // Handle adjustment submission
  const handleAdjustmentSubmit = async () => {
    if (!adjustmentAmount || parseFloat(adjustmentAmount) === 0) {
      showErrorToast('Error', 'Please enter a valid adjustment amount (use negative to reduce balance)');
      return;
    }

    try {
      const response = await fetch(`/api/customers/${customerId}/credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'CREDIT_ADJUSTMENT',
          amount: parseFloat(adjustmentAmount),
          notes: adjustmentNotes || undefined,
          createdBy: userId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        showSuccessToast('Success', data.message);
        setAdjustmentAmount('');
        setAdjustmentNotes('');
        setShowAddAdjustment(false);
        fetchCreditInfo();
      } else {
        const error = await response.json();
        showErrorToast('Error', error.error || 'Failed to record adjustment');
      }
    } catch (error) {
      console.error('Error recording adjustment:', error);
      showErrorToast('Error', 'Failed to record adjustment');
    }
  };

  // Get transaction type badge
  const getTransactionTypeBadge = (type: string) => {
    const styles = {
      CREDIT_PURCHASE: 'bg-gradient-to-r from-red-500 to-rose-600 text-white border-0 shadow-lg shadow-red-500/30',
      CREDIT_PAYMENT: 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0 shadow-lg shadow-emerald-500/30',
      CREDIT_ADJUSTMENT: 'bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 shadow-lg shadow-violet-500/30',
      CREDIT_REFUND: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0 shadow-lg shadow-amber-500/30',
    };

    const icons = {
      CREDIT_PURCHASE: <TrendingUp className="h-3 w-3 mr-1" />,
      CREDIT_PAYMENT: <TrendingDown className="h-3 w-3 mr-1" />,
      CREDIT_ADJUSTMENT: <RefreshCw className="h-3 w-3 mr-1" />,
      CREDIT_REFUND: <ArrowUpRight className="h-3 w-3 mr-1" />,
    };

    const labels = {
      CREDIT_PURCHASE: 'Purchase',
      CREDIT_PAYMENT: 'Payment',
      CREDIT_ADJUSTMENT: 'Adjustment',
      CREDIT_REFUND: 'Refund',
    };

    return (
      <Badge className={`${styles[type as keyof typeof styles] || 'bg-slate-100 text-slate-700'} px-3 py-1 font-semibold text-xs`}>
        {icons[type as keyof typeof icons]}
        {labels[type as keyof typeof labels] || type}
      </Badge>
    );
  };

  // Calculate credit utilization
  const creditUtilization = creditInfo
    ? creditInfo.creditLimit > 0
      ? (creditInfo.creditBalance / creditInfo.creditLimit) * 100
      : 0
    : 0;

  // Get utilization status
  const getUtilizationStatus = () => {
    if (creditUtilization >= 90) {
      return { color: 'bg-red-500', text: 'Critical', bg: 'bg-red-50 dark:bg-red-950/20', textColor: 'text-red-700 dark:text-red-400' };
    }
    if (creditUtilization >= 70) {
      return { color: 'bg-amber-500', text: 'High', bg: 'bg-amber-50 dark:bg-amber-950/20', textColor: 'text-amber-700 dark:text-amber-400' };
    }
    if (creditUtilization >= 50) {
      return { color: 'bg-blue-500', text: 'Moderate', bg: 'bg-blue-50 dark:bg-blue-950/20', textColor: 'text-blue-700 dark:text-blue-400' };
    }
    return { color: 'bg-emerald-500', text: 'Healthy', bg: 'bg-emerald-50 dark:bg-emerald-950/20', textColor: 'text-emerald-700 dark:text-emerald-400' };
  };

  const utilizationStatus = getUtilizationStatus();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden p-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        {/* Header with Gradient Background */}
        <div className="relative bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNSAzNUwzNSA2M0wwIDYzTDIwIDM1TDIwIDBMMzUgMzV6IiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L2c+PC9zdmc+')] opacity-10"></div>
          <DialogHeader className="relative p-6 pb-8">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-xl border border-white/30">
                  <Wallet className="h-7 w-7 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold text-white tracking-tight">
                    Credit Management
                  </DialogTitle>
                  <DialogDescription className="text-white/80 text-base mt-1">
                    {customerName}
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white/70 hover:text-white hover:bg-white/10 rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </DialogHeader>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-white/20"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-white border-r-white animate-spin"></div>
              </div>
              <p className="text-slate-600 dark:text-slate-400 font-medium">Loading credit information...</p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[calc(95vh-200px)]">
            <div className="p-6 space-y-6">
              {/* Credit Summary Cards - Premium Design */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Credit Limit Card */}
                <Card className="relative overflow-hidden border-2 border-indigo-200 dark:border-indigo-900 shadow-lg shadow-indigo-500/10">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-full -mr-16 -mt-16"></div>
                  <CardContent className="p-5 relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        <CreditCard className="h-5 w-5 text-white" />
                      </div>
                      <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                        Limit
                      </Badge>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                      Credit Limit
                    </p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                      {formatCurrency(creditInfo?.creditLimit || 0)}
                    </p>
                  </CardContent>
                </Card>

                {/* Outstanding Balance Card */}
                <Card className="relative overflow-hidden border-2 border-rose-200 dark:border-rose-900 shadow-lg shadow-rose-500/10">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-rose-500/10 to-transparent rounded-full -mr-16 -mt-16"></div>
                  <CardContent className="p-5 relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
                        <TrendingUp className="h-5 w-5 text-white" />
                      </div>
                      <Badge variant="outline" className="bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800">
                        Balance
                      </Badge>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                      Outstanding Balance
                    </p>
                    <p className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
                      {formatCurrency(creditInfo?.creditBalance || 0)}
                    </p>
                  </CardContent>
                </Card>

                {/* Available Credit Card */}
                <Card className="relative overflow-hidden border-2 border-emerald-200 dark:border-emerald-900 shadow-lg shadow-emerald-500/10">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-full -mr-16 -mt-16"></div>
                  <CardContent className="p-5 relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
                        creditInfo && creditInfo.availableCredit > 0
                          ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/30'
                          : 'bg-gradient-to-br from-slate-400 to-slate-500 shadow-slate-400/30'
                      }`}>
                        <Sparkles className="h-5 w-5 text-white" />
                      </div>
                      <Badge variant="outline" className={`${
                        creditInfo && creditInfo.availableCredit > 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-50 dark:bg-slate-950/30 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                      }`}>
                        Available
                      </Badge>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                      Available Credit
                    </p>
                    <p className={`text-2xl font-black tracking-tight ${
                      creditInfo && creditInfo.availableCredit > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      {formatCurrency(creditInfo?.availableCredit || 0)}
                    </p>
                  </CardContent>
                </Card>

                {/* Utilization Card */}
                <Card className="relative overflow-hidden border-2 border-violet-200 dark:border-violet-900 shadow-lg shadow-violet-500/10">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500/10 to-transparent rounded-full -mr-16 -mt-16"></div>
                  <CardContent className="p-5 relative">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                        <Shield className="h-5 w-5 text-white" />
                      </div>
                      <Badge variant="outline" className={`${utilizationStatus.bg} ${utilizationStatus.textColor} border-0`}>
                        {utilizationStatus.text}
                      </Badge>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                      Credit Utilization
                    </p>
                    <div className="space-y-2">
                      <p className={`text-2xl font-black tracking-tight ${utilizationStatus.textColor}`}>
                        {creditUtilization.toFixed(1)}%
                      </p>
                      <Progress value={creditUtilization} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Alert Section */}
              {creditInfo && (
                <>
                  {creditInfo.availableCredit <= 0 && (
                    <Card className="border-2 border-red-200 dark:border-red-900 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20 shadow-lg">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/30">
                            <AlertTriangle className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-red-900 dark:text-red-100 text-base mb-1">
                              Credit Limit Reached
                            </h4>
                            <p className="text-sm text-red-700 dark:text-red-300">
                              This customer has reached their credit limit and cannot make additional purchases on credit.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {creditInfo.availableCredit > 0 && creditInfo.availableCredit < creditInfo.creditLimit * 0.3 && (
                    <Card className="border-2 border-amber-200 dark:border-amber-900 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 shadow-lg">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/30">
                            <Zap className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-amber-900 dark:text-amber-100 text-base mb-1">
                              Low Available Credit
                            </h4>
                            <p className="text-sm text-amber-700 dark:text-amber-300">
                              Only <span className="font-bold">{formatCurrency(creditInfo.availableCredit)}</span> remaining ({(creditInfo.availableCredit / creditInfo.creditLimit * 100).toFixed(1)}% of limit).
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {/* Action Buttons - Premium Design */}
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowAddPayment(true)}
                  className="flex-1 h-14 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-base shadow-xl shadow-emerald-500/30 border-0"
                >
                  <DollarSign className="h-5 w-5 mr-2" />
                  Record Payment
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button
                  onClick={() => setShowAddAdjustment(true)}
                  className="flex-1 h-14 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-bold text-base shadow-xl shadow-violet-500/30 border-0"
                >
                  <RefreshCw className="h-5 w-5 mr-2" />
                  Make Adjustment
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button
                  onClick={fetchCreditInfo}
                  variant="outline"
                  size="icon"
                  className="h-14 w-14 border-2 shadow-lg hover:shadow-xl transition-all hover:scale-105"
                >
                  <RefreshCw className="h-5 w-5" />
                </Button>
              </div>

              {/* Transaction History - Premium Design */}
              <Card className="border-2 shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 px-6 py-4 border-b-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        Transaction History
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        All credit transactions for this customer
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <FileText className="h-4 w-4" />
                      <span className="font-semibold">{transactions.length}</span>
                      <span>transactions</span>
                    </div>
                  </div>
                </div>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <div className="p-4">
                      {transactions.length === 0 ? (
                        <div className="text-center py-16">
                          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center">
                            <FileText className="h-10 w-10 text-slate-400" />
                          </div>
                          <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                            No Credit Transactions Yet
                          </h4>
                          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                            Credit transactions will appear here when this customer makes purchases or payments on credit.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {transactions.map((transaction, index) => (
                            <div key={transaction.id}>
                              <div className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-lg transition-all">
                                {/* Transaction Icon */}
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ${
                                  transaction.type === 'CREDIT_PAYMENT' || transaction.type === 'CREDIT_REFUND'
                                    ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30'
                                    : transaction.type === 'CREDIT_ADJUSTMENT'
                                    ? 'bg-gradient-to-br from-violet-400 to-violet-600 shadow-violet-500/30'
                                    : 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-500/30'
                                }`}>
                                  {transaction.type === 'CREDIT_PAYMENT' && <TrendingDown className="h-6 w-6 text-white" />}
                                  {transaction.type === 'CREDIT_PURCHASE' && <TrendingUp className="h-6 w-6 text-white" />}
                                  {transaction.type === 'CREDIT_ADJUSTMENT' && <RefreshCw className="h-6 w-6 text-white" />}
                                  {transaction.type === 'CREDIT_REFUND' && <ArrowUpRight className="h-6 w-6 text-white" />}
                                </div>

                                {/* Transaction Details */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-4 mb-2">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        {getTransactionTypeBadge(transaction.type)}
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                          {new Date(transaction.createdAt).toLocaleString('en-EG', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-sm">
                                        <span className="font-semibold text-slate-900 dark:text-white">
                                          {transaction.type === 'CREDIT_PURCHASE' ? 'Credit Purchase' :
                                           transaction.type === 'CREDIT_PAYMENT' ? 'Credit Payment' :
                                           transaction.type === 'CREDIT_ADJUSTMENT' ? 'Credit Adjustment' : 'Credit Refund'}
                                        </span>
                                      </div>
                                      {(transaction.referenceNumber || transaction.orderId) && (
                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-600 dark:text-slate-400">
                                          {transaction.referenceNumber && (
                                            <span className="flex items-center gap-1">
                                              <span className="font-medium">Ref:</span> {transaction.referenceNumber}
                                            </span>
                                          )}
                                          {transaction.orderId && (
                                            <span className="flex items-center gap-1">
                                              <span className="font-medium">Order:</span> {transaction.orderId}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {transaction.notes && (
                                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 italic">
                                          "{transaction.notes}"
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Amount */}
                                <div className="flex flex-col items-end gap-1">
                                  <div className={`font-black text-lg ${
                                    transaction.type === 'CREDIT_PAYMENT' || transaction.type === 'CREDIT_REFUND'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  }`}>
                                    {transaction.type === 'CREDIT_PAYMENT' || transaction.type === 'CREDIT_REFUND' ? '-' : '+'}
                                    {formatCurrency(Math.abs(transaction.amount))}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                    Balance: {formatCurrency(transaction.newBalance)}
                                  </div>
                                </div>
                              </div>
                              {index < transactions.length - 1 && <div className="my-4 border-t-2 border-dashed border-slate-100 dark:border-slate-800"></div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        )}

        {/* Payment Dialog - Premium Design */}
        <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
          <DialogContent className="max-w-md border-0 shadow-2xl">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-6 -m-6 mb-6 rounded-t-xl">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-xl">
                    <DollarSign className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-bold text-white">
                      Record Payment
                    </DialogTitle>
                    <DialogDescription className="text-white/80 text-base">
                      Process payment from {customerName}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="paymentAmount" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Payment Amount (EGP)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">EGP</span>
                  <Input
                    id="paymentAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="pl-14 h-12 text-lg font-semibold border-2 focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentReference" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Reference Number <span className="text-slate-400 font-normal">(Optional)</span>
                </Label>
                <Input
                  id="paymentReference"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g., Cheque #1234, Bank Transfer"
                  className="h-11 border-2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentNotes" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </Label>
                <Textarea
                  id="paymentNotes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Any additional notes about this payment..."
                  rows={3}
                  className="border-2 resize-none"
                />
              </div>
            </div>
            <DialogFooter className="gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAddPayment(false)}
                className="h-12 px-6 font-semibold border-2"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePaymentSubmit}
                className="h-12 px-8 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 font-semibold shadow-lg shadow-emerald-500/30 border-0"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Adjustment Dialog - Premium Design */}
        <Dialog open={showAddAdjustment} onOpenChange={setShowAddAdjustment}>
          <DialogContent className="max-w-md border-0 shadow-2xl">
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 text-white p-6 -m-6 mb-6 rounded-t-xl">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-xl">
                    <RefreshCw className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-bold text-white">
                      Credit Adjustment
                    </DialogTitle>
                    <DialogDescription className="text-white/80 text-base">
                      Manually adjust {customerName}'s credit balance
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="adjustmentAmount" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Adjustment Amount (EGP)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">EGP</span>
                  <Input
                    id="adjustmentAmount"
                    type="number"
                    step="0.01"
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(e.target.value)}
                    placeholder="Enter amount (positive to add, negative to reduce)"
                    className="pl-14 h-12 text-lg font-semibold border-2 focus:border-violet-500"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-2 rounded-lg">
                  <strong className="text-amber-600 dark:text-amber-400">Tip:</strong> Use positive value to increase balance (add credit), negative to decrease balance (reduce credit)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adjustmentNotes" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Reason <span className="text-slate-400 font-normal">(Optional)</span>
                </Label>
                <Textarea
                  id="adjustmentNotes"
                  value={adjustmentNotes}
                  onChange={(e) => setAdjustmentNotes(e.target.value)}
                  placeholder="Explain the reason for this adjustment..."
                  rows={3}
                  className="border-2 resize-none"
                />
              </div>
            </div>
            <DialogFooter className="gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAddAdjustment(false)}
                className="h-12 px-6 font-semibold border-2"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAdjustmentSubmit}
                className="h-12 px-8 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 font-semibold shadow-lg shadow-violet-500/30 border-0"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Apply Adjustment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
