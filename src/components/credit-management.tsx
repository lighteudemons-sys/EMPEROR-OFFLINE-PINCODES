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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  X,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
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
        // Reset form
        setPaymentAmount('');
        setPaymentReference('');
        setPaymentNotes('');
        setShowAddPayment(false);
        // Refresh data
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
        // Reset form
        setAdjustmentAmount('');
        setAdjustmentNotes('');
        setShowAddAdjustment(false);
        // Refresh data
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

  // Get transaction type badge color
  const getTransactionTypeBadge = (type: string) => {
    switch (type) {
      case 'CREDIT_PURCHASE':
        return <Badge variant="destructive" className="text-xs"><TrendingUp className="h-3 w-3 mr-1" /> Purchase</Badge>;
      case 'CREDIT_PAYMENT':
        return <Badge className="bg-emerald-600 text-white text-xs"><TrendingDown className="h-3 w-3 mr-1" /> Payment</Badge>;
      case 'CREDIT_ADJUSTMENT':
        return <Badge variant="outline" className="text-xs"><RefreshCw className="h-3 w-3 mr-1" /> Adjustment</Badge>;
      case 'CREDIT_REFUND':
        return <Badge className="bg-amber-600 text-white text-xs"><ArrowUpRight className="h-3 w-3 mr-1" /> Refund</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{type}</Badge>;
    }
  };

  // Calculate credit utilization percentage
  const creditUtilization = creditInfo
    ? creditInfo.creditLimit > 0
      ? (creditInfo.creditBalance / creditInfo.creditLimit) * 100
      : 0
    : 0;

  // Get utilization color
  const getUtilizationColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600 bg-red-50';
    if (percentage >= 70) return 'text-amber-600 bg-amber-50';
    return 'text-emerald-600 bg-emerald-50';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Credit Management - {customerName}
          </DialogTitle>
          <DialogDescription>
            Manage credit balance, payments, and transactions for this B2B customer
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <>
            {/* Credit Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 my-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Credit Limit</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900">
                    {formatCurrency(creditInfo?.creditLimit || 0)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Outstanding Balance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(creditInfo?.creditBalance || 0)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Available Credit</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${creditInfo && creditInfo.availableCredit > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(creditInfo?.availableCredit || 0)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Credit Utilization</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getUtilizationColor(creditUtilization)}`}>
                    {creditUtilization.toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Credit Status Alert */}
            {creditInfo && (
              <>
                {creditInfo.availableCredit <= 0 && (
                  <Alert className="mb-4 border-red-200 bg-red-50">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      Credit limit reached. This customer cannot make additional purchases on credit.
                    </AlertDescription>
                  </Alert>
                )}
                {creditInfo.availableCredit > 0 && creditInfo.availableCredit < creditInfo.creditLimit * 0.3 && (
                  <Alert className="mb-4 border-amber-200 bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                      Low available credit. Only {formatCurrency(creditInfo.availableCredit)} remaining.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 mb-4">
              <Button
                onClick={() => setShowAddPayment(true)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
              <Button
                onClick={() => setShowAddAdjustment(true)}
                variant="outline"
                className="flex-1"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Make Adjustment
              </Button>
              <Button
                onClick={fetchCreditInfo}
                variant="outline"
                size="icon"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Transaction History */}
            <Card className="flex-1 overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Transaction History</CardTitle>
                <CardDescription>Recent credit transactions</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[300px]">
                  <div className="p-4">
                    {transactions.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No credit transactions yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {transactions.map((transaction, index) => (
                          <div key={transaction.id}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {getTransactionTypeBadge(transaction.type)}
                                  <span className="text-xs text-slate-500">
                                    {new Date(transaction.createdAt).toLocaleString('en-EG', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <div className="text-sm">
                                  <span className="font-medium">
                                    {transaction.type === 'CREDIT_PURCHASE' ? 'Purchase' :
                                     transaction.type === 'CREDIT_PAYMENT' ? 'Payment' :
                                     transaction.type === 'CREDIT_ADJUSTMENT' ? 'Adjustment' : 'Refund'}
                                  </span>
                                  {transaction.referenceNumber && (
                                    <span className="text-slate-500 ml-2">
                                      Ref: {transaction.referenceNumber}
                                    </span>
                                  )}
                                  {transaction.orderId && (
                                    <span className="text-slate-500 ml-2">
                                      Order: {transaction.orderId}
                                    </span>
                                  )}
                                </div>
                                {transaction.notes && (
                                  <p className="text-xs text-slate-500 mt-1">{transaction.notes}</p>
                                )}
                              </div>
                              <div className="text-right ml-4">
                                <div className={`font-bold ${transaction.type === 'CREDIT_PAYMENT' || transaction.type === 'CREDIT_REFUND' ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {transaction.type === 'CREDIT_PAYMENT' || transaction.type === 'CREDIT_REFUND' ? '-' : '+'}
                                  {formatCurrency(Math.abs(transaction.amount))}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Balance: {formatCurrency(transaction.newBalance)}
                                </div>
                              </div>
                            </div>
                            {index < transactions.length - 1 && <Separator className="mt-3" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Payment Dialog */}
            <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Credit Payment</DialogTitle>
                  <DialogDescription>
                    Record a payment from {customerName} to reduce their credit balance
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="paymentAmount">Payment Amount (EGP)</Label>
                    <Input
                      id="paymentAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Enter payment amount"
                    />
                  </div>
                  <div>
                    <Label htmlFor="paymentReference">Reference Number (Optional)</Label>
                    <Input
                      id="paymentReference"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="e.g., Cheque #1234, Bank Transfer"
                    />
                  </div>
                  <div>
                    <Label htmlFor="paymentNotes">Notes (Optional)</Label>
                    <Textarea
                      id="paymentNotes"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      placeholder="Any additional notes..."
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddPayment(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handlePaymentSubmit} className="bg-emerald-600 hover:bg-emerald-700">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Record Payment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Adjustment Dialog */}
            <Dialog open={showAddAdjustment} onOpenChange={setShowAddAdjustment}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Make Credit Adjustment</DialogTitle>
                  <DialogDescription>
                    Manually adjust the credit balance (positive to add, negative to reduce)
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="adjustmentAmount">Adjustment Amount (EGP)</Label>
                    <Input
                      id="adjustmentAmount"
                      type="number"
                      step="0.01"
                      value={adjustmentAmount}
                      onChange={(e) => setAdjustmentAmount(e.target.value)}
                      placeholder="Enter positive to add, negative to reduce"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Use positive value to increase balance, negative to decrease
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="adjustmentNotes">Reason (Optional)</Label>
                    <Textarea
                      id="adjustmentNotes"
                      value={adjustmentNotes}
                      onChange={(e) => setAdjustmentNotes(e.target.value)}
                      placeholder="Reason for adjustment..."
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddAdjustment(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAdjustmentSubmit}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Apply Adjustment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
