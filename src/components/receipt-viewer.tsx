'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Printer, Download, Search, Receipt, X, FileText, Usb } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import { getPrinter, WebUSBPrinter } from '@/lib/webusb-printer';
import { generateReceiptESCPOS, ReceiptData } from '@/lib/escpos-encoder';

// Helper function to format variant display with weight in grams
function formatVariantDisplay(item: OrderItem): string {
  if (!item.variantName || !item.customVariantValue) {
    return item.variantName || (item.menuItemVariant?.variantOption?.name || '');
  }

  // If it's a custom variant (has multiplier), format it nicely
  const multiplier = item.customVariantValue;
  
  // Round multiplier to 3 decimal places for display
  const roundedMultiplier = Math.round(multiplier * 1000) / 1000;
  
  // Calculate weight in grams (assuming base is 1kg = 1000g)
  const weightInGrams = Math.round(multiplier * 1000);
  
  // Extract the variant type name (before the colon)
  const variantTypeName = item.variantName.split(':')[0]?.trim() || '';
  
  // Check if it's price mode (contains "EGP") or weight mode (contains "x")
  const isPriceMode = item.variantName.includes('EGP');
  
  if (isPriceMode) {
    // For price mode, show just the weight
    return `${weightInGrams}g`;
  } else {
    // For weight mode, show rounded multiplier with weight
    return `${roundedMultiplier}x (${weightInGrams}g)`;
  }
}

interface OrderItem {
  id: string;
  menuItemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  recipeVersion: number;
  createdAt: string;
  specialInstructions?: string | null;
  variantName?: string | null;
  customVariantValue?: number | null;
  menuItemVariant?: {
    id: string;
    variantOption?: {
      name: string;
    };
  } | null;
}

interface Order {
  id: string;
  branchId: string;
  orderNumber: number;
  orderTimestamp: string;
  cashierId: string;
  cashier?: {
    id: string;
    username: string;
    name?: string;
  };
  totalAmount: number;
  subtotal?: number;
  paymentMethod: string;
  paymentMethodDetail?: 'CARD' | 'INSTAPAY' | 'MOBILE_WALLET' | null;
  orderType?: string;
  deliveryFee?: number;
  deliveryAddress?: string;
  deliveryAreaId?: string;
  isRefunded: boolean;
  refundReason?: string;
  transactionHash: string;
  synced: boolean;
  shiftId?: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  branch?: {
    id: string;
    branchName: string;
    phone?: string | null;
    address?: string | null;
  };
  customerPhone?: string;
  customerName?: string;
  loyaltyPointsRedeemed?: number | null;
  loyaltyDiscount?: number | null;
  promoCodeId?: string | null;
  promoCode?: string;
  promoDiscount?: number | null;
  manualDiscountPercent?: number | null;
  manualDiscountAmount?: number | null;
  manualDiscountComment?: string | null;
  cardReferenceNumber?: string | null;
}

interface ReceiptViewerProps {
  open: boolean;
  onClose: () => void;
  order?: Order | null;
  autoPrint?: boolean; // Auto-print when dialog opens
  isDuplicate?: boolean; // Mark as duplicate receipt reprint
}

export function ReceiptViewer({ open, onClose, order, autoPrint, isDuplicate }: ReceiptViewerProps) {
  const { currency, t } = useI18n();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState<any>(null);
  const [hasAutoPrinted, setHasAutoPrinted] = useState(false);
  const [thermalPrinterConnected, setThermalPrinterConnected] = useState(false);

  // Fetch receipt settings from database (centralized storage)
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Try to fetch from API first
        const response = await fetch('/api/receipt-settings');
        const data = await response.json();
        if (response.ok && data.success && data.settings) {
          setReceiptSettings(data.settings);
          console.log('[Receipt Viewer] Receipt settings loaded from database:', {
            storeName: data.settings.storeName,
            hasLogo: !!data.settings.logoData,
          });
        }
      } catch (error) {
        console.error('[Receipt Viewer] Failed to fetch from API, trying offline cache:', error);

        // If API fails, try to load from IndexedDB (offline cache)
        try {
          if (typeof window !== 'undefined' && window.indexedDB) {
            const request = indexedDB.open('EmperorCoffeePOS', 4);
            request.onsuccess = async (event) => {
              try {
                const db = (event.target as IDBOpenDBRequest).result;
                const transaction = db.transaction('receipt_settings', 'readonly');
                const store = transaction.objectStore('receipt_settings');
                const getRequest = store.get('default');

                getRequest.onsuccess = () => {
                  const settings = getRequest.result;
                  if (settings) {
                    setReceiptSettings(settings);
                    console.log('[Receipt Viewer] Receipt settings loaded from offline cache:', {
                      storeName: settings.storeName,
                      hasLogo: !!settings.logoData,
                    });
                  }
                };
              } catch (err) {
                console.error('[Receipt Viewer] Failed to load offline settings:', err);
              }
            };
          }
        } catch (err) {
          console.error('[Receipt Viewer] Failed to access IndexedDB:', err);
        }
      }
    };

    fetchSettings();
  }, []);

  // Check if thermal printer is connected
  useEffect(() => {
    const checkPrinter = () => {
      try {
        const printer = getPrinter();
        setThermalPrinterConnected(printer.isConnected());
      } catch (error) {
        setThermalPrinterConnected(false);
      }
    };

    checkPrinter();
    // Check periodically
    const interval = setInterval(checkPrinter, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleThermalPrint = async () => {
    if (!order) return;

    try {
      const printer = getPrinter();

      // Prepare receipt data for ESC/POS
      const receiptData: ReceiptData = {
        storeName: receiptSettings?.storeName || 'Emperor Coffee',
        branchName: order.branch?.branchName || receiptSettings?.branchName || 'Coffee Shop',
        branchPhone: order.branch?.phone || undefined,
        branchAddress: order.branch?.address || undefined,
        orderNumber: order.orderNumber,
        date: new Date(order.orderTimestamp),
        cashier: order.cashier?.name || order.cashier?.username || 'Unknown',
        orderType: order.orderType,
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        deliveryAddress: order.deliveryAddress,
        items: order.items.map(item => {
          const variantDisplay = formatVariantDisplay(item);
          const itemName = variantDisplay
            ? `${item.itemName} (${variantDisplay})`
            : item.itemName;
          return {
            itemName,
            quantity: item.quantity,
            subtotal: item.subtotal,
            price: item.unitPrice,
            note: item.specialInstructions || undefined,
          };
        }),
        subtotal: order.subtotal || 0,
        deliveryFee: order.deliveryFee || 0,
        loyaltyDiscount: order.loyaltyDiscount || 0,
        loyaltyPointsRedeemed: order.loyaltyPointsRedeemed || 0,
        promoDiscount: order.promoDiscount || 0,
        promoCode: order.promoCode,
        manualDiscountPercent: order.manualDiscountPercent || 0,
        manualDiscountAmount: order.manualDiscountAmount || 0,
        manualDiscountComment: order.manualDiscountComment || null,
        total: order.totalAmount,
        paymentMethod: order.paymentMethod as 'cash' | 'card',
        paymentMethodDetail: order.paymentMethodDetail as 'CARD' | 'INSTAPAY' | 'MOBILE_WALLET' | null,
        cardReferenceNumber: order.cardReferenceNumber || undefined,
        isRefunded: order.isRefunded,
        refundReason: order.refundReason,
        headerText: receiptSettings?.headerText,
        footerText: receiptSettings?.footerText,
        thankYouMessage: receiptSettings?.thankYouMessage,
        fontSize: receiptSettings?.fontSize,
        showLogo: receiptSettings?.showLogo,
        showCashier: receiptSettings?.showCashier,
        showDateTime: receiptSettings?.showDateTime,
        showOrderType: receiptSettings?.showOrderType,
        showCustomerInfo: receiptSettings?.showCustomerInfo,
        showBranchPhone: receiptSettings?.showBranchPhone ?? true,
        showBranchAddress: receiptSettings?.showBranchAddress ?? true,
        openCashDrawer: receiptSettings?.openCashDrawer,
        cutPaper: receiptSettings?.cutPaper,
        cutType: receiptSettings?.cutType as 'full' | 'partial',
        logoData: receiptSettings?.logoData,
      };

      // Generate ESC/POS data
      const escposData = generateReceiptESCPOS(receiptData);

      // Send to printer
      await printer.print(escposData);

      console.log('Receipt printed to thermal printer');
      return true;
    } catch (error) {
      console.error('Failed to print to thermal printer:', error);
      // Fall back to standard print
      handleStandardPrint();
      return false;
    }
  };

  const handleStandardPrint = () => {
    if (receiptRef.current) {
      const printContent = receiptRef.current.innerHTML;

      // Map font size to CSS font size
      const getFontSize = (size?: 'small' | 'medium' | 'large') => {
        switch (size) {
          case 'small':
            return '10px';
          case 'medium':
            return '12px';
          case 'large':
            return '14px';
          default:
            return '12px';
        }
      };

      const baseFontSize = getFontSize(receiptSettings?.fontSize);

      const printWindow = window.open('', '', 'width=400,height=800');

      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Receipt #${order?.orderNumber}</title>
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

                /* Hide browser print headers/footers */
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
                font-size: ${baseFontSize};
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
                font-size: calc(${baseFontSize} * 1.5);
                font-weight: bold;
                padding: 0;
                color: #000;
              }

              .header div {
                margin: 2px 0;
                padding: 0;
                color: #000;
              }

              .info {
                margin-bottom: 10px;
                font-size: ${baseFontSize};
                padding: 0;
              }

              .info div {
                margin: 2px 0;
                padding: 0;
                color: #000;
              }

              .items {
                margin-bottom: 10px;
                padding: 0;
              }

              /* Table Styles */
              .item-table-header {
                display: flex;
                justify-content: space-between;
                font-weight: bold;
                margin-bottom: 5px;
                border-bottom: 1px solid #000;
                padding-bottom: 3px;
              }

              .item-table-header .col-name {
                flex: 1;
                text-align: left;
              }

              .item-table-header .col-qty {
                flex: 0 0 30px;
                text-align: center;
              }

              .item-table-header .col-price {
                flex: 0 0 50px;
                text-align: right;
              }

              .item-table-header .col-total {
                flex: 0 0 55px;
                text-align: right;
              }

              .item-table-divider {
                border-bottom: 1px dashed #000;
                margin-bottom: 5px;
              }

              .item-row {
                display: flex;
                justify-content: space-between;
                margin: 2px 0;
                padding: 0;
              }

              .item-row .col-name {
                flex: 1;
                text-align: left;
              }

              .item-row .col-qty {
                flex: 0 0 30px;
                text-align: center;
              }

              .item-row .col-price {
                flex: 0 0 50px;
                text-align: right;
              }

              .item-row .col-total {
                flex: 0 0 55px;
                text-align: right;
              }

              .item-note {
                font-size: 10px;
                color: #000 !important;
                padding-left: 2px;
                margin-top: 2px;
                font-style: italic;
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
                font-size: calc(${baseFontSize} * 1.17);
                margin-top: 8px;
                padding-top: 5px;
              }

              .footer {
                text-align: center;
                margin-top: 10px;
                padding-top: 8px;
                border-top: 2px dashed #000;
                font-size: ${baseFontSize};
                padding-bottom: 0;
                color: #000;
              }

              .refunded {
                color: #000 !important;
                font-weight: bold;
                text-align: center;
                padding: 8px;
                border: 2px solid #000;
                margin: 8px 0;
              }
            </style>
          </head>
          <body>
            ${printContent}
          </body>
          </html>
        `);

        printWindow.document.close();

        // Wait a moment for styles to apply, then print
        setTimeout(() => {
          printWindow.print();
          // Close the window after printing (optional, can comment out)
          // printWindow.close();
        }, 250);
      }
    }
  };

  const printCaptainReceiptStandard = () => {
    if (!order) return;

    // Filter items that require captain receipt
    const captainReceiptItems = (order.items || []).filter((item: any) => item.requiresCaptainReceipt === true);

    console.log('[Captain Receipt] Items requiring captain receipt:', captainReceiptItems.length);

    if (captainReceiptItems.length === 0) {
      console.log('[Captain Receipt] No items require captain receipt, skipping');
      return;
    }

    console.log('[Captain Receipt] Printing captain receipt with standard print...');

    const baseFontSize = '12px';
    const dateStr = new Date(order.orderTimestamp).toLocaleDateString();
    const timeStr = new Date(order.orderTimestamp).toLocaleTimeString();

    let itemsHtml = '';
    captainReceiptItems.forEach((item: any) => {
      // Extract variant name if present (format: "Size: Small" -> "Small")
      let displayName = item.itemName;
      if (item.variantName) {
        const variantOption = item.variantName.includes(': ') ? item.variantName.split(': ')[1] : item.variantName;
        displayName = `${item.itemName} (${variantOption})`;
      }

      itemsHtml += `
        <div style="margin-bottom: 8px;">
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${item.quantity}x ${displayName}</div>
          ${item.categoryName ? `<div style="font-size: 10px; color: #666;">(${item.categoryName})</div>` : ''}
        </div>
      `;
    });

    const captainReceiptContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Captain Receipt #${order.orderNumber}</title>
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
            padding: 10px;
            font-size: ${baseFontSize};
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
          .info {
            margin-bottom: 10px;
            font-size: 12px;
            padding: 0;
          }
          .info div {
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
          <div>${receiptSettings?.storeName || 'Emperor Coffee'}</div>
          ${order.branch?.branchName ? `<div>${order.branch.branchName}</div>` : ''}
          <div>Captain Order #${order.orderNumber}</div>
        </div>
        <div class="info">
          <div>Date: ${dateStr}</div>
          <div>Time: ${timeStr}</div>
        </div>
        <div style="border-top: 2px dashed #000; margin: 10px 0;"></div>
        <div style="font-weight: bold; margin: 10px 0 5px 0; text-decoration: underline;">PREPARATION ORDER</div>
        ${itemsHtml}
        <div class="footer">
          <div>--- BARISTA TICKET ---</div>
        </div>
      </body>
      </html>
    `;

    const captainPrintWindow = window.open('', '_blank', 'width=400,height=600');
    if (captainPrintWindow) {
      captainPrintWindow.document.write(captainReceiptContent);
      captainPrintWindow.document.close();
      setTimeout(() => {
        captainPrintWindow.print();
      }, 250);
    }
  };

  const handleDownload = () => {
    if (!order) return;

    const receiptContent = receiptRef.current?.innerHTML;
    if (!receiptContent) return;

    const blob = new Blob([receiptContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt-${order.orderNumber}-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Main print function - tries thermal first, falls back to standard
  const handlePrint = async () => {
    console.log('[Receipt] handlePrint called');
    console.log('[Receipt] thermalPrinterConnected:', thermalPrinterConnected);
    console.log('[Receipt] Order ID:', order?.id);
    console.log('[Receipt] Order items:', order?.items);

    // Log each item's requiresCaptainReceipt status
    if (order?.items) {
      order.items.forEach((item: any, idx: number) => {
        console.log(`[Receipt] Item ${idx}: ${item.itemName}, requiresCaptainReceipt:`, item.requiresCaptainReceipt);
      });
    }

    // Try thermal printing if printer is connected
    if (thermalPrinterConnected) {
      console.log('Using thermal printer...');
      try {
        // Check if this is an offline order (temp ID or synced flag is false)
        const isOfflineOrder = order?.id?.startsWith('temp-') || order?.synced === false;

        if (isOfflineOrder) {
          console.log('[Receipt] Printing offline order using client-side generation...');
          // Use offline printing function for offline orders
          const { printOrderReceiptsFromData } = await import('@/lib/webusb-printer');
          await printOrderReceiptsFromData(order, receiptSettings);
        } else {
          console.log('[Receipt] Printing online order using API...');
          // Use API for online orders
          const { printOrderReceipts } = await import('@/lib/webusb-printer');
          await printOrderReceipts(order.id);
        }
        return;
      } catch (error) {
        console.error('Thermal print failed, falling back to standard:', error);
      }
    } else {
      console.log('[Receipt] Thermal printer not connected, using standard print');
    }

    // Fall back to standard print
    console.log('Using standard print...');
    handleStandardPrint();

    // Also print captain receipt if any items require it (for standard print users)
    const captainReceiptItems = order?.items?.filter((item: any) => item.requiresCaptainReceipt === true);
    if (captainReceiptItems && captainReceiptItems.length > 0) {
      console.log('[Receipt] Printing captain receipt with standard print...');
      setTimeout(() => {
        printCaptainReceiptStandard();
      }, 500); // Small delay between receipts
    }
  };

  // Auto-print when dialog opens with autoPrint enabled
  useEffect(() => {
    if (open && autoPrint && !hasAutoPrinted && order) {
      // Small delay to ensure the receipt content is rendered
      const timer = setTimeout(() => {
        handlePrint();
        setHasAutoPrinted(true);
      }, 500);
      return () => clearTimeout(timer);
    }
    // Reset auto-printed flag when dialog closes (wrapped in setTimeout to avoid linter warning)
    if (!open && hasAutoPrinted) {
      const resetTimer = setTimeout(() => {
        setHasAutoPrinted(false);
      }, 0);
      return () => clearTimeout(resetTimer);
    }
  }, [open, autoPrint, hasAutoPrinted, order]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <DialogTitle>Receipt #{order.orderNumber}</DialogTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Receipt Preview */}
          <Card>
            <CardContent className="pt-6">
              <div ref={receiptRef} className="bg-white p-6 border-2 border-slate-200">
                <style>{`
                  .item-table-header {
                    display: flex;
                    justify-content: space-between;
                    font-weight: bold;
                    margin-bottom: 5px;
                    border-bottom: 1px solid #000;
                    padding-bottom: 3px;
                    color: #000 !important;
                  }
                  .item-table-header .col-name {
                    flex: 1;
                    text-align: left;
                  }
                  .item-table-header .col-qty {
                    flex: 0 0 30px;
                    text-align: center;
                  }
                  .item-table-header .col-price {
                    flex: 0 0 50px;
                    text-align: right;
                  }
                  .item-table-header .col-total {
                    flex: 0 0 55px;
                    text-align: right;
                  }
                  .item-table-divider {
                    border-bottom: 1px dashed #000;
                    margin-bottom: 5px;
                  }
                  .item-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 2px 0;
                    color: #000 !important;
                  }
                  .item-row .col-name {
                    flex: 1;
                    text-align: left;
                  }
                  .item-row .col-qty {
                    flex: 0 0 30px;
                    text-align: center;
                  }
                  .item-row .col-price {
                    flex: 0 0 50px;
                    text-align: right;
                  }
                  .item-row .col-total {
                    flex: 0 0 55px;
                    text-align: right;
                  }
                  .item-note {
                    font-size: 11px;
                    color: #64748b;
                    padding-left: 4px;
                    margin-top: 2px;
                    font-style: italic;
                  }
                  .refunded {
                    color: #000 !important;
                  }
                  .total-row {
                    color: #000 !important;
                  }
                `}</style>
                <div className="header">
                  {/* Logo */}
                  {receiptSettings?.showLogo && (
                    <div className="mb-2">
                      {receiptSettings.logoData ? (
                        <img
                          src={receiptSettings.logoData}
                          alt="Logo"
                          style={{ maxWidth: '240px', maxHeight: '120px', objectFit: 'contain' }}
                        />
                      ) : (
                        <div className="text-4xl">☕</div>
                      )}
                    </div>
                  )}
                  <h1>{receiptSettings?.storeName || 'Emperor Coffee'}</h1>
                  <div>
                    {order.branch?.branchName || receiptSettings?.branchName || 'Coffee Shop'}
                    {!order.branch?.branchName && receiptSettings?.branchName && ' (default)'}
                  </div>
                  {receiptSettings?.showBranchPhone !== false && order.branch?.phone && (
                    <div className="text-sm">{order.branch.phone}</div>
                  )}
                  {receiptSettings?.showBranchAddress !== false && order.branch?.address && (
                    <div className="text-sm">{order.branch.address}</div>
                  )}
                  {receiptSettings?.headerText && (
                    <div className="text-xs text-slate-600">{receiptSettings.headerText}</div>
                  )}
                  <div>Receipt #{order.orderNumber}</div>
                </div>

                {isDuplicate && (
                  <div className="text-center text-xs font-bold bg-amber-100 text-amber-900 py-2 rounded">
                    *** DUPLICATE ***
                  </div>
                )}

                {order.isRefunded && (
                  <div className="refunded">
                    *** REFUNDED ***
                    {order.refundReason && <div>Reason: {order.refundReason}</div>}
                  </div>
                )}

                <div className="info">
                  {receiptSettings?.showDateTime !== false && (
                    <div>Date: {formatDate(order.orderTimestamp)} {formatTime(order.orderTimestamp)}</div>
                  )}
                  {receiptSettings?.showCashier !== false && (
                    <div>Cashier: {order.cashier?.name || order.cashier?.username}</div>
                  )}
                  {receiptSettings?.showOrderType !== false && order.orderType && (
                    <div>Type: {order.orderType === 'dine-in' ? 'Dine In' : order.orderType === 'take-away' ? 'Take Away' : 'Delivery'}</div>
                  )}
                  {receiptSettings?.showCustomerInfo !== false && order.customerPhone && <div>Phone: {order.customerPhone}</div>}
                  {receiptSettings?.showCustomerInfo !== false && order.customerName && <div>Customer: {order.customerName}</div>}
                </div>

                {order.orderType === 'delivery' && order.deliveryAddress && (
                  <div className="info" style={{ marginTop: '10px', borderTop: '1px dashed #000', paddingTop: '10px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Delivery Details:</div>
                    <div>{order.deliveryAddress}</div>
                  </div>
                )}

                <div className="items">
                  {/* Table Header */}
                  <div className="item-table-header">
                    <span className="col-name">Name</span>
                    <span className="col-qty">Qty</span>
                    <span className="col-price">Price</span>
                    <span className="col-total">Total</span>
                  </div>
                  {/* Table Header Divider */}
                  <div className="item-table-divider"></div>
                  {/* Items */}
                  {order?.items && order.items.map((item) => {
                    const variantDisplay = formatVariantDisplay(item);
                    return (
                      <div key={item.id}>
                        <div className="item-row">
                          <span className="col-name">
                            {item.itemName}
                            {variantDisplay && (
                              <span className="text-xs font-normal text-slate-600 dark:text-slate-400 ml-1">
                                ({variantDisplay})
                              </span>
                            )}
                          </span>
                          <span className="col-qty">{item.quantity}</span>
                          <span className="col-price">{formatCurrency(item.unitPrice, currency)}</span>
                          <span className="col-total">{formatCurrency(item.subtotal, currency)}</span>
                        </div>
                        {item.specialInstructions && (
                          <div className="item-note">
                            {item.specialInstructions}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="totals">
                  {order.subtotal != null && order.subtotal > 0 && (
                    <div className="total-row">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(order.subtotal, currency)}</span>
                    </div>
                  )}
                  {order.deliveryFee != null && order.deliveryFee > 0 && (
                    <div className="total-row">
                      <span>Delivery Fee:</span>
                      <span>{formatCurrency(order.deliveryFee, currency)}</span>
                    </div>
                  )}
                  {order.loyaltyPointsRedeemed != null && order.loyaltyPointsRedeemed > 0 && order.loyaltyDiscount != null && order.loyaltyDiscount > 0 && (
                    <div className="total-row">
                      <span>Loyalty Discount ({order.loyaltyPointsRedeemed} pts):</span>
                      <span>-{formatCurrency(order.loyaltyDiscount, currency)}</span>
                    </div>
                  )}
                  {order.promoCode != null && order.promoDiscount != null && order.promoDiscount > 0 && (
                    <div className="total-row">
                      <span>Promo Code ({order.promoCode}):</span>
                      <span>-{formatCurrency(order.promoDiscount, currency)}</span>
                    </div>
                  )}
                  {/* Manual Discount */}
                  {(order.manualDiscountPercent != null && order.manualDiscountPercent > 0) ||
                   (order.manualDiscountAmount != null && order.manualDiscountAmount > 0) ? (
                    <>
                      <div className="total-row" style={{ color: '#dc2626' }}>
                        <span>
                          {order.manualDiscountPercent > 0
                            ? `Manual Discount (${order.manualDiscountPercent}%):`
                            : 'Manual Discount:'}
                        </span>
                        <span>-{formatCurrency(order.manualDiscountAmount || 0, currency)}</span>
                      </div>
                      {order.manualDiscountComment && (
                        <div className="text-xs text-slate-600" style={{ marginLeft: '4px', marginTop: '2px', fontStyle: 'italic' }}>
                          Discount Note: "{order.manualDiscountComment}"
                        </div>
                      )}
                    </>
                  ) : null}
                  <div className="total-row grand-total">
                    <span>TOTAL:</span>
                    <span>{formatCurrency(order.totalAmount, currency)}</span>
                  </div>
                  <div className="total-row">
                    <span>Payment:</span>
                    <span>
                      {order.paymentMethod === 'cash' ? 'Cash' : 
                       order.paymentMethodDetail === 'INSTAPAY' ? 'InstaPay' :
                       order.paymentMethodDetail === 'MOBILE_WALLET' ? 'Mobile Wallet' :
                       'Card'}
                    </span>
                  </div>
                  {(order.paymentMethod === 'card' || order.paymentMethodDetail) && order.cardReferenceNumber && (
                    <div className="total-row">
                      <span>Ref. No:</span>
                      <span className="text-xs">{order.cardReferenceNumber}</span>
                    </div>
                  )}
                </div>

                <div className="footer">
                  <div>{receiptSettings?.thankYouMessage || 'Thank you for your purchase!'}</div>
                  {receiptSettings?.footerText && <div>{receiptSettings.footerText}</div>}
                  <div>{receiptSettings?.storeName || 'Emperor Coffee'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Printer Status */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {thermalPrinterConnected ? (
                  <>
                    <Usb className="h-4 w-4 text-emerald-600" />
                    <span className="text-emerald-600 font-medium">Thermal Printer Connected</span>
                  </>
                ) : (
                  <>
                    <Usb className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-500">Thermal Printer: Not Connected</span>
                  </>
                )}
              </div>
              {!thermalPrinterConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const printer = getPrinter();
                      await printer.requestDevice();
                      await printer.connect();
                      setThermalPrinterConnected(true);
                      alert('Printer connected successfully!');
                    } catch (error: any) {
                      alert(error.message || 'Failed to connect to printer');
                    }
                  }}
                >
                  <Usb className="h-3 w-3 mr-1" />
                  Connect
                </Button>
              )}
            </div>

            {/* Print Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                onClick={handlePrint}
                className="flex-1"
                size="lg"
              >
                <Printer className="h-4 w-4 mr-2" />
                {thermalPrinterConnected ? 'Print to Thermal' : 'Standard Print'}
              </Button>
              <Button onClick={handleDownload} variant="outline" size="lg">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ReceiptSearchProps {
  onOrderSelect: (order: Order) => void;
}

export function ReceiptSearch({ onOrderSelect }: ReceiptSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const { currency, t } = useI18n();

  useEffect(() => {
    if (searchQuery.length >= 3) {
      searchOrders();
    } else {
      setOrders([]);
    }
  }, [searchQuery]);

  const searchOrders = async () => {
    setLoading(true);
    try {
      // In production, fetch from API
      // const response = await fetch(`/api/orders?search=${searchQuery}`);
      // const data = await response.json();
      // setOrders(data.orders);

      // For now, use sample data
      const sampleOrders: Order[] = [
        {
          id: '1',
          branchId: 'cml46do4q0000ob5g27krklqe',
          orderNumber: 1,
          orderTimestamp: new Date(Date.now() - 3600000).toISOString(),
          cashierId: 'cashier1',
          cashier: { id: 'cashier1', username: 'cashier1', name: 'Jane Doe' },
          subtotal: 13.60,
          totalAmount: 15.50,
          paymentMethod: 'card',
          isRefunded: false,
          transactionHash: 'abc123',
          synced: true,
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
          items: [
            {
              id: '1',
              menuItemId: 'item1',
              itemName: 'Cappuccino',
              quantity: 2,
              unitPrice: 4.50,
              subtotal: 9.00,
              recipeVersion: 1,
              createdAt: new Date(Date.now() - 3600000).toISOString(),
            },
            {
              id: '2',
              menuItemId: 'item2',
              itemName: 'Latte',
              quantity: 1,
              unitPrice: 4.60,
              subtotal: 4.60,
              recipeVersion: 1,
              createdAt: new Date(Date.now() - 3600000).toISOString(),
            },
          ],
          branch: { id: 'cml46do4q0000ob5g27krklqe', branchName: 'Downtown' },
        },
      ];

      const filtered = sampleOrders.filter(
        (order) =>
          order.orderNumber.toString().includes(searchQuery) ||
          order.transactionHash.includes(searchQuery)
      );

      setOrders(filtered);
    } catch (error) {
      console.error('Failed to search orders:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Receipt Search
        </CardTitle>
        <CardDescription>
          Search for orders to view and print receipts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by order number or transaction ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
        )}

        {!loading && searchQuery.length >= 3 && orders.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            No orders found matching "{searchQuery}"
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => onOrderSelect(order)}
                className="p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-primary" />
                    <span className="font-semibold">Order #{order.orderNumber}</span>
                  </div>
                  <span className="text-sm text-slate-500">
                    {formatDate(order.orderTimestamp)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">
                      {order.cashier?.name || order.cashier?.username}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600">
                      {order.branch?.branchName}
                    </span>
                  </div>
                  <span className="font-semibold">
                    {formatCurrency(order.totalAmount, currency)}
                  </span>
                </div>
                {order.isRefunded && (
                  <div className="mt-2 text-sm text-red-600 font-medium">
                    Refunded: {order.refundReason || 'No reason provided'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && searchQuery.length > 0 && searchQuery.length < 3 && (
          <div className="text-center py-8 text-slate-400">
            Type at least 3 characters to search
          </div>
        )}
      </CardContent>
    </Card>
  );
}
