import type { SupabaseClient } from '@supabase/supabase-js';
import { bigintJsonReplacer } from '@/lib/export/bigint-json-replacer';
import type { Database } from '@/supabase/types';

const EXPORT_RATE_WINDOW_MS = 60 * 60 * 1000;

export type BuildUserExportResult =
  | { ok: true; json: string }
  | { ok: false; error: 'RATE_LIMITED' | 'DATABASE_ERROR' };

function exportWindowStartIso(): string {
  return new Date(Date.now() - EXPORT_RATE_WINDOW_MS).toISOString();
}

async function gateExportRateLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<'allow' | 'block' | 'error'> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id')
    .eq('user_id', userId)
    .eq('event_type', 'export_data')
    .gte('created_at', exportWindowStartIso())
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('export_rate_check_error', { userId, error: error.message });
    return 'error';
  }

  return data === null ? 'allow' : 'block';
}

export async function buildUserExportJsonForRequest(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<BuildUserExportResult> {
  const gate = await gateExportRateLimit(supabase, userId);
  if (gate === 'error') {
    return { ok: false, error: 'DATABASE_ERROR' };
  }
  if (gate === 'block') {
    return { ok: false, error: 'RATE_LIMITED' };
  }

  const [profileRes, accountsRes, categoriesRes, merchantsRes, aliasesRes, transactionsRes] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('accounts').select('*').eq('user_id', userId).order('sort_order'),
      supabase.from('categories').select('*').eq('user_id', userId).order('sort_order'),
      supabase.from('merchants').select('*').eq('user_id', userId).order('display_name'),
      supabase.from('merchant_aliases').select('*').eq('user_id', userId).order('created_at'),
      supabase
        .from('transactions')
        .select(
          `
        *,
        category:categories (
          name,
          slug
        ),
        merchant:merchants (
          display_name,
          canonical_name
        )
      `,
        )
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false }),
    ]);

  const firstError =
    profileRes.error ??
    accountsRes.error ??
    categoriesRes.error ??
    merchantsRes.error ??
    aliasesRes.error ??
    transactionsRes.error;

  if (firstError) {
    console.error('export_fetch_error', { userId, error: firstError.message });
    return { ok: false, error: 'DATABASE_ERROR' };
  }

  const payload = {
    exported_at: new Date().toISOString(),
    export_version: 1,
    profile: profileRes.data ?? null,
    accounts: accountsRes.data ?? [],
    categories: categoriesRes.data ?? [],
    merchants: merchantsRes.data ?? [],
    merchant_aliases: aliasesRes.data ?? [],
    transactions: transactionsRes.data ?? [],
    // Faza 3 tabele — prazno dok migracije ne postoje u šemi
    categorization_rules: [] as unknown[],
    budgets: [] as unknown[],
    goals: [] as unknown[],
    recurring_transactions: [] as unknown[],
  };

  const json = JSON.stringify(payload, bigintJsonReplacer, 2);

  const { error: auditError } = await supabase.from('audit_log').insert({
    user_id: userId,
    event_type: 'export_data',
    event_data: { byte_length: json.length },
  });

  if (auditError) {
    console.error('export_audit_error', { userId, error: auditError.message });
    return { ok: false, error: 'DATABASE_ERROR' };
  }

  return { ok: true, json };
}
