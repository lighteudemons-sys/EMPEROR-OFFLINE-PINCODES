import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// Types – mirrors the closing-report API response exactly
// ---------------------------------------------------------------------------

export interface ShiftClosingReportPayload {
  shift: {
    id: string;
    shiftNumber: number;
    startTime: string;
    endTime: string;
    cashier: { id: string; name: string | null; username: string };
    branch: { id: string; branchName: string };
    openingCash: number;
    closingCash: number | null;
    openingOrders: number;
    closingOrders: number | null;
    openingRevenue: number;
    closingRevenue: number | null;
    notes?: string | null;
  };
  paymentSummary: {
    cash: number;
    card: number;
    instapay: number;
    wallet: number;
    other: number;
    total: number;
  };
  orderTypeBreakdown: {
    "take-away": { value: number; discounts: number; count: number; total: number };
    "dine-in": { value: number; discounts: number; count: number; total: number };
    delivery: { value: number; discounts: number; count: number; total: number };
  };
  totals: {
    sales: number;
    discounts: number;
    deliveryFees: number;
    refunds: number;
    voidedItems: number;
    loyaltyDiscounts: number;
    promoDiscounts: number;
    card: number;
    instapay: number;
    wallet: number;
    cash: number;
    dailyExpenses: number;
    openingCashBalance: number;
    expectedCash: number;
    closingCashBalance: number;
    overShort: number | null;
  };
  categoryBreakdown: Array<{
    categoryName: string;
    totalSales: number;
    items: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      totalPrice: number;
      isCustomInput?: boolean;
      totalWeight?: number;
    }>;
  }>;
  voidedItems: Array<{
    id: string;
    itemName: string;
    voidedQuantity: number;
    unitPrice: number;
    voidedSubtotal: number;
    reason: string;
    voidedBy: string;
    voidedAt: string;
    orderNumber: number;
    orderTimestamp: string;
  }>;
  refundedOrders: Array<{
    id: string;
    orderNumber: number;
    orderTimestamp: string;
    refundAmount: number;
    refundReason: string;
    refundedAt: string;
    paymentMethod: string;
  }>;
  dailyExpenses: Array<{
    id: string;
    amount: number;
    reason: string;
    category: string;
    ingredientId: string | null;
    quantity: number | null;
    quantityUnit: string | null;
    unitPrice: number | null;
    createdAt: string;
    recorder: { id: string; name: string; username: string };
    ingredient: { id: string; name: string } | null;
  }>;
  loyaltyTransactions?: Array<{
    id: string;
    customerId: string;
    points: number;
    type: string;
    amount: number;
    notes: string | null;
    createdAt: string;
    orderNumber?: number;
  }>;
  promoUsages?: Array<{
    id: string;
    code: string;
    discountAmount: number;
    orderSubtotal: number;
    usedAt: string;
    orderNumber?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function egp(amount: number): string {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

const STYLES = `
  body { margin:0; padding:0; background-color:#f3f4f6; font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif; }
  .wrapper { padding:24px 0; }
  .container { width:600px; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.1); margin:0 auto; }
  .header { background:#111827; padding:24px 32px; }
  .header h1 { margin:0; color:#ffffff; font-size:20px; font-weight:700; }
  .header p { margin:6px 0 0 0; color:#9ca3af; font-size:13px; }
  .section { padding:0 32px; }
  .section-title { font-size:15px; font-weight:700; color:#111827; margin:0 0 12px 0; }
  .divider { padding:8px 32px; }
  .divider hr { border:none; border-top:1px solid #e5e7eb; margin:0; }
  .detail-table { width:100%; font-size:14px; color:#374151; border-collapse:collapse; }
  .detail-table td { padding:6px 0; }
  .detail-table .label { font-weight:400; }
  .detail-table .value { text-align:right; font-weight:600; }
  .detail-table .value-red { text-align:right; font-weight:600; color:#dc2626; }
  .detail-table .value-green { text-align:right; font-weight:600; color:#059669; }
  .detail-table .value-blue { text-align:right; font-weight:600; color:#2563eb; }
  .row-total { border-top:2px solid #e5e7eb; }
  .row-total td { padding-top:10px; padding-bottom:6px; font-size:15px; font-weight:700; color:#111827; }
  .row-total .value-red { color:#dc2626; }
  .row-total .value-green { color:#059669; }
  .paper-header { background:#f9fafb; padding:10px 32px; border-top:2px solid #e5e7eb; border-bottom:1px solid #e5e7eb; }
  .paper-header h2 { margin:0; font-size:14px; font-weight:700; color:#374151; text-transform:uppercase; letter-spacing:0.5px; }
  .sub-section { padding:16px 32px 8px 32px; }
  .sub-title { font-size:13px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px; margin:0 0 8px 0; }
  .cat-header { display:flex; justify-content:space-between; padding:8px 12px; background:#f3f4f6; border-radius:6px 6px 0 0; font-size:13px; font-weight:600; color:#111827; }
  .item-row { display:flex; justify-content:space-between; align-items:center; padding:6px 12px; font-size:13px; color:#374151; border-bottom:1px solid #f3f4f6; }
  .item-row:last-child { border-bottom:none; border-radius:0 0 6px 6px; }
  .item-qty { color:#6b7280; font-size:12px; }
  .void-card { padding:10px 12px; background:#fef2f2; border:1px solid #fecaca; border-radius:6px; margin-bottom:8px; font-size:13px; }
  .void-card .item-name { font-weight:600; color:#991b1b; }
  .void-card .item-detail { color:#6b7280; font-size:12px; margin-top:2px; }
  .refund-card { padding:10px 12px; background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; margin-bottom:8px; font-size:13px; }
  .refund-card .order-name { font-weight:600; color:#9a3412; }
  .refund-card .order-detail { color:#6b7280; font-size:12px; margin-top:2px; }
  .expense-card { padding:10px 12px; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; margin-bottom:8px; font-size:13px; }
  .expense-card .exp-reason { font-weight:600; color:#92400e; }
  .expense-card .exp-detail { color:#6b7280; font-size:12px; margin-top:2px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; }
  .badge-green { background:#d1fae5; color:#065f46; }
  .badge-amber { background:#fef3c7; color:#92400e; }
  .footer { background:#f9fafb; padding:16px 32px; text-align:center; font-size:12px; color:#9ca3af; }
  .empty-state { text-align:center; padding:20px 32px; color:#9ca3af; font-size:13px; }
  .order-type-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:16px; }
  .order-type-box { padding:10px 12px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; text-align:center; }
  .order-type-box .ot-label { font-size:11px; color:#6b7280; text-transform:uppercase; font-weight:600; }
  .order-type-box .ot-count { font-size:18px; font-weight:700; color:#111827; }
  .order-type-box .ot-value { font-size:12px; color:#374151; margin-top:2px; }
`;

// ---------------------------------------------------------------------------
// Transporter (lazily created)
// ---------------------------------------------------------------------------

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "Missing required SMTP config: SMTP_HOST, SMTP_USER, SMTP_PASS"
    );
  }

  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const from = process.env.SMTP_FROM ?? "noreply@yourpos.com";

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  // Cache the from address for reuse
  (_transporter as nodemailer.Transporter & { _from?: string })._from = from;

  return _transporter;
}

// ---------------------------------------------------------------------------
// sendEmail
// ---------------------------------------------------------------------------

export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string
): Promise<boolean> {
  try {
    const transporter = getTransporter();
    const from =
      (transporter as nodemailer.Transporter & { _from?: string })._from ??
      "noreply@yourpos.com";

    await transporter.sendMail({ from, to, subject, html: htmlBody });
    return true;
  } catch (err) {
    console.error("[email] Failed to send email:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Build Paper 1: Payment Summary
// ---------------------------------------------------------------------------

function buildPaper1(d: ShiftClosingReportPayload): string {
  const { shift, paymentSummary, orderTypeBreakdown, totals } = d;
  const cashierName = shift.cashier.name ?? shift.cashier.username;

  const overShort = totals.overShort;
  const overShortLabel =
    overShort === null
      ? "N/A"
      : overShort === 0
        ? "Even"
        : overShort > 0
          ? `Over +${egp(overShort)}`
          : `Short ${egp(overShort)}`;
  const overShortColor =
    overShort === null
      ? "#6b7280"
      : overShort === 0
        ? "#059669"
        : overShort > 0
          ? "#2563eb"
          : "#dc2626";

  return `
    <!-- Paper 1: Payment Summary -->
    <div class="paper-header"><h2>Paper 1 &mdash; Payment Summary</h2></div>
    <div class="sub-section">
      <!-- Order Type Breakdown -->
      <p class="sub-title">Order Types</p>
      <div class="order-type-grid">
        <div class="order-type-box">
          <div class="ot-label">Take Away</div>
          <div class="ot-count">${orderTypeBreakdown["take-away"].count}</div>
          <div class="ot-value">${egp(orderTypeBreakdown["take-away"].total)}</div>
        </div>
        <div class="order-type-box">
          <div class="ot-label">Dine In</div>
          <div class="ot-count">${orderTypeBreakdown["dine-in"].count}</div>
          <div class="ot-value">${egp(orderTypeBreakdown["dine-in"].total)}</div>
        </div>
        <div class="order-type-box">
          <div class="ot-label">Delivery</div>
          <div class="ot-count">${orderTypeBreakdown.delivery.count}</div>
          <div class="ot-value">${egp(orderTypeBreakdown.delivery.total)}</div>
        </div>
      </div>

      <!-- Financial Summary -->
      <p class="sub-title">Financial Summary</p>
      <table class="detail-table">
        <tr><td class="label">Total Sales</td><td class="value">${egp(totals.sales)}</td></tr>
        <tr><td class="label">Discounts</td><td class="value-red">&minus;${egp(totals.discounts)}</td></tr>
        <tr><td class="label">Loyalty Discounts</td><td class="value-red">&minus;${egp(totals.loyaltyDiscounts)}</td></tr>
        <tr><td class="label">Promo Discounts</td><td class="value-red">&minus;${egp(totals.promoDiscounts)}</td></tr>
        <tr><td class="label">Delivery Fees</td><td class="value">${egp(totals.deliveryFees)}</td></tr>
        <tr><td class="label">Refunds</td><td class="value-red">&minus;${egp(totals.refunds)}</td></tr>
        <tr><td class="label">Voided Items</td><td class="value-red">&minus;${egp(totals.voidedItems)}</td></tr>
        <tr><td class="label">Daily Expenses</td><td class="value-red">&minus;${egp(totals.dailyExpenses)}</td></tr>
      </table>
    </div>

    <div class="divider"><hr /></div>

    <div class="sub-section">
      <!-- Payment Methods -->
      <p class="sub-title">Payment Methods</p>
      <table class="detail-table">
        <tr><td class="label">Cash</td><td class="value-green">${egp(paymentSummary.cash)}</td></tr>
        <tr><td class="label">Card</td><td class="value-blue">${egp(paymentSummary.card)}</td></tr>
        <tr><td class="label">InstaPay</td><td class="value-blue">${egp(paymentSummary.instapay)}</td></tr>
        <tr><td class="label">Wallet</td><td class="value-blue">${egp(paymentSummary.wallet)}</td></tr>
        ${paymentSummary.other > 0 ? `<tr><td class="label">Other</td><td class="value">${egp(paymentSummary.other)}</td></tr>` : ""}
        <tr class="row-total"><td>Total Payments</td><td class="value">${egp(paymentSummary.total)}</td></tr>
      </table>
    </div>

    <div class="divider"><hr /></div>

    <div class="sub-section">
      <!-- Cash Summary -->
      <p class="sub-title">Cash Summary</p>
      <table class="detail-table">
        <tr><td class="label">Opening Cash</td><td class="value">${egp(totals.openingCashBalance)}</td></tr>
        <tr><td class="label">Expected Cash</td><td class="value">${egp(totals.expectedCash)}</td></tr>
        <tr><td class="label">Closing Cash (Actual)</td><td class="value">${egp(totals.closingCashBalance)}</td></tr>
        <tr class="row-total">
          <td>Over / Short</td>
          <td style="font-weight:700;color:${overShortColor};font-size:15px;">${overShortLabel}</td>
        </tr>
      </table>
    </div>`;
}

// ---------------------------------------------------------------------------
// Build Paper 2: Item Breakdown
// ---------------------------------------------------------------------------

function buildPaper2(d: ShiftClosingReportPayload): string {
  const { categoryBreakdown } = d;

  if (categoryBreakdown.length === 0) {
    return `
      <div class="paper-header"><h2>Paper 2 &mdash; Item Breakdown</h2></div>
      <div class="empty-state">No items sold during this shift.</div>`;
  }

  const categoriesHtml = categoryBreakdown
    .map(
      (cat) => `
    <div style="margin-bottom:16px;">
      <div class="cat-header">
        <span>${cat.categoryName}</span>
        <span>${egp(cat.totalSales)}</span>
      </div>
      ${cat.items
        .map((item) => {
          const displayName = item.isCustomInput && item.totalWeight !== undefined
            ? `\u0648\u0632\u0646: ${item.totalWeight.toFixed(3)} KG ${item.itemName}`
            : item.itemName;
          const qtyLabel = item.isCustomInput && item.totalWeight !== undefined
            ? ""
            : `x${item.quantity}`;
          return `
        <div class="item-row">
          <span style="flex:1;margin-right:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${displayName}</span>
          <span class="item-qty" style="width:40px;text-align:right;margin-right:12px;">${qtyLabel}</span>
          <span style="font-weight:600;width:80px;text-align:right;">${egp(item.totalPrice)}</span>
        </div>`;
        })
        .join("")}
    </div>`
    )
    .join("");

  return `
    <div class="paper-header"><h2>Paper 2 &mdash; Item Breakdown</h2></div>
    <div class="sub-section">
      ${categoriesHtml}
    </div>`;
}

// ---------------------------------------------------------------------------
// Build Paper 3: Voids & Refunds
// ---------------------------------------------------------------------------

function buildPaper3(d: ShiftClosingReportPayload): string {
  const { voidedItems, refundedOrders, totals } = d;

  const hasVoids = voidedItems && voidedItems.length > 0;
  const hasRefunds = refundedOrders && refundedOrders.length > 0;

  if (!hasVoids && !hasRefunds) {
    return `
      <div class="paper-header"><h2>Paper 3 &mdash; Voids &amp; Refunds</h2></div>
      <div class="empty-state">No voided items or refunded orders during this shift.</div>`;
  }

  let html = `<div class="paper-header"><h2>Paper 3 &mdash; Voids &amp; Refunds</h2></div><div class="sub-section">`;

  // Voided Items
  if (hasVoids) {
    html += `
      <p class="sub-title" style="color:#dc2626;">Voided Items (${voidedItems.length})</p>
      ${voidedItems
        .map(
          (v) => `
        <div class="void-card">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:top;">
                <span class="item-name">${v.itemName}</span>
                <div class="item-detail">
                  Order #${v.orderNumber} &bull; Qty: ${v.voidedQuantity} &times; ${egp(v.unitPrice)} &bull; ${fmt(v.voidedAt)}
                </div>
                ${v.reason ? `<div style="margin-top:4px;color:#b91c1c;font-size:12px;">Reason: ${v.reason}</div>` : ""}
              </td>
              <td style="text-align:right;vertical-align:top;font-weight:700;color:#dc2626;white-space:nowrap;">&minus;${egp(v.voidedSubtotal)}</td>
            </tr>
          </table>
        </div>`
        )
        .join("")}`;
  }

  // Refunded Orders
  if (hasRefunds) {
    html += `
      <p class="sub-title" style="color:#c2410c;">Refunded Orders (${refundedOrders.length})</p>
      ${refundedOrders
        .map(
          (r) => `
        <div class="refund-card">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:top;">
                <span class="order-name">Order #${r.orderNumber}</span>
                <div class="order-detail">
                  Payment: ${r.paymentMethod} &bull; Refunded: ${fmt(r.refundedAt)}
                </div>
                ${r.refundReason ? `<div style="margin-top:4px;color:#9a3412;font-size:12px;">Reason: ${r.refundReason}</div>` : ""}
              </td>
              <td style="text-align:right;vertical-align:top;font-weight:700;color:#c2410c;white-space:nowrap;">&minus;${egp(r.refundAmount)}</td>
            </tr>
          </table>
        </div>`
        )
        .join("")}`;
  }

  // Totals
  const totalDeductions = (totals.voidedItems || 0) + (totals.refunds || 0);
  html += `
    <div style="margin-top:16px;padding-top:12px;border-top:2px solid #e5e7eb;">
      <table class="detail-table">
        <tr><td class="label">Total Voided Items</td><td class="value-red">&minus;${egp(totals.voidedItems || 0)}</td></tr>
        <tr><td class="label">Total Refunds</td><td class="value-red">&minus;${egp(totals.refunds || 0)}</td></tr>
        <tr class="row-total"><td>Total Deductions</td><td class="value-red">&minus;${egp(totalDeductions)}</td></tr>
      </table>
    </div>`;

  html += `</div>`;
  return html;
}

// ---------------------------------------------------------------------------
// Build Paper 4: Daily Expenses
// ---------------------------------------------------------------------------

function buildPaper4(d: ShiftClosingReportPayload): string {
  const { dailyExpenses, totals } = d;

  if (!dailyExpenses || dailyExpenses.length === 0) {
    return `
      <div class="paper-header"><h2>Paper 4 &mdash; Daily Expenses</h2></div>
      <div class="empty-state">No expenses recorded for this shift.</div>`;
  }

  const expensesHtml = dailyExpenses
    .map((exp) => {
      const isInventory = exp.category === "INVENTORY";
      const name = isInventory && exp.ingredient
        ? exp.ingredient.name
        : exp.reason || "Expense";

      let detailLine = "";
      if (isInventory && exp.quantity && exp.quantityUnit) {
        detailLine = `${exp.quantity} ${exp.quantityUnit} @ ${egp(exp.unitPrice || 0)}/${exp.quantityUnit}`;
      }

      return `
      <div class="expense-card">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="vertical-align:top;">
              <span class="badge ${isInventory ? "badge-green" : "badge-amber"}">${exp.category}</span>
              <div class="exp-reason" style="margin-top:4px;">${name}</div>
              ${detailLine ? `<div class="exp-detail">${detailLine}</div>` : ""}
              <div class="exp-detail">By: ${exp.recorder?.name || "Unknown"} &bull; ${fmt(exp.createdAt)}</div>
            </td>
            <td style="text-align:right;vertical-align:top;font-weight:700;color:#b45309;white-space:nowrap;">${egp(exp.amount)}</td>
          </tr>
        </table>
      </div>`;
    })
    .join("");

  return `
    <div class="paper-header"><h2>Paper 4 &mdash; Daily Expenses</h2></div>
    <div class="sub-section">
      ${expensesHtml}
      <div style="margin-top:16px;padding-top:12px;border-top:2px solid #e5e7eb;">
        <table class="detail-table">
          <tr class="row-total"><td>Total Daily Expenses</td><td class="value-red">&minus;${egp(totals.dailyExpenses || 0)}</td></tr>
        </table>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// sendShiftReport – builds a comprehensive HTML shift-closing report
// with all 4 papers matching the printed receipts
// ---------------------------------------------------------------------------

export async function sendShiftReport(
  to: string,
  reportData: ShiftClosingReportPayload
): Promise<boolean> {
  const { shift } = reportData;
  const cashierName = shift.cashier.name ?? shift.cashier.username;

  const subject = `Shift Closing Report #${shift.shiftNumber} – ${shift.branch.branchName} – ${cashierName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${STYLES}</style>
</head>
<body>
  <div class="wrapper">
    <div class="container">

      <!-- Header -->
      <div class="header">
        <h1>Shift Closing Report</h1>
        <p>${shift.branch.branchName} &bull; Shift #${shift.shiftNumber}</p>
      </div>

      <!-- Shift Details -->
      <div class="section" style="padding-top:20px;">
        <table class="detail-table">
          <tr>
            <td class="label">Branch</td>
            <td class="value" style="text-align:left;font-weight:600;">${shift.branch.branchName}</td>
            <td class="label" style="padding-left:24px;">Cashier</td>
            <td class="value" style="text-align:right;">${cashierName}</td>
          </tr>
          <tr>
            <td class="label">Date</td>
            <td class="value" style="text-align:left;">${fmtDate(shift.startTime)}</td>
            <td class="label" style="padding-left:24px;">Orders</td>
            <td class="value" style="text-align:right;">${shift.closingOrders ?? "N/A"}</td>
          </tr>
          <tr>
            <td class="label">Start</td>
            <td class="value" style="text-align:left;">${fmtTime(shift.startTime)}</td>
            <td class="label" style="padding-left:24px;">End</td>
            <td class="value" style="text-align:right;">${fmtTime(shift.endTime)}</td>
          </tr>
        </table>
      </div>

      ${buildPaper1(reportData)}

      <div class="divider"><hr /></div>
      ${buildPaper2(reportData)}

      <div class="divider"><hr /></div>
      ${buildPaper3(reportData)}

      <div class="divider"><hr /></div>
      ${buildPaper4(reportData)}

      ${shift.notes ? `
      <div class="divider"><hr /></div>
      <div class="sub-section">
        <p class="sub-title">Notes</p>
        <p style="font-size:14px;color:#374151;margin:0;">${shift.notes}</p>
      </div>
      ` : ""}

      <!-- Footer -->
      <div class="footer">
        This is an automated shift-closing report generated by Emperor Coffee.
      </div>

    </div>
  </div>
</body>
</html>`;

  return sendEmail(to, subject, html);
}