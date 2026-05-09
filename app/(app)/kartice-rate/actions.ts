'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { computeAccountLedgerCents } from '@/lib/fx/account-ledger';
import { convertToBase } from '@/lib/fx/convert';
import {
  CancelInstallmentPlanSchema,
  CreateInstallmentPlanSchema,
  MarkOccurrencePaidSchema,
  type CreateInstallmentPlanInput,
} from '@/lib/schemas/installment';
import { revalidateAfterTransactionWrite } from '@/lib/server/revalidate-views';
import { createClient } from '@/lib/supabase/server';
import { logSafe } from '@/lib/logger';

// ── helpers ────────────────────────────────────────────────────────────────

function bigintToDbInt(value: bigint): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amount outside safe integer range.');
  }
  return Number(value);
}

/**
 * Computes the due date for occurrence at index `i` (0-based).
 * i=0 → start_date exactly.
 * i>0 → same day_of_month in subsequent months, clamped to the last day.
 */
function computeDueDate(startDate: string, dayOfMonth: number, i: number): string {
  const [yearStr, monthStr] = startDate.split('-');
  if (i === 0) return startDate;

  let year = Number(yearStr);
  let month = Number(monthStr) + i;
  // normalise month overflow
  year += Math.floor((month - 1) / 12);
  month = ((month - 1) % 12) + 1;

  // clamp to last day of that month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clampedDay = Math.min(dayOfMonth, lastDay);
  const yyyy = String(year).padStart(4, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Distributes total_cents across N installments.
 * Returns array where last installment absorbs rounding remainder.
 */
function distributeInstallments(totalCents: bigint, count: number, perCents: bigint): bigint[] {
  const amounts: bigint[] = Array.from({ length: count }, (_, i) => {
    if (i === count - 1) {
      return totalCents - perCents * BigInt(count - 1);
    }
    return perCents;
  });
  return amounts;
}

// ── result types ───────────────────────────────────────────────────────────

interface ValidationDetails {
  _root: string[];
}

function buildValidationDetails(error: z.ZodError): ValidationDetails {
  return { _root: error.issues.map((issue) => issue.message) };
}

export type CreateInstallmentPlanResult =
  | { success: true; data: { planId: string } }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'FORBIDDEN' }
  | { success: false; error: 'NOT_CREDIT_CARD' }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'EXTERNAL_SERVICE_ERROR' };

export type CancelInstallmentPlanResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'FORBIDDEN' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type MarkOccurrencePaidResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'FORBIDDEN' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'ALREADY_POSTED' }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'EXTERNAL_SERVICE_ERROR' };

// ── createInstallmentPlan ──────────────────────────────────────────────────

export async function createInstallmentPlan(input: unknown): Promise<CreateInstallmentPlanResult> {
  const parsed = CreateInstallmentPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildValidationDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  const data: CreateInstallmentPlanInput = parsed.data;

  // Verify account ownership and that it is a credit card.
  const { data: account, error: acctErr } = await supabase
    .from('accounts')
    .select('id,type,currency')
    .eq('id', data.account_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (acctErr) return { success: false, error: 'DATABASE_ERROR' };
  if (!account) return { success: false, error: 'FORBIDDEN' };
  if (account.type !== 'credit_card') return { success: false, error: 'NOT_CREDIT_CARD' };

  // Determine base currency.
  const { data: profile } = await supabase
    .from('profiles')
    .select('base_currency')
    .eq('id', user.id)
    .maybeSingle();
  const baseCurrency = profile?.base_currency ?? 'BAM';

  // Build per-occurrence amounts.
  const amounts = distributeInstallments(
    data.total_cents,
    data.installment_count,
    data.installment_cents,
  );

  // Insert plan.
  const { data: plan, error: planErr } = await supabase
    .from('installment_plans')
    .insert({
      user_id: user.id,
      account_id: data.account_id,
      merchant_id: data.merchant_id ?? null,
      category_id: data.category_id ?? null,
      currency: data.currency,
      total_cents: bigintToDbInt(data.total_cents),
      installment_count: data.installment_count,
      installment_cents: bigintToDbInt(data.installment_cents),
      start_date: data.start_date,
      day_of_month: data.day_of_month,
      notes: data.notes ?? null,
      status: 'active',
    })
    .select('id')
    .single();

  if (planErr) {
    logSafe('create_installment_plan_error', { userId: user.id, error: planErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  // Build occurrence rows.
  const occurrenceRows = amounts.map((amtCents, i) => ({
    plan_id: plan.id,
    occurrence_num: i + 1,
    due_date: computeDueDate(data.start_date, data.day_of_month, i),
    amount_cents: bigintToDbInt(amtCents),
    state: 'pending' as const,
  }));

  const { data: occurrences, error: occErr } = await supabase
    .from('installment_occurrences')
    .insert(occurrenceRows)
    .select('id,due_date,occurrence_num,amount_cents');

  if (occErr) {
    logSafe('create_installment_occurrences_error', {
      userId: user.id,
      planId: plan.id,
      error: occErr.message,
    });
    // Roll back the plan.
    await supabase.from('installment_plans').delete().eq('id', plan.id).eq('user_id', user.id);
    return { success: false, error: 'DATABASE_ERROR' };
  }

  // Post the first occurrence immediately as a transaction.
  const firstOcc = occurrences.find((o) => o.occurrence_num === 1);
  if (firstOcc) {
    const firstAmtCents = BigInt(firstOcc.amount_cents);
    // Installment payment is a debit (negative) on a credit card.
    const signedCents = -firstAmtCents;

    let fxResult: Awaited<ReturnType<typeof convertToBase>>;
    try {
      fxResult = await convertToBase(signedCents, data.currency, baseCurrency, firstOcc.due_date);
    } catch (err) {
      logSafe('create_installment_fx_error', {
        userId: user.id,
        planId: plan.id,
        error: err instanceof Error ? err.message : 'unknown',
      });
      // Non-fatal: leave first occurrence as 'pending'; cron will pick it up.
      revalidatePath('/kartice-rate');
      return { success: true, data: { planId: plan.id } };
    }

    let ledgerCents: bigint;
    try {
      ledgerCents = await computeAccountLedgerCents(
        data.currency,
        signedCents,
        data.currency,
        fxResult.baseCents,
        baseCurrency,
        firstOcc.due_date,
      );
    } catch (err) {
      logSafe('create_installment_ledger_error', {
        userId: user.id,
        planId: plan.id,
        error: err instanceof Error ? err.message : 'unknown',
      });
      revalidatePath('/kartice-rate');
      return { success: true, data: { planId: plan.id } };
    }

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        account_id: data.account_id,
        original_amount_cents: bigintToDbInt(signedCents),
        original_currency: data.currency,
        base_amount_cents: bigintToDbInt(fxResult.baseCents),
        base_currency: baseCurrency,
        account_ledger_cents: bigintToDbInt(ledgerCents),
        fx_rate: fxResult.fxRate,
        fx_rate_date: fxResult.fxRateDate,
        fx_stale: fxResult.fxStale,
        transaction_date: firstOcc.due_date,
        merchant_id: data.merchant_id ?? null,
        category_id: data.category_id ?? null,
        category_source: data.category_id ? 'user' : null,
        notes: data.notes ?? null,
        source: 'recurring',
        is_recurring: true,
      })
      .select('id')
      .single();

    if (txErr) {
      logSafe('create_installment_first_tx_error', { userId: user.id, error: txErr.message });
    } else {
      await supabase
        .from('installment_occurrences')
        .update({ state: 'posted', transaction_id: tx.id })
        .eq('id', firstOcc.id);
    }
  }

  revalidateAfterTransactionWrite([data.account_id]);
  revalidatePath('/kartice-rate');
  return { success: true, data: { planId: plan.id } };
}

// ── cancelInstallmentPlan ─────────────────────────────────────────────────

export async function cancelInstallmentPlan(id: unknown): Promise<CancelInstallmentPlanResult> {
  const parsed = CancelInstallmentPlanSchema.safeParse(id);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildValidationDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  const { data: plan, error: fetchErr } = await supabase
    .from('installment_plans')
    .select('id,status,account_id')
    .eq('id', parsed.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchErr) return { success: false, error: 'DATABASE_ERROR' };
  if (!plan) return { success: false, error: 'FORBIDDEN' };
  if (plan.status !== 'active') return { success: false, error: 'NOT_FOUND' };

  const { error: updateErr } = await supabase
    .from('installment_plans')
    .update({ status: 'cancelled' })
    .eq('id', parsed.data)
    .eq('user_id', user.id);

  if (updateErr) return { success: false, error: 'DATABASE_ERROR' };

  revalidatePath('/kartice-rate');
  return { success: true };
}

// ── markOccurrencePaid ────────────────────────────────────────────────────

export async function markOccurrencePaid(occurrenceId: unknown): Promise<MarkOccurrencePaidResult> {
  const parsed = MarkOccurrencePaidSchema.safeParse(occurrenceId);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildValidationDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  // Fetch occurrence.
  const { data: occ, error: occErr } = await supabase
    .from('installment_occurrences')
    .select('id,state,due_date,amount_cents,plan_id')
    .eq('id', parsed.data)
    .maybeSingle();

  if (occErr) return { success: false, error: 'DATABASE_ERROR' };
  if (!occ) return { success: false, error: 'FORBIDDEN' };
  if (occ.state === 'posted') return { success: false, error: 'ALREADY_POSTED' };
  if (occ.state === 'skipped') return { success: false, error: 'NOT_FOUND' };

  // Fetch parent plan — eq('user_id') enforces ownership at the query level so a missing
  // row and a foreign-user row are indistinguishable (both return null → FORBIDDEN).
  const { data: plan, error: planErr } = await supabase
    .from('installment_plans')
    .select('id,user_id,account_id,currency,merchant_id,category_id,notes')
    .eq('id', occ.plan_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (planErr) return { success: false, error: 'DATABASE_ERROR' };
  if (!plan) return { success: false, error: 'FORBIDDEN' };

  const [profileResult, accountResult] = await Promise.all([
    supabase.from('profiles').select('base_currency').eq('id', user.id).maybeSingle(),
    supabase.from('accounts').select('currency').eq('id', plan.account_id).maybeSingle(),
  ]);

  const baseCurrency = profileResult.data?.base_currency ?? 'BAM';
  const currency = accountResult.data?.currency ?? plan.currency;

  const amtCents = BigInt(occ.amount_cents);
  const signedCents = -amtCents;

  let fxResult: Awaited<ReturnType<typeof convertToBase>>;
  try {
    fxResult = await convertToBase(signedCents, currency, baseCurrency, occ.due_date);
  } catch (err) {
    logSafe('mark_occurrence_paid_fx_error', {
      userId: user.id,
      occurrenceId: occ.id,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
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
    logSafe('mark_occurrence_paid_ledger_error', {
      userId: user.id,
      occurrenceId: occ.id,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
  }

  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: plan.account_id,
      original_amount_cents: bigintToDbInt(signedCents),
      original_currency: currency,
      base_amount_cents: bigintToDbInt(fxResult.baseCents),
      base_currency: baseCurrency,
      account_ledger_cents: bigintToDbInt(ledgerCents),
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
    logSafe('mark_occurrence_paid_tx_error', { userId: user.id, error: txErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const { error: stateErr } = await supabase
    .from('installment_occurrences')
    .update({ state: 'posted', transaction_id: tx.id })
    .eq('id', occ.id);

  if (stateErr) return { success: false, error: 'DATABASE_ERROR' };

  revalidateAfterTransactionWrite([plan.account_id]);
  revalidatePath('/kartice-rate');
  return { success: true };
}
