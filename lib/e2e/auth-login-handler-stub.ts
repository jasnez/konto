/**
 * Production stub for the E2E auth-bypass handler.
 *
 * next.config.ts aliases auth-login-handler → this file when VERCEL_ENV=production,
 * so the real handler code (and its Supabase/crypto imports) never enters the
 * production bundle. Any request that somehow reaches this route in production
 * gets a 404 — identical to the runtime guards in the real handler, but at
 * zero bundle cost.
 */
import { NextResponse } from 'next/server';

export function POST(): NextResponse {
  return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
}
