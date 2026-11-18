import { db } from '@/lib/db';

// ============================================================
// Loyalty Portal OTP — Phase 5
//
// Phone-number OTP verification for the customer self-service
// portal. Membership codes are identifiers, not credentials —
// public access would expose purchase history, so we verify
// ownership via OTP-to-registered-phone.
//
// SMS delivery:
//   - If SMS env vars are set (TWILIO_*, VONAGE_*, or
//     SMS_PROVIDER=consolesms), real SMS is sent.
//   - Otherwise: dev mode — OTP is logged server-side and
//     returned in the response (clearly marked). This lets us
//     ship the full portal flow end-to-end before the SMS
//     provider decision is finalized.
//
// Rate limits:
//   - OTP request:    3 per 10 minutes per phone number
//   - OTP verification: 5 attempts per OTP (then OTP is voided)
// ============================================================

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_REQUEST_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const OTP_REQUEST_MAX_IN_WINDOW = 3;
const OTP_VERIFY_MAX_ATTEMPTS = 5;

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
  customerIds: string[]; // resolved customer IDs that match this phone/code
  phoneMasked: string;
}

interface OtpRequestLog {
  timestamps: number[];
}

// In-memory stores. For multi-instance production deploy, swap
// these for Redis. Single-instance dev/staging is fine.
const otpStore = new Map<string, OtpRecord>();
const otpRequestLog = new Map<string, OtpRequestLog>();

// ============================================================
// Mask a phone for display: 01****1234
// ============================================================
export function maskPhone(phone: string): string {
  if (!phone) return '';
  if (phone.length < 6) return phone.replace(/.(?=.{2})/g, '*');
  const head = phone.slice(0, 2);
  const tail = phone.slice(-4);
  return `${head}${'*'.repeat(Math.max(2, phone.length - 6))}${tail}`;
}

// ============================================================
// Find customers matching the given membership code OR phone.
// Returns the array of customers (could be 0, 1, or many if
// multiple customers share a phone — which is rare but possible).
// ============================================================
export async function findCustomersByIdentifier(
  membershipCodeOrPhone: string
) {
  const raw = membershipCodeOrPhone.trim();
  if (!raw) return [];

  // Heuristic: membership codes contain a hyphen and/or letters
  // (e.g. EMP-A7K3M9). Phone numbers are all digits.
  const looksLikeCode = /[A-Za-z-]/.test(raw);

  const where = looksLikeCode
    ? { membershipCode: { equals: raw, mode: 'insensitive' as const } }
    : { phone: { contains: raw } };

  const customers = await db.customer.findMany({
    where,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      membershipCode: true,
      tier: true,
      loyaltyPoints: true,
    },
    take: 10,
  });

  return customers;
}

// ============================================================
// Rate limit: OTP requests
// Returns { allowed: true } or { allowed: false, retryAfterMs }
// ============================================================
export function checkOtpRequestRate(phone: string): {
  allowed: boolean;
  retryAfterMs?: number;
  remainingInWindow?: number;
} {
  const now = Date.now();
  const log = otpRequestLog.get(phone) || { timestamps: [] };
  // Drop timestamps outside the window
  const recent = log.timestamps.filter((t) => now - t < OTP_REQUEST_WINDOW_MS);
  if (recent.length >= OTP_REQUEST_MAX_IN_WINDOW) {
    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterMs: OTP_REQUEST_WINDOW_MS - (now - oldest),
      remainingInWindow: 0,
    };
  }
  return {
    allowed: true,
    remainingInWindow: OTP_REQUEST_MAX_IN_WINDOW - recent.length,
  };
}

// ============================================================
// Generate + store OTP for a set of customers (resolved from
// their shared phone number). Sends the OTP via SMS, or returns
// it in dev mode.
// ============================================================
export async function generateAndSendOtp(
  phone: string,
  customerIds: string[]
): Promise<{ sent: boolean; devOtp?: string; maskedPhone: string }> {
  const code = generateOtpCode();
  const maskedPhone = maskPhone(phone);

  otpStore.set(phone, {
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    customerIds,
    phoneMasked: maskedPhone,
  });

  // Log the request timestamp
  const now = Date.now();
  const log = otpRequestLog.get(phone) || { timestamps: [] };
  log.timestamps.push(now);
  // Keep only last 24h of timestamps (cheap cleanup)
  log.timestamps = log.timestamps.filter((t) => now - t < 24 * 60 * 60 * 1000);
  otpRequestLog.set(phone, log);

  // Send via SMS provider, if configured
  const smsResult = await sendSms(phone, `Your Emperor Coffee loyalty portal code is ${code}. It expires in 5 minutes.`);

  if (!smsResult.sent) {
    // Dev fallback — surface the OTP so the test session can use it
    console.log(`[LoyaltyPortal] DEV OTP for ${maskedPhone}: ${code} (SMS not configured)`);
    return { sent: false, devOtp: code, maskedPhone };
  }

  return { sent: true, maskedPhone };
}

function generateOtpCode(): string {
  // 6-digit code
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ============================================================
// Verify OTP. On success, clears the OTP and returns the matched
// customer IDs. On failure, increments attempt count.
// ============================================================
export function verifyOtp(
  phone: string,
  code: string
): { valid: boolean; customerIds?: string[]; reason?: string } {
  const record = otpStore.get(phone);
  if (!record) {
    return { valid: false, reason: 'No OTP was sent to this number. Please request a new one.' };
  }
  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return { valid: false, reason: 'OTP has expired. Please request a new one.' };
  }
  if (record.attempts >= OTP_VERIFY_MAX_ATTEMPTS) {
    otpStore.delete(phone);
    return { valid: false, reason: 'Too many failed attempts. Please request a new OTP.' };
  }

  if (record.code !== code.trim()) {
    record.attempts += 1;
    return {
      valid: false,
      reason: `Invalid code. ${OTP_VERIFY_MAX_ATTEMPTS - record.attempts} attempt(s) remaining.`,
    };
  }

  // Success — clear OTP, return resolved customer IDs
  const customerIds = record.customerIds;
  otpStore.delete(phone);
  return { valid: true, customerIds };
}

// ============================================================
// SMS adapter — pluggable provider.
// Currently supports:
//   - consolesms (default dev): logs to server console, returns sent=false
//   - twilio:     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
//   - vonage:     VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM
//
// To add a new provider, add a branch below. The adapter contract
// is `sendSms(to, body) → Promise<{sent: boolean}>`.
// ============================================================

async function sendSms(to: string, body: string): Promise<{ sent: boolean }> {
  const provider = (process.env.SMS_PROVIDER || 'consolesms').toLowerCase();

  if (provider === 'twilio') {
    return sendTwilioSms(to, body);
  }
  if (provider === 'vonage') {
    return sendVonageSms(to, body);
  }
  // Default: console-only (dev mode)
  console.log(`[LoyaltyPortal SMS] To: ${maskPhone(to)} | Body: ${body}`);
  return { sent: false };
}

async function sendTwilioSms(to: string, body: string): Promise<{ sent: boolean }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    console.error('[LoyaltyPortal] Twilio env vars incomplete; falling back to console');
    console.log(`[LoyaltyPortal SMS] To: ${maskPhone(to)} | Body: ${body}`);
    return { sent: false };
  }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error('[LoyaltyPortal] Twilio error:', err);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error('[LoyaltyPortal] Twilio exception:', err);
    return { sent: false };
  }
}

async function sendVonageSms(to: string, body: string): Promise<{ sent: boolean }> {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  const from = process.env.VONAGE_FROM || 'Emperor';
  if (!apiKey || !apiSecret) {
    console.error('[LoyaltyPortal] Vonage env vars incomplete; falling back to console');
    console.log(`[LoyaltyPortal SMS] To: ${maskPhone(to)} | Body: ${body}`);
    return { sent: false };
  }
  try {
    const res = await fetch(
      `https://rest.nexmo.com/sms/json?api_key=${apiKey}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          text: body,
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error('[LoyaltyPortal] Vonage error:', err);
      return { sent: false };
    }
    const data = await res.json();
    // Vonage returns messages[] with status "0" on success
    const ok = data.messages?.some((m: any) => String(m.status) === '0');
    return { sent: ok };
  } catch (err) {
    console.error('[LoyaltyPortal] Vonage exception:', err);
    return { sent: false };
  }
}
