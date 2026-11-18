import { db } from '@/lib/db';

// ============================================================
// Loyalty Portal Session — Phase 5
//
// Lightweight signed-token session for customer self-service
// portal. Not a full JWT library — we hand-roll a minimal
// HMAC-SHA256 signed token. 24-hour TTL.
//
// Token shape: <customerId>.<expiresAt>.<signature>
//   - customerId: target customer (single-customer sessions only)
//   - expiresAt: unix-ms expiry timestamp
//   - signature: HMAC-SHA256(`${customerId}.${expiresAt}`, secret)
//
// The secret is LOYALTY_PORTAL_SECRET env var, with a fallback
// to NEXT_PUBLIC_LICENSE_KEY (existing app secret) for dev.
// ============================================================

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSecret(): string {
  return (
    process.env.LOYALTY_PORTAL_SECRET ||
    process.env.NEXT_PUBLIC_LICENSE_KEY ||
    'dev-only-portal-secret-CHANGE-ME'
  );
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  // Web Crypto — available in Node 18+ and Edge runtimes
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  // Hex encode
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================
// Create a session token for a customer
// ============================================================
export async function createPortalSession(customerId: string): Promise<{
  token: string;
  expiresAt: number;
}> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${customerId}.${expiresAt}`;
  const sig = await hmacSha256(payload, getSecret());
  return { token: `${payload}.${sig}`, expiresAt };
}

// ============================================================
// Verify a session token. Returns customerId on success, or null.
// ============================================================
export async function verifyPortalSession(token: string): Promise<string | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [customerId, expiresAtStr, sig] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || Date.now() > expiresAt) return null;

  // Re-compute signature and compare (constant-time-ish via length-equal compare)
  const expectedSig = await hmacSha256(`${customerId}.${expiresAt}`, getSecret());
  if (expectedSig.length !== sig.length) return null;
  // Simple equality check (sufficient — secret is server-side)
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= expectedSig.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;

  // Confirm the customer still exists
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  return customer ? customerId : null;
}
