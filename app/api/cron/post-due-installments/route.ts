import { NextResponse } from 'next/server';
import { computeAccountLedgerCents } from '@/lib/fx/account-ledger';
import { convertToBase } from '@/lib/fx/convert';
import { createClient } from '@/lib/supabase/server';

/**
 * Vercel Cron Job — runs daily at 06:00 UTC.
 * Posts transactions for installment occurrences whose due_date <= today
 * and state = 'pending'.
 *
 * Protected by CRON_SECRET env var (set in Vercel → Settings → Environment).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();

  // Fetch pending occurrences due today or earlier.
  const { data: occurrences, error: fetchErr } = await supabase
    .from('installment_occurrences')
    .select('id,plan_id,due_date,amount_cents')
    .eq('state', 'pending')
    .lte('due_date', today)
    .limit(200);

  if (fetchErr) {
    console.error('post_due_installments_fetch_error', { error: fetchErr.message });
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 });
  }

  if (occurrences.length === 0) {
    return NextResponse.json({ posted: 0, failed: 0, today });
  }

  // Batch-fetch plans.
  const planIds = [...new Set(occurrences.map((o) => o.plan_id))];
  const { data: plans, error: plansErr } = await supabase
    .from('installment_plans')
    .select('id,user_id,account_id,currency,merchant_id,category_id,notes,status')
    .in('id', planIds);

  if (plansErr) {
    console.error('post_due_installments_plans_error', { error: plansErr.message });
    return NextResponse.json({ error: 'plans_fetch_failed' }, { status: 500 });
  }

  const planMap = new Map(plans.map((p) => [p.id, p]));

  // Batch-fetch accounts.
  const accountIds = [...new Set(plans.map((p) => p.account_id))];
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id,currency')
    .in('id', accountIds);
  const accountCurrencyMap = new Map((accounts ?? []).map((a) => [a.id, a.currency]));

  // Batch-fetch base currencies per user.
  const userIds = [...new Set(plans.map((p) => p.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,base_currency')
    .in('id', userIds);
  const baseCurrencyMap = new Map((profiles ?? []).map((p) => [p.id, p.base_currency]));

  let posted = 0;
  let failed = 0;

  for (const occ of occurrences) {
    const plan = planMap.get(occ.plan_id);
    if (!plan) continue;
    if (plan.status !== 'active') continue;

    const currency = accountCurrencyMap.get(plan.account_id) ?? plan.currency;
    const baseCurrency = baseCurrencyMap.get(plan.user_id) ?? plan.currency;

    const amtCents = BigInt(occ.amount_cents);
    const signedCents = -amtCents;

    let fxResult: Awaited<ReturnType<typeof convertToBase>>;
    try {
      fxResult = await convertToBase(signedCents, currency, baseCurrency, occ.due_date);
    } catch (err) {
      console.error('post_due_installments_fx_error', {
        occurrenceId: occ.id,
        error: err instanceof Error ? err.message : 'unknown',
      });
      failed++;
      continue;
    }

    let ledgerCents: bigint;
    try {
      ledgerCents = await computeAccountLedgerCents(
        currency,
        signedCents,
        currency,
        fxResult.baseCents,
        baseCurrency,
        occ.due_date,
      );
    } catch (err) {
      console.error('post_due_installments_ledger_error', {
        occurrenceId: occ.id,
        error: err instanceof Error ? err.message : 'unknown',
      });
      failed++;
      continue;
    }

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: plan.user_id,
        account_id: plan.account_id,
        original_amount_cents: Number(signedCents),
        original_currency: currency,
        base_amount_cents: Number(fxResult.baseCents),
        base_currency: baseCurrency,
        account_ledger_cents: Number(ledgerCents),
        fx_rate: fxResult.fxRate,
        fx_rate_date: fxResult.fxRateDate,
        fx_stale: fxResult.fxStale,
        transaction_date: occ.due_date,
        merchant_id: plan.merchant_id,
        category_id: plan.category_id,
        category_source: plan.category_id ? 'user' : null,
        notes: plan.notes,
        source: 'recurring',
        is_recurring: true,
      })
      .select('id')
      .single();

    if (txErr) {
      console.error('post_due_installments_tx_error', {
        occurrenceId: occ.id,
        error: txErr.message,
      });
      failed++;
      continue;
    }

    const { error: stateErr } = await supabase
      .from('installment_occurrences')
      .update({ state: 'posted', transaction_id: tx.id })
      .eq('id', occ.id);

    if (stateErr) {
      console.error('post_due_installments_state_error', {
        occurrenceId: occ.id,
        error: stateErr.message,
      });
      failed++;
    } else {
      posted++;
    }
  }

  // Mark plans as completed if all their occurrences are posted.
  const activeplanIds = [...new Set(occurrences.map((o) => o.plan_id))];
  for (const activePlanId of activeplanIds) {
    const { count: pendingCount } = await supabase
      .from('installment_occurrences')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', activePlanId)
      .eq('state', 'pending');

    if (pendingCount === 0) {
      await supabase
        .from('installment_plans')
        .update({ status: 'completed' })
        .eq('id', activePlanId);
    }
  }

  console.error('post_due_installments_done', { posted, failed, today });
  return NextResponse.json({ posted, failed, today });
}
