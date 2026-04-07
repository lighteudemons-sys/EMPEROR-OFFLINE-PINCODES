'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CreditCard,
  DollarSign,
  Smartphone,
  Wallet,
  Check,
  X,
  Receipt,
  Printer,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { showSuccessToast, showErrorToast } from '@/hooks/use-toast';

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderData: {
    cart: any[];
    subtotal: number;
    tax: number;
    total: number;
    orderType: string;
    customer?: any;
    promoCode?: string;
    promoDiscount?: number;
  };
  onComplete?: (order: any) => void;
}

type PaymentMethod = 'cash' | 'card' | 'mobile' | 'wallet';

export function MobilePaymentDialog({ open, onOpenChange, orderData, onComplete }: PaymentDialogProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [cardReference, setCardReference] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedMethod('cash');
      setAmountReceived('');
      setCardReference('');
    }
  }, [open]);

  const paymentMethods = [
    { id: 'cash' as PaymentMethod, name: 'Cash', icon: DollarSign, color: 'bg-emerald-100 text-emerald-600' },
    { id: 'card' as PaymentMethod, name: 'Card', icon: CreditCard, color: 'bg-blue-100 text-blue-600' },
    { id: 'mobile' as PaymentMethod, name: 'Mobile Wallet', icon: Smartphone, color: 'bg-purple-100 text-purple-600' },
    { id: 'wallet' as PaymentMethod, name: 'E-Wallet', icon: Wallet, color: 'bg-orange-100 text-orange-600' },
  ];

  const handlePayment = async () => {
    try {
      setProcessing(true);

      // Validate input based on payment method
      if (selectedMethod === 'cash') {
        const received = parseFloat(amountReceived) || 0;
        if (received < orderData.total) {
          showErrorToast('Insufficient Amount', 'Please enter a valid amount');
          setProcessing(false);
          return;
        }
      } else if (selectedMethod === 'card') {
        if (!cardReference) {
          showErrorToast('Required', 'Please enter card reference number');
          setProcessing(false);
          return;
        }
      }

      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Create order
      const order = {
        id: `order-${Date.now()}`,
        items: orderData.cart,
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        total: orderData.total,
        paymentMethod: selectedMethod,
        paymentMethodDetail: selectedMethod === 'card' ? cardReference : undefined,
        cardReferenceNumber: selectedMethod === 'card' ? cardReference : undefined,
        orderType: orderData.orderType,
        customer: orderData.customer,
        promoCode: orderData.promoCode,
        promoDiscount: orderData.promoDiscount,
        amountReceived: selectedMethod === 'cash' ? parseFloat(amountReceived) : orderData.total,
        change: selectedMethod === 'cash' ? (parseFloat(amountReceived) || 0) - orderData.total : 0,
        createdAt: new Date().toISOString(),
        status: 'completed',
      };

      showSuccessToast('Payment Successful', `Order completed with ${selectedMethod}`);

      // Clear mobile cart
      const { getIndexedDBStorage } = await import('@/lib/storage/indexeddb-storage');
      const storage = getIndexedDBStorage();
      await storage.init();
      await storage.setJSON('mobile-cart', []);

      onComplete?.(order);
      onOpenChange(false);
    } catch (error) {
      console.error('Payment error:', error);
      showErrorToast('Payment Failed', 'An error occurred during payment');
    } finally {
      setProcessing(false);
    }
  };

  const change = selectedMethod === 'cash' ? (parseFloat(amountReceived) || 0) - orderData.total : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Complete Payment</DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Order Summary */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                {orderData.cart.slice(0, 3).map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-slate-600">
                      {item.name} x{item.quantity}
                    </span>
                    <span className="font-medium">{formatCurrency(item.price * item.quantity)}</span>
                  </div>
                ))}
                {orderData.cart.length > 3 && (
                  <p className="text-sm text-slate-500">+ {orderData.cart.length - 3} more items</p>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium">{formatCurrency(orderData.subtotal)}</span>
                </div>
                {orderData.promoDiscount && orderData.promoDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span className="font-medium">-{formatCurrency(orderData.promoDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">Tax (14%)</span>
                  <span className="font-medium">{formatCurrency(orderData.tax)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-emerald-600">{formatCurrency(orderData.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Method Selection */}
          <div>
            <Label className="text-sm font-semibold mb-3 block">Payment Method</Label>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 ${
                      selectedMethod === method.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${method.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="font-medium text-sm">{method.name}</span>
                    {selectedMethod === method.id && (
                      <Check className="w-4 h-4 text-emerald-600 ml-auto" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cash Input */}
          {selectedMethod === 'cash' && (
            <div>
              <Label htmlFor="amount">Amount Received</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                className="text-lg font-semibold"
              />
              {amountReceived && parseFloat(amountReceived) >= orderData.total && (
                <div className="mt-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Change</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(change)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Card Reference */}
          {selectedMethod === 'card' && (
            <div>
              <Label htmlFor="cardRef">Card Reference Number</Label>
              <Input
                id="cardRef"
                placeholder="Enter reference number"
                value={cardReference}
                onChange={(e) => setCardReference(e.target.value)}
              />
            </div>
          )}

          {/* Customer Info */}
          {orderData.customer && (
            <Card className="bg-slate-50">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                    <span className="text-xs font-semibold text-emerald-600">
                      {orderData.customer.name?.charAt(0) || 'C'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{orderData.customer.name}</p>
                    <p className="text-xs text-slate-500">{orderData.customer.phone}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-slate-50">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={processing || (selectedMethod === 'cash' && (!amountReceived || parseFloat(amountReceived) < orderData.total))}
            className="bg-emerald-600 hover:bg-emerald-700 min-w-[120px]"
          >
            {processing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Processing
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Pay {formatCurrency(orderData.total)}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
