/**
 * Vercel Cron — runs nightly at 03:00 UTC.
 *
 * For every user with at least one transaction in the last 30 days, runs
 * the insights engine and persists fresh insights to `public.insights`.
 *
 * Auth: Bearer header matched against `CRON_SECRET` via `timingSafeEqual`.
 * Same pattern as `/api/cron/post-due-installments`.
 *
 * Time budget: Vercel Pro caps cron at 300s. Per-user budget around ~100ms
 * keeps us under at 1000 users; if we ever approach that, chunk via offset
 * + multiple schedules.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateInsights } from '@/lib/analytics/insights/engine';
import { logSafe } from '@/lib/logger';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret === undefined || cronSecret === '') {
    logSafe('insights_nightly_missing_secret', {});
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const expected = `Bearer ${cronSecret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const supabase = createAdminClient();

  // SE-11: server-side replay protection. Vercel Cron uses a static Bearer
  // header; we can't rely on per-request nonces from the sender, so we lock
  // execution per cron name in the DB. 22h interval matches our daily
  // schedule with 2h slack for Vercel's scheduling jitter. A leaked
  // CRON_SECRET cannot be replayed within 22h of the legitimate run.
  // See migration 00068 + audit PR #151 SE-11.
  const lock = await supabase.rpc('acquire_cron_lock', {
    p_cron_name: 'insights_nightly',
    p_min_interval_seconds: 22 * 60 * 60,
  });
  if (lock.error) {
    logSafe('insights_nightly_lock_error', { error: lock.error.message });
    return NextResponse.json({ error: 'Lock RPC failed' }, { status: 500 });
  }
  if (!lock.data) {
    logSafe('insights_nightly_replay_rejected', {});
    return NextResponse.json({ error: 'Replay rejected' }, { status: 409 });
  }

  // Discover active users via recent transaction activity. This dodges
  // pagination over `auth.users` (which we can't filter by activity anyway)
  // and keeps the cron focused on the people who would actually benefit.
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - 30);
  const sinceIso = since.toISOString();

  const { data: activeRows, error: activeErr } = await supabase
    .from('transactions')
    .select('user_id')
    .gte('created_at', sinceIso);

  if (activeErr) {
    logSafe('insights_nightly_active_error', { error: activeErr.message });
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 });
  }

  const userIds = Array.from(new Set(activeRows.map((r) => r.user_id)));
  if (userIds.length === 0) {
    return NextResponse.json({ users: 0, created: 0, errored: 0 });
  }

  let totalCreated = 0;
  let totalErrored = 0;
  let usersProcessed = 0;
  let usersFailed = 0;

  for (const userId of userIds) {
    try {
      const result = await generateInsights(supabase, userId, today);
      totalCreated += result.created;
      totalErrored += result.errored;
      usersProcessed += 1;
    } catch (err) {
      // generateInsights catches detector errors internally; this catches
      // catastrophic failures (e.g., DB connectivity for the preload step).
      // Continue to the next user — one bad row shouldn't break the cron.
      usersFailed += 1;
      logSafe('insights_nightly_user_error', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logSafe('insights_nightly_done', {
    users: userIds.length,
    usersProcessed,
    usersFailed,
    created: totalCreated,
    errored: totalErrored,
  });

  return NextResponse.json({
    users: userIds.length,
    usersProcessed,
    usersFailed,
    created: totalCreated,
    errored: totalErrored,
  });
}
