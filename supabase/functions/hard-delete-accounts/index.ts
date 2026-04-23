/**
 * Dnevni hard-delete za naloge sa isteklim soft-delete prozorom (30 dana).
 *
 * Poziv (npr. Supabase cron ili ručno):
 *   curl -X POST "$SUPABASE_URL/functions/v1/hard-delete-accounts" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Secrets: postavi `CRON_SECRET` u Supabase Dashboard → Edge Functions → Secrets.
 * Lokalno: `supabase secrets set CRON_SECRET=...` prije `supabase functions serve`.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

export async function handleHardDeleteAccounts(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = request.headers.get('Authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('hard_delete_accounts_missing_env');
    return json(500, { ok: false, error: 'configuration' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error: queryError } = await admin
    .from('profiles')
    .select('id')
    .not('deleted_at', 'is', null)
    .lte('deleted_at', cutoff);

  if (queryError) {
    console.error('hard_delete_accounts_query', queryError.message);
    return json(500, { ok: false, error: 'query_failed' });
  }

  const ids = (rows ?? []).map((r: { id: string }) => r.id);
  let deleted = 0;

  for (const id of ids) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) {
      console.error('hard_delete_accounts_delete_user', { userId: id, error: deleteError.message });
      continue;
    }

    const { error: auditError } = await admin.from('audit_log').insert({
      user_id: null,
      event_type: 'account_deleted',
      event_data: {},
    });
    if (auditError) {
      console.error('hard_delete_accounts_audit', { error: auditError.message });
    }

    deleted += 1;
  }

  return json(200, { ok: true, candidates: ids.length, deleted });
}

declare global {
  interface DenoLike {
    serve?: (handler: (request: Request) => Response | Promise<Response>) => void;
  }
}

const denoRuntime = (globalThis as { Deno?: DenoLike }).Deno;

if (denoRuntime?.serve) {
  denoRuntime.serve((req) => handleHardDeleteAccounts(req));
}
