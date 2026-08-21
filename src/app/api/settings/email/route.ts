import { NextResponse } from 'next/server';
import { sendShiftReport, type ShiftClosingReportPayload } from '@/lib/email';

/**
 * POST /api/settings/email/test
 * Test email configuration by sending a sample shift report with all 4 papers
 */
export async function POST() {
  try {
    const reportEmail = process.env.SHIFT_REPORT_EMAIL;
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;

    // Check if email is configured
    if (!reportEmail || !reportEmail.trim()) {
      return NextResponse.json({
        success: false,
        error: 'SHIFT_REPORT_EMAIL is not configured in environment variables',
        configured: false,
        smtpConfigured: !!(smtpHost && smtpUser),
      }, { status: 400 });
    }

    if (!smtpHost || !smtpUser) {
      return NextResponse.json({
        success: false,
        error: 'SMTP is not configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS',
        configured: false,
        smtpConfigured: false,
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

    // Build a realistic test report that exercises all 4 papers
    const testReport: ShiftClosingReportPayload = {
      shift: {
        id: 'test-shift-id',
        shiftNumber: 7,
        startTime: oneHourAgo,
        endTime: now,
        cashier: { id: 'u1', name: 'Test Cashier', username: 'testcashier' },
        branch: { id: 'b1', branchName: 'Test Branch' },
        openingCash: 1000,
        closingCash: 3250,
        openingOrders: 12,
        closingOrders: 37,
        openingRevenue: 1800,
        closingRevenue: 2500,
        notes: 'Test shift — all 4 papers included',
      },
      paymentSummary: {
        cash: 1850,
        card: 350,
        instapay: 180,
        wallet: 70,
        other: 0,
        total: 2450,
      },
      orderTypeBreakdown: {
        'take-away': { value: 900, discounts: 50, count: 15, total: 850 },
        'dine-in':   { value: 1100, discounts: 100, count: 18, total: 1000 },
        delivery:    { value: 600, discounts: 0, count: 4, total: 600 },
      },
      totals: {
        sales: 2600,
        discounts: 150,
        deliveryFees: 80,
        refunds: 120,
        voidedItems: 30,
        loyaltyDiscounts: 50,
        promoDiscounts: 100,
        card: 350,
        instapay: 180,
        wallet: 70,
        cash: 1850,
        dailyExpenses: 200,
        openingCashBalance: 1000,
        expectedCash: 2650,
        closingCashBalance: 3250,
        overShort: 600,
      },
      categoryBreakdown: [
        {
          categoryName: 'Hot Drinks',
          totalSales: 1400,
          items: [
            { itemId: 'i1', itemName: 'Espresso', quantity: 20, totalPrice: 800 },
            { itemId: 'i2', itemName: 'Cappuccino', quantity: 10, totalPrice: 500 },
            { itemId: 'i3', itemName: 'Latte', quantity: 5, totalPrice: 100 },
          ],
        },
        {
          categoryName: 'Cold Drinks',
          totalSales: 600,
          items: [
            { itemId: 'i4', itemName: 'Iced Americano', quantity: 8, totalPrice: 400 },
            { itemId: 'i5', itemName: 'Mojito', quantity: 4, totalPrice: 200 },
          ],
        },
        {
          categoryName: 'Pastries',
          totalSales: 450,
          items: [
            { itemId: 'i6', itemName: 'Croissant', quantity: 6, totalPrice: 270 },
            { itemId: 'i7', itemName: 'Chocolate Muffin', quantity: 4, totalPrice: 180 },
          ],
        },
      ],
      voidedItems: [
        {
          id: 'v1',
          itemName: 'Espresso',
          voidedQuantity: 2,
          unitPrice: 40,
          voidedSubtotal: 80,
          reason: 'Wrong order',
          voidedBy: 'testcashier',
          voidedAt: now,
          orderNumber: 15,
          orderTimestamp: oneHourAgo,
        },
      ],
      refundedOrders: [
        {
          id: 'r1',
          orderNumber: 8,
          orderTimestamp: oneHourAgo,
          refundAmount: 120,
          refundReason: 'Customer changed mind',
          refundedAt: now,
          paymentMethod: 'Cash',
        },
      ],
      dailyExpenses: [
        {
          id: 'e1',
          amount: 150,
          reason: 'Milk restock',
          category: 'INVENTORY',
          ingredientId: 'ing1',
          quantity: 10,
          quantityUnit: 'L',
          unitPrice: 15,
          createdAt: now,
          recorder: { id: 'u1', name: 'Test Cashier', username: 'testcashier' },
          ingredient: { id: 'ing1', name: 'Full Cream Milk' },
        },
        {
          id: 'e2',
          amount: 50,
          reason: 'Cleaning supplies',
          category: 'OTHER',
          ingredientId: null,
          quantity: null,
          quantityUnit: null,
          unitPrice: null,
          createdAt: now,
          recorder: { id: 'u1', name: 'Test Cashier', username: 'testcashier' },
          ingredient: null,
        },
      ],
    };

    const success = await sendShiftReport(reportEmail.trim(), testReport);

    if (success) {
      return NextResponse.json({
        success: true,
        message: `Test email sent successfully to ${reportEmail}`,
        configured: true,
        smtpConfigured: true,
        reportEmail: reportEmail,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to send test email. Check SMTP credentials and network.',
        configured: true,
        smtpConfigured: true,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[Settings/Email/Test] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to send test email',
    }, { status: 500 });
  }
}

/**
 * GET /api/settings/email/status
 * Check if email is configured
 */
export async function GET() {
  const reportEmail = process.env.SHIFT_REPORT_EMAIL;
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  return NextResponse.json({
    success: true,
    configured: !!(reportEmail && smtpHost && smtpUser && smtpPass),
    reportEmail: reportEmail ? `${reportEmail.substring(0, 3)}***${reportEmail.split('@')[1]}` : null,
    smtpConfigured: !!(smtpHost && smtpUser),
    smtpHost: smtpHost || null,
    smtpFrom: process.env.SMTP_FROM || 'noreply@yourpos.com',
  });
}