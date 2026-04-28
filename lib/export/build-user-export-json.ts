import type { SupabaseClient } from '@supabase/supabase-js';
import { bigintJsonReplacer } from '@/lib/export/bigint-json-replacer';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

const EXPORT_RATE_WINDOW_MS = 60 * 60 * 1000;
export const EXPORT_CHUNK_SIZE = 1000;

export type BuildUserExportResult =
  | { ok: true; json: string }
  | { ok: false; error: 'RATE_LIMITED' | 'DATABASE_ERROR' };

export interface ExportHeader {
  profile: Database['public']['Tables']['profiles']['Row'] | null;
  accounts: Database['public']['Tables']['accounts']['Row'][];
  categories: Database['public']['Tables']['categories']['Row'][];
  merchants: Database['public']['Tables']['merchants']['Row'][];
  merchant_aliases: Database['public']['Tables']['merchant_aliases']['Row'][];
}

function exportWindowStartIso(): string {
  return new Date(Date.now() - EXPORT_RATE_WINDOW_MS).toISOString();
}

export async function gateExportRateLimit(
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
    logSafe('export_rate_check_error', { userId, error: error.message });
    return 'error';
  }

  return data === null ? 'allow' : 'block';
}

export async function logExportAuditStart(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase.from('audit_log').insert({
    user_id: userId,
    event_type: 'export_data',
    event_data: {},
  });

  if (error) {
    logSafe('export_audit_error', { userId, error: error.message });
    return false;
  }
  return true;
}

export async function fetchExportHeader(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ExportHeader> {
  const [profileRes, accountsRes, categoriesRes, merchantsRes, aliasesRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('accounts').select('*').eq('user_id', userId).order('sort_order'),
    supabase.from('categories').select('*').eq('user_id', userId).order('sort_order'),
    supabase.from('merchants').select('*').eq('user_id', userId).order('display_name'),
    supabase.from('merchant_aliases').select('*').eq('user_id', userId).order('created_at'),
  ]);

  const firstError =
    profileRes.error ??
    accountsRes.error ??
    categoriesRes.error ??
    merchantsRes.error ??
    aliasesRes.error;

  if (firstError) {
    throw new Error(`export header fetch failed: ${firstError.message}`);
  }

  return {
    profile: profileRes.data ?? null,
    accounts: accountsRes.data ?? [],
    categories: categoriesRes.data ?? [],
    merchants: merchantsRes.data ?? [],
    merchant_aliases: aliasesRes.data ?? [],
  };
}

export async function* streamExportTransactions(
  supabase: SupabaseClient<Database>,
  userId: string,
): AsyncGenerator<unknown[], void, void> {
  let cursor: string | null = null;

  for (;;) {
    const baseQuery = supabase
      .from('transactions')
      .select(
        `
        *,
        category:categories (name, slug),
        merchant:merchants (display_name, canonical_name)
      `,
      )
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .limit(EXPORT_CHUNK_SIZE);

    const { data, error } =
      await // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- breaks circular type inference in async generator
      ((cursor !== null ? baseQuery.gt('id', cursor) : baseQuery) as typeof baseQuery);

    if (error) throw new Error(`transaction chunk fetch failed: ${error.message}`);
    if (data.length === 0) return;

    yield data;
    if (data.length < EXPORT_CHUNK_SIZE) return;
    cursor = data[data.length - 1].id;
  }
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
    logSafe('export_fetch_error', { userId, error: firstError.message });
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
    logSafe('export_audit_error', { userId, error: auditError.message });
    return { ok: false, error: 'DATABASE_ERROR' };
  }

  return { ok: true, json };
}
