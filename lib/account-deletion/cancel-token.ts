import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

export interface AccountDeletionTokenPayload {
  sub: string;
  /** Unix timestamp (seconds). */
  exp: number;
  /**
   * JWT ID — a random UUID generated at signing time.
   * Stored in `deletion_cancel_tokens` on first redemption; replayed tokens
   * are rejected with `ALREADY_USED` because the jti is already present.
   */
  jti: string;
}

function getSecret(): string {
  const v = process.env.ACCOUNT_DELETION_TOKEN_SECRET;
  if (!v) {
    throw new Error('Missing required environment variable: ACCOUNT_DELETION_TOKEN_SECRET');
  }
  return v;
}

export function signAccountDeletionCancelToken(userId: string, expiresAtSeconds: number): string {
  const secret = getSecret();
  const payload: AccountDeletionTokenPayload = {
    sub: userId,
    exp: expiresAtSeconds,
    jti: randomUUID(),
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payloadB64).digest();
  const sigB64 = Buffer.from(sig).toString('base64url');
  return `${payloadB64}.${sigB64}`;
}

export type VerifyCancelTokenResult =
  | { ok: true; userId: string; jti: string; exp: number }
  | { ok: false; error: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' };

export function verifyAccountDeletionCancelToken(token: string): VerifyCancelTokenResult {
  const secret = getSecret();

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { ok: false, error: 'MALFORMED' };
  }

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return { ok: false, error: 'MALFORMED' };
  }

  let sigExpected: Buffer;
  try {
    sigExpected = Buffer.from(sigB64, 'base64url');
  } catch {
    return { ok: false, error: 'MALFORMED' };
  }

  const sigActual = createHmac('sha256', secret).update(payloadB64).digest();
  if (sigExpected.length !== sigActual.length || !timingSafeEqual(sigExpected, sigActual)) {
    return { ok: false, error: 'BAD_SIGNATURE' };
  }

  let parsed: AccountDeletionTokenPayload;
  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    parsed = JSON.parse(json) as AccountDeletionTokenPayload;
  } catch {
    return { ok: false, error: 'MALFORMED' };
  }

  if (
    typeof parsed.sub !== 'string' ||
    typeof parsed.exp !== 'number' ||
    typeof parsed.jti !== 'string'
  ) {
    return { ok: false, error: 'MALFORMED' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > parsed.exp) {
    return { ok: false, error: 'EXPIRED' };
  }

  return { ok: true, userId: parsed.sub, jti: parsed.jti, exp: parsed.exp };
}
