'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { type DayClosingReportData, type DayClosingShiftData } from '@/lib/escpos-encoder';
import { Printer, X, Loader2, AlertCircle, FileText, DollarSign, Users, Clock, AlertTriangle } from 'lucide-react';

interface DayClosingReceiptProps {
  businessDayId: string;
  open: boolean;
  onClose: () => void;
}

export function DayClosingReceipt({ businessDayId, open, onClose }: DayClosingReceiptProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DayClosingReportData | null>(null);

  // Fetch closing report data when dialog opens
  useEffect(() => {
    console.log('[Day Closing Receipt] Dialog open:', open, 'businessDayId:', businessDayId);
    if (open && businessDayId) {
      fetchClosingReport();
    }
  }, [open, businessDayId]);

  // Auto-print all 4 papers when data is loaded
  useEffect(() => {
    if (data && open && data.shifts && data.shifts.length > 0) {
      console.log('[Day Closing] Auto-printing day closing receipt...');
      console.log('[Day Closing] Number of shifts to print:', data.shifts.length);
      
      // Small delay to ensure that dialog is rendered
      const initialDelay = 1000;
      
      // Create print queue for 4 papers
      const printQueue: Array<() => void> = [
        () => {
          console.log('[Day Closing] Printing Paper 1 (Payment Summary)...');
          printDayPaymentSummary();
        },
        () => {
          console.log('[Day Closing] Printing Paper 2 (Item Summary)...');
          printDayItemSummary();
        },
        () => {
          console.log('[Day Closing] Printing Paper 3 (Void & Refunds)...');
          printDayVoidAndRefunds();
        },
        () => {
          console.log('[Day Closing] Printing Paper 4 (Daily Expenses)...');
          printDayDailyExpenses();
        }
      ];
      
      // Execute print queue with delays
      printQueue.forEach((printFn, index) => {
        const delay = initialDelay + (index * 4000); // 4 second delay between each print
        setTimeout(() => {
          printFn();
        }, delay);
      });
    } else if (data && open) {
      console.log('[Day Closing] Data loaded but no shifts in data, data:', data);
    }
  }, [data, open]);

  const fetchClosingReport = async () => {
    console.log('[Day Closing Receipt] Fetching closing report for businessDayId:', businessDayId);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/business-days/closing-report?businessDayId=${businessDayId}`);
      console.log('[Day Closing Receipt] Response status:', response.status);
      if (!response.ok) {
        throw new Error(`Failed to fetch closing report: ${response.statusText}`);
      }
      const result = await response.json();
      console.log('[Day Closing Receipt] Response data:', result);
      
      // The API returns { success: true, report: DayClosingReportData, legacyReport: ... }
      if (result.success && result.report) {
        console.log('[Day Closing Receipt] Report loaded successfully, shifts count:', result.report.shifts?.length);
        setData(result.report);
      } else {
        console.error('[Day Closing Receipt] API returned no success or report:', result);
        throw new Error(result.error || 'Failed to fetch closing report');
      }
    } catch (err) {
      console.error('[Day Closing Receipt] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Handle Print Functions
  const handlePrintPaymentSummary = () => {
    if (!data) return;
    printDayPaymentSummary();
  };

  const handlePrintVoidAndRefunds = () => {
    if (!data) return;
    printDayVoidAndRefunds();
  };

  const handlePrintDailyExpenses = () => {
    if (!data) return;
    printDayDailyExpenses();
  };

  const handlePrintItemSummary = () => {
    if (!data) return;
    printDayItemSummary();
  };

  // Paper 1: Day Payment Summary (sum all shifts)
  const printDayPaymentSummary = () => {
    if (!data || !data.shifts) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const dateStr = new Date(data.date).toLocaleDateString();
    const shifts = data.shifts;

    // Calculate day totals
    const dayTotals = {
      takeAway: { value: 0, discounts: 0, count: 0, total: 0 },
      dineIn: { value: 0, discounts: 0, count: 0, total: 0 },
      delivery: { value: 0, discounts: 0, count: 0, total: 0 },
      totalSales: 0,
      totalDiscounts: 0,
      totalDeliveryFees: 0,
      totalRefunds: 0,
      totalVoidedItems: 0,
      totalCard: 0,
      totalInstapay: 0,
      totalWallet: 0,
      totalCash: 0,
      totalDailyExpenses: 0,
      totalOpeningCash: 0,
      totalExpectedCash: 0,
      totalClosingCash: 0,
      totalOverShort: 0,
    };

    // Sum all shifts
    shifts.forEach(shift => {
      const takeAway = shift.orderTypeBreakdown?.['take-away'] || { value: 0, discounts: 0, total: 0 };
      const dineIn = shift.orderTypeBreakdown?.['dine-in'] || { value: 0, discounts: 0, total: 0 };
      const delivery = shift.orderTypeBreakdown?.['delivery'] || { value: 0, discounts: 0, total: 0 };

      dayTotals.takeAway.value += takeAway.value;
      dayTotals.takeAway.discounts += takeAway.discounts;
      dayTotals.takeAway.count += takeAway.count || 0;
      dayTotals.takeAway.total += takeAway.total;

      dayTotals.dineIn.value += dineIn.value;
      dayTotals.dineIn.discounts += dineIn.discounts;
      dayTotals.dineIn.count += dineIn.count || 0;
      dayTotals.dineIn.total += dineIn.total;

      dayTotals.delivery.value += delivery.value;
      dayTotals.delivery.discounts += delivery.discounts;
      dayTotals.delivery.count += delivery.count || 0;
      dayTotals.delivery.total += delivery.total;

      const totals = shift.totals || {};
      dayTotals.totalSales += totals.sales || 0;
      dayTotals.totalDiscounts += totals.discounts || 0;
      dayTotals.totalDeliveryFees += totals.deliveryFees || 0;
      dayTotals.totalRefunds += totals.refunds || 0;
      dayTotals.totalVoidedItems += totals.voidedItems || 0;
      dayTotals.totalCard += totals.card || 0;
      dayTotals.totalInstapay += totals.instapay || 0;
      dayTotals.totalWallet += totals.wallet || 0;
      dayTotals.totalCash += totals.cash || 0;
      dayTotals.totalDailyExpenses += totals.dailyExpenses || 0;
      dayTotals.totalOpeningCash += totals.openingCashBalance || 0;
      dayTotals.totalExpectedCash += totals.expectedCash || 0;
      dayTotals.totalClosingCash += totals.closingCashBalance || 0;
      dayTotals.totalOverShort += totals.overShort || 0;
    });

    // Generate shift-by-shift HTML
    const shiftsHtml = shifts.map(shift => {
      const cashierName = shift.cashier?.name || shift.cashier?.username || 'Unknown';
      const timeStr = `${new Date(shift.startTime).toLocaleTimeString()} - ${new Date(shift.endTime).toLocaleTimeString()}`;
      
      const takeAway = shift.orderTypeBreakdown?.['take-away'] || { value: 0, discounts: 0, total: 0 };
      const dineIn = shift.orderTypeBreakdown?.['dine-in'] || { value: 0, discounts: 0, total: 0 };
      const delivery = shift.orderTypeBreakdown?.['delivery'] || { value: 0, discounts: 0, total: 0 };
      
      const totals = shift.totals || {};
      const openingBalance = totals.openingCashBalance || 0;
      const expectedCash = totals.expectedCash || 0;
      const closingBalance = totals.closingCashBalance || 0;
      const overShort = totals.overShort || 0;
      const cash = totals.cash || 0;
      const dailyExpenses = totals.dailyExpenses || 0;

      return `
        <div style="border: 1px solid #000; padding: 8px; margin-bottom: 10px; page-break-inside: avoid;">
          <div style="border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px;">
            <div style="font-weight: bold; margin-bottom: 3px;">Shift ${shift.shiftNumber}</div>
            <div style="font-size: 11px; margin-bottom: 2px;">${cashierName} | ${timeStr}</div>
          </div>
          
          <div style="margin-bottom: 5px;">
            <span style="font-size: 10px;">Opening:</span> 
            <span style="margin-left: 10px;">${formatCurrency(openingBalance)}</span>
          </div>
          <div style="margin-bottom: 5px;">
            <span style="font-size: 10px;">Expected:</span> 
            <span style="margin-left: 10px;">${formatCurrency(expectedCash)}</span>
          </div>
          <div style="margin-bottom: 5px;">
            <span style="font-size: 10px;">Closing:</span> 
            <span style="margin-left: 10px;">${formatCurrency(closingBalance)} ${overShort !== 0 ? (overShort > 0 ? '(+' : '(') + Math.abs(overShort).toFixed(2) + ')' : ''}</span>
          </div>
          
          <div style="font-size: 10px; margin-top: 8px;">
            <div>Cash: ${formatCurrency(cash)} | Exp: ${formatCurrency(dailyExpenses)}</div>
          </div>
        </div>
      `;
    }).join('');

    const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Day Closing - Payment Summary</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
      padding: 0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      color: #000 !important;
    }

    @media print {
      @page {
        margin: 0;
        padding: 0;
        size: 80mm auto;
      }

      body {
        margin: 0;
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      html, body {
        height: auto;
        overflow: visible;
      }
    }

    html, body {
      margin: 0;
      padding: 0;
      height: auto;
      width: 80mm;
    }

    body {
      font-family: 'Courier New', monospace;
      max-width: 80mm;
      margin: 0 auto;
      padding: 0;
      font-size: 12px;
      line-height: 1.4;
      background: white;
      color: #000;
    }

    .header {
      text-align: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px dashed #000;
    }

    .header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: bold;
      padding: 0;
      color: #000;
    }

    .header div {
      margin: 2px 0;
      padding: 0;
      color: #000;
    }

    .section-title {
      font-weight: bold;
      margin: 10px 0 5px 0;
      padding: 0;
      text-decoration: underline;
    }

    .totals {
      border-top: 2px dashed #000;
      padding-top: 8px;
      margin-top: 5px;
      page-break-before: always;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      padding: 0;
    }

    .total-row span {
      color: #000 !important;
    }

    .total-row.grand-total {
      font-weight: bold;
      font-size: 14px;
      margin-top: 8px;
      padding-top: 5px;
    }

    .order-type {
      margin-bottom: 10px;
      padding: 5px;
      border: 1px solid #000;
    }

    .order-type-title {
      font-weight: bold;
      margin-bottom: 5px;
    }

    .order-type-row {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
    }

    .order-type-row span {
      color: #000 !important;
    }

    .footer {
      text-align: center;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 2px dashed #000;
      font-size: 10px;
      padding-bottom: 0;
      color: #000;
    }

    .notes-section {
      margin-top: 10px;
      padding: 5px;
      border: 1px solid #000;
    }

    .notes-title {
      font-weight: bold;
      margin-bottom: 5px;
    }

    .notes-content {
      font-size: 11px;
      line-height: 1.3;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Emperor Coffee</h1>
    <div>${data?.branchName || 'Emperor Coffee'}</div>
    <div>Day Closing - Payment Summary</div>
  </div>

  <div style="font-size: 11px; margin-bottom: 5px;">Date: ${dateStr}</div>

  <div class="section-title">Order Type Breakdown</div>

  <div class="order-type">
    <div class="order-type-title">Take Away</div>
    <div class="order-type-row">
      <span>Value:</span>
      <span>${formatCurrency(dayTotals.takeAway.value)}</span>
    </div>
    <div class="order-type-row">
      <span>Discounts:</span>
      <span>-${formatCurrency(dayTotals.takeAway.discounts)}</span>
    </div>
    <div class="order-type-row">
      <span>Total:</span>
      <span>${formatCurrency(dayTotals.takeAway.total)}</span>
    </div>
  </div>

  <div class="order-type">
    <div class="order-type-title">Dine In</div>
    <div class="order-type-row">
      <span>Value:</span>
      <span>${formatCurrency(dayTotals.dineIn.value)}</span>
    </div>
    <div class="order-type-row">
      <span>Discounts:</span>
      <span>-${formatCurrency(dayTotals.dineIn.discounts)}</span>
    </div>
    <div class="order-type-row">
      <span>Total:</span>
      <span>${formatCurrency(dayTotals.dineIn.total)}</span>
    </div>
  </div>

  <div class="order-type">
    <div class="order-type-title">Delivery</div>
    <div class="order-type-row">
      <span>Value:</span>
      <span>${formatCurrency(dayTotals.delivery.value)}</span>
    </div>
    <div class="order-type-row">
      <span>Discounts:</span>
      <span>-${formatCurrency(dayTotals.delivery.discounts)}</span>
    </div>
    <div class="order-type-row">
      <span>Total:</span>
      <span>${formatCurrency(dayTotals.delivery.total)}</span>
    </div>
  </div>

  <div class="totals">
    <div class="total-row">
      <span>Total Sales:</span>
      <span>${formatCurrency(dayTotals.totalSales)}</span>
    </div>
    <div class="total-row">
      <span>Total Discounts:</span>
      <span>${formatCurrency(dayTotals.totalDiscounts)}</span>
    </div>
    <div class="total-row">
      <span>Total Delivery Fees:</span>
      <span>${formatCurrency(dayTotals.totalDeliveryFees)}</span>
    </div>
    <div class="total-row">
      <span>Total Refunds:</span>
      <span>${formatCurrency(dayTotals.totalRefunds)}</span>
    </div>
    <div class="total-row">
      <span>Total Voids:</span>
      <span>${formatCurrency(dayTotals.totalVoidedItems)}</span>
    </div>
    <div class="total-row">
      <span>Total Card:</span>
      <span>${formatCurrency(dayTotals.totalCard)}</span>
    </div>
    <div class="total-row">
      <span>Total InstaPay:</span>
      <span>${formatCurrency(dayTotals.totalInstapay)}</span>
    </div>
    <div class="total-row">
      <span>Total Wallet:</span>
      <span>${formatCurrency(dayTotals.totalWallet)}</span>
    </div>
    <div class="total-row">
      <span>Total Cash:</span>
      <span>${formatCurrency(dayTotals.totalCash)}</span>
    </div>
    <div class="total-row">
      <span>Total Daily Expenses:</span>
      <span>-${formatCurrency(dayTotals.totalDailyExpenses)}</span>
    </div>
    <div class="total-row">
      <span>Opening Cash:</span>
      <span>${formatCurrency(dayTotals.totalOpeningCash)}</span>
    </div>
    <div class="total-row">
      <span>Expected Cash:</span>
      <span>${formatCurrency(dayTotals.totalExpectedCash)}</span>
    </div>
    <div class="total-row">
      <span>Closing Cash:</span>
      <span>${formatCurrency(dayTotals.totalClosingCash)}</span>
    </div>
    <div class="total-row grand-total">
      <span>Net Over/Short:</span>
      <span>${formatCurrency(dayTotals.totalOverShort)}</span>
    </div>
  </div>

  ${shiftsHtml}

  ${data?.notes ? `
  <div class="notes-section">
    <div class="notes-title">Day Notes:</div>
    <div class="notes-content">${data.notes}</div>
  </div>
  ` : ''}

  <div class="footer">
    <div>Emperor Coffee Franchise</div>
  </div>
</body>
</html>`;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  // Paper 2: Day Item Breakdown (sum all shifts)
  const printDayItemSummary = () => {
    if (!data || !data.shifts || !data.categoryBreakdown) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const dateStr = new Date(data.date).toLocaleDateString();
    const categoryBreakdown = data.categoryBreakdown;

    // Calculate day totals for each category
    const categoryTotals = categoryBreakdown.map(category => {
      const categoryTotal = category.items?.reduce((sum, item) => sum + (item.totalPrice || 0), 0) || 0;
      const categoryQty = category.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      return {
        categoryName: category.categoryName,
        totalSales: category.totalSales || 0,
        totalQty: categoryQty,
        items: category.items || [],
      };
    });

    // Generate HTML for each category
    const categoriesHtml = categoryTotals.map(category => {
      const itemsHtml = category.items.map(item => `
        <div style="border-bottom: 1px dashed #ccc; padding: 3px 0;">
          <div style="display: flex; justify-content: space-between;">
            <span style="font-size: 11px;">${item.isCustomInput && item.totalWeight !== undefined
              ? `وزن: ${item.totalWeight.toFixed(2)} KG ${item.itemName}`
              : item.itemName
            }</span>
            <span style="font-size: 11px;">${item.isCustomInput && item.totalWeight !== undefined
              ? ''
              : item.quantity
            }</span>
          </div>
          <div style="text-align: right; font-weight: bold;">${formatCurrency(item.totalPrice)}</div>
        </div>
      `).join('');

      return `
        <div style="margin-bottom: 8px; page-break-inside: avoid;">
          <div style="border: 1px solid #000; padding: 5px; margin-bottom: 5px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 5px;">
              <span>${category.categoryName}</span>
              <span>${formatCurrency(category.totalSales)}</span>
            </div>
            <div style="font-size: 10px; color: #666;">Total Items: ${category.totalQty}</div>
          </div>
          ${itemsHtml}
        </div>
      `;
    }).join('');

    const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Day Closing - Item Breakdown</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
      padding: 0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      color: #000 !important;
    }

    @media print {
      @page {
        margin: 0;
        padding: 0;
        size: 80mm auto;
      }

      body {
        margin: 0;
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      html, body {
        height: auto;
        overflow: visible;
      }
    }

    html, body {
      margin: 0;
      padding: 0;
      height: auto;
      width: 80mm;
    }

    body {
      font-family: 'Courier New', monospace;
      max-width: 80mm;
      margin: 0 auto;
      padding: 0;
      font-size: 12px;
      line-height: 1.4;
      background: white;
      color: #000;
    }

    .header {
      text-align: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px dashed #000;
    }

    .header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: bold;
      padding: 0;
      color: #000;
    }

    .header div {
      margin: 2px 0;
      padding: 0;
      color: #000;
    }

    .section-title {
      font-weight: bold;
      margin: 10px 0 5px 0;
      padding: 0;
      text-decoration: underline;
    }

    .footer {
      text-align: center;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 2px dashed #000;
      font-size: 10px;
      padding-bottom: 0;
      color: #000;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Emperor Coffee</h1>
    <div>${data?.branchName || 'Emperor Coffee'}</div>
    <div>Day Closing - Item Breakdown</div>
  </div>

  <div style="font-size: 11px; margin-bottom: 5px;">Date: ${dateStr}</div>

  <div class="section-title">Categories</div>

  ${categoriesHtml}

  <div class="footer">
    <div>Emperor Coffee Franchise</div>
  </div>
</body>
</html>`;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  // Paper 3: Day Void & Refunds
  const printDayVoidAndRefunds = () => {
    if (!data || !data.shifts) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const dateStr = new Date(data.date).toLocaleDateString();
    const shifts = data.shifts;

    // Aggregate voided items and refunds from all shifts
    const allVoidedItems: any[] = [];
    const allRefundedOrders: any[] = [];
    let totalVoidedAmount = 0;
    let totalRefundAmount = 0;

    shifts.forEach(shift => {
      const totals = shift.totals || {};
      if (totals.voidedItems) {
        totalVoidedAmount += totals.voidedItems;
      }
      if (totals.refunds) {
        totalRefundAmount += totals.refunds;
      }
    });

    const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Day Closing - Void & Refunds</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
      padding: 0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      color: #000 !important;
    }

    @media print {
      @page {
        margin: 0;
        padding: 0;
        size: 80mm auto;
      }

      body {
        margin: 0;
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      html, body {
        height: auto;
        overflow: visible;
      }
    }

    html, body {
      margin: 0;
      padding: 0;
      height: auto;
      width: 80mm;
    }

    body {
      font-family: 'Courier New', monospace;
      max-width: 80mm;
      margin: 0 auto;
      padding: 0;
      font-size: 12px;
      line-height: 1.4;
      background: white;
      color: #000;
    }

    .header {
      text-align: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px dashed #000;
    }

    .header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: bold;
      padding: 0;
      color: #000;
    }

    .header div {
      margin: 2px 0;
      padding: 0;
      color: #000;
    }

    .section-title {
      font-weight: bold;
      margin: 10px 0 5px 0;
      padding: 0;
      text-decoration: underline;
    }

    .totals {
      border-top: 2px dashed #000;
      padding-top: 8px;
      margin-top: 5px;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      padding: 0;
    }

    .total-row span {
      color: #000 !important;
    }

    .total-row.grand-total {
      font-weight: bold;
      font-size: 14px;
      margin-top: 8px;
      padding-top: 5px;
    }

    .footer {
      text-align: center;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 2px dashed #000;
      font-size: 10px;
      padding-bottom: 0;
      color: #000;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Emperor Coffee</h1>
    <div>${data?.branchName || 'Emperor Coffee'}</div>
    <div>Day Closing - Void & Refunds</div>
  </div>

  <div style="font-size: 11px; margin-bottom: 5px;">Date: ${dateStr}</div>

  <div class="section-title">Summary</div>
  <div class="totals">
    <div class="total-row">
      <span>Total Voided Items:</span>
      <span>${formatCurrency(totalVoidedAmount)}</span>
    </div>
    <div class="total-row">
      <span>Total Refunds:</span>
      <span>${formatCurrency(totalRefundAmount)}</span>
    </div>
    <div class="total-row grand-total">
      <span>Total Voids & Refunds:</span>
      <span>${formatCurrency(totalVoidedAmount + totalRefundAmount)}</span>
    </div>
  </div>

  <div class="footer">
    <div>Emperor Coffee Franchise</div>
  </div>
</body>
</html>`;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  // Paper 4: Day Daily Expenses
  const printDayDailyExpenses = () => {
    if (!data || !data.dailyExpenses) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const dateStr = new Date(data.date).toLocaleDateString();

    const expenses = data.dailyExpenses.breakdown || [];
    
    // Group expenses by reason/category
    const expensesGrouped = new Map<string, { amount: number; count: number }>();
    expenses.forEach(exp => {
      const category = exp.reason || 'Other';
      if (!expensesGrouped.has(category)) {
        expensesGrouped.set(category, { amount: 0, count: 0 });
      }
      const grouped = expensesGrouped.get(category)!;
      grouped.amount += exp.amount;
      grouped.count += 1;
    });

    const expensesHtml = Array.from(expensesGrouped.entries()).map(([reason, data]) => `
      <div style="border-bottom: 1px dashed #000; padding: 5px 0; margin-bottom: 5px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span style="font-weight: bold;">${reason}</span>
          <span>x${data.count}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>${formatCurrency(data.amount)}</span>
        </div>
      </div>
    `).join('');

    const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Day Closing - Daily Expenses</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
      padding: 0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      color: #000 !important;
    }

    @media print {
      @page {
        margin: 0;
        padding: 0;
        size: 80mm auto;
      }

      body {
        margin: 0;
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      html, body {
        height: auto;
        overflow: visible;
      }
    }

    html, body {
      margin: 0;
      padding: 0;
      height: auto;
      width: 80mm;
    }

    body {
      font-family: 'Courier New', monospace;
      max-width: 80mm;
      margin: 0 auto;
      padding: 0;
      font-size: 12px;
      line-height: 1.4;
      background: white;
      color: #000;
    }

    .header {
      text-align: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px dashed #000;
    }

    .header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: bold;
      padding: 0;
      color: #000;
    }

    .header div {
      margin: 2px 0;
      padding: 0;
      color: #000;
    }

    .section-title {
      font-weight: bold;
      margin: 10px 0 5px 0;
      padding: 0;
      text-decoration: underline;
    }

    .totals {
      border-top: 2px dashed #000;
      padding-top: 8px;
      margin-top: 5px;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      padding: 0;
    }

    .total-row span {
      color: #000 !important;
    }

    .total-row.grand-total {
      font-weight: bold;
      font-size: 14px;
      margin-top: 8px;
      padding-top: 5px;
    }

    .footer {
      text-align: center;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 2px dashed #000;
      font-size: 10px;
      padding-bottom: 0;
      color: #000;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Emperor Coffee</h1>
    <div>${data?.branchName || 'Emperor Coffee'}</div>
    <div>Day Closing - Daily Expenses</div>
  </div>

  <div style="font-size: 11px; margin-bottom: 5px;">Date: ${dateStr}</div>

  <div class="section-title">Expense Breakdown</div>

  ${expensesHtml}

  <div class="totals">
    <div class="total-row">
      <span>Total Daily Expenses:</span>
      <span>${formatCurrency(data.dailyExpenses.total || 0)}</span>
    </div>
  </div>

  <div class="footer">
    <div>Emperor Coffee Franchise</div>
  </div>
</body>
</html>`;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const handleStandardPrint = () => {
    if (!data) return;
    window.print();
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl">
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Loading closing report...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
            <DialogDescription>
              Failed to load closing report
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>{error}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fetchClosingReport}>
              Retry
            </Button>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Day Closing Receipt
          </DialogTitle>
          <DialogDescription>
            {data.storeName} - {data.branchName} | {new Date(data.date).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <Tabs defaultValue="shifts" className="w-full flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="shifts" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Shifts ({data.shifts?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="items" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Item Summary
              </TabsTrigger>
            </TabsList>

            {/* Shift Summaries Tab */}
            <TabsContent value="shifts" className="space-y-4 flex-1 overflow-y-auto pr-2">
              {data.shifts?.map((shift, index) => (
                <ShiftSummaryCard
                  key={shift.shiftNumber}
                  shift={shift}
                  index={index}
                  totalShifts={data.shifts?.length || 1}
                />
              ))}
            </TabsContent>

            {/* Item Summary Tab */}
            <TabsContent value="items" className="flex-1 overflow-y-auto pr-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Item Breakdown
                  </CardTitle>
                  <CardDescription>
                    All items sold on {new Date(data.date).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {data.categoryBreakdown?.map((category) => (
                      <div key={category.categoryName}>
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="font-semibold">{category.categoryName}</h4>
                          <Badge variant="secondary">{formatCurrency(category.totalSales)}</Badge>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 px-2">Item</th>
                                <th className="text-right py-2 px-2">Qty</th>
                                <th className="text-right py-2 px-2">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {category.items?.map((item, idx) => (
                                <tr key={idx} className="border-b border-border/50">
                                  <td className="py-2 px-2">
                                    {item.isCustomInput && item.totalWeight !== undefined
                                      ? `وزن: ${item.totalWeight.toFixed(2)} KG ${item.itemName}`
                                      : item.itemName
                                    }
                                  </td>
                                  <td className="text-right py-2 px-2">
                                    {item.isCustomInput && item.totalWeight !== undefined
                                      ? ''
                                      : item.quantity
                                    }
                                  </td>
                                  <td className="text-right py-2 px-2">{formatCurrency(item.totalPrice)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={handlePrintPaymentSummary}
              className="flex items-center gap-2"
            >
              <DollarSign className="h-4 w-4" />
              Paper 1: Payment Summary
            </Button>
            <Button
              onClick={handlePrintItemSummary}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Paper 2: Item Breakdown
            </Button>
            <Button
              onClick={handlePrintVoidAndRefunds}
              className="flex items-center gap-2"
            >
              <AlertTriangle className="h-4 w-4" />
              Paper 3: Void & Refunds
            </Button>
            <Button
              onClick={handlePrintDailyExpenses}
              className="flex items-center gap-2"
            >
              <Users className="h-4 w-4" />
              Paper 4: Daily Expenses
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={handleStandardPrint}
            className="flex items-center gap-2 w-full"
          >
            <Printer className="h-4 w-4" />
            Print All Papers
          </Button>
          <DialogClose asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <X className="h-4 w-4" />
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ShiftSummaryCardProps {
  shift: DayClosingShiftData;
  index: number;
  totalShifts: number;
}

function ShiftSummaryCard({ shift, index, totalShifts }: ShiftSummaryCardProps) {
  const cashierName = shift.cashier?.name || shift.cashier?.username || 'Unknown';

  const totals = shift.totals || {};
  const totalSales = totals.sales || 0;
  const totalDiscounts = totals.discounts || 0;
  const totalDeliveryFees = totals.deliveryFees || 0;
  const totalRefunds = totals.refunds || 0;
  const totalCard = totals.card || 0;
  const totalInstapay = totals.instapay || 0;
  const totalWallet = totals.wallet || 0;
  const totalCash = totals.cash || 0;
  const totalDailyExpenses = totals.dailyExpenses || 0;
  const openingBalance = totals.openingCashBalance || 0;
  const expectedCash = totals.expectedCash || 0;
  const closingBalance = totals.closingCashBalance || 0;
  const overShort = totals.overShort || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Shift {shift.shiftNumber} of {totalShifts}
            </CardTitle>
            <CardDescription>
              {cashierName} | {new Date(shift.startTime).toLocaleTimeString()} - {new Date(shift.endTime).toLocaleTimeString()}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Order Type Breakdown */}
          <div className="space-y-2">
            <h4 className="font-semibold">Order Type Breakdown</h4>
            <div className="grid gap-2 md:grid-cols-3">
              <OrderTypeCard
                label="Take Away"
                value={shift.orderTypeBreakdown['take-away']?.value || 0}
                discounts={shift.orderTypeBreakdown['take-away']?.discounts || 0}
                total={shift.orderTypeBreakdown['take-away']?.total || 0}
              />
              <OrderTypeCard
                label="Dine In"
                value={shift.orderTypeBreakdown['dine-in']?.value || 0}
                discounts={shift.orderTypeBreakdown['dine-in']?.discounts || 0}
                total={shift.orderTypeBreakdown['dine-in']?.total || 0}
              />
              <OrderTypeCard
                label="Delivery"
                value={shift.orderTypeBreakdown['delivery']?.value || 0}
                discounts={shift.orderTypeBreakdown['delivery']?.discounts || 0}
                total={shift.orderTypeBreakdown['delivery']?.total || 0}
              />
            </div>
          </div>

          {/* Financial Summary */}
          <div className="space-y-2">
            <h4 className="font-semibold">Financial Summary</h4>
            <div className="grid gap-2 md:grid-cols-2">
              <SummaryRow label="Total Sales" value={totalSales} highlight />
              <SummaryRow label="Total Discounts" value={totalDiscounts} />
              <SummaryRow label="Total Delivery Fees" value={totalDeliveryFees} />
              <SummaryRow label="Total Refunds" value={totalRefunds} />
              <SummaryRow label="Total Card" value={totalCard} />
              <SummaryRow label="Total InstaPay" value={totalInstapay} />
              <SummaryRow label="Total Wallet" value={totalWallet} />
              <SummaryRow label="Total Cash" value={totalCash} highlight />
              <SummaryRow label="Total Daily Expenses" value={totalDailyExpenses} variant="negative" />
              <SummaryRow label="Opening Cash" value={openingBalance} />
              <SummaryRow label="Expected Cash" value={expectedCash} highlight />
              <SummaryRow label="Closing Cash" value={closingBalance} />
              <SummaryRow
                label="Over/Short"
                value={overShort}
                variant={overShort < 0 ? 'negative' : overShort > 0 ? 'positive' : 'neutral'}
                highlight
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface OrderTypeCardProps {
  label: string;
  value: number;
  discounts: number;
  total: number;
}

function OrderTypeCard({ label, value, discounts, total }: OrderTypeCardProps) {
  return (
    <div className="rounded-lg border p-3">
      <h5 className="font-medium text-sm mb-2">{label}</h5>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Value:</span>
          <span>{formatCurrency(value)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Discounts:</span>
          <span className="text-destructive">-{formatCurrency(discounts)}</span>
        </div>
        <div className="flex justify-between font-semibold pt-1 border-t">
          <span>Total:</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: number;
  variant?: 'positive' | 'negative' | 'neutral';
  highlight?: boolean;
}

function SummaryRow({ label, value, variant = 'neutral', highlight }: SummaryRowProps) {
  const valueColor = variant === 'positive' ? 'text-green-600' : variant === 'negative' ? 'text-red-600' : '';

  return (
    <div className={`flex justify-between py-1 ${highlight ? 'font-semibold bg-muted/50 px-2 rounded' : ''}`}>
      <span>{label}:</span>
      <span className={valueColor}>{formatCurrency(value)}</span>
    </div>
  );
}
