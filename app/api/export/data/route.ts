import { createClient } from '@/lib/supabase/server';
import {
  gateExportRateLimit,
  logExportAuditStart,
  fetchExportHeader,
} from '@/lib/export/build-user-export-json';
import { buildExportStream } from '@/lib/export/stream-builder';
import { logSafe } from '@/lib/logger';

export const runtime = 'nodejs';
// 60s = Vercel Hobby plan ceiling. On Pro upgrade bump to 300.
export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const gate = await gateExportRateLimit(supabase, user.id);
  if (gate === 'block') {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': '3600' },
    });
  }
  if (gate === 'error') {
    return new Response('Internal Server Error', { status: 500 });
  }

  // Audit log before streaming — if this fails, no bytes are sent and rate limit is not consumed.
  const auditOk = await logExportAuditStart(supabase, user.id);
  if (!auditOk) {
    return new Response('Internal Server Error', { status: 500 });
  }

  let header;
  try {
    header = await fetchExportHeader(supabase, user.id);
  } catch (err) {
    logSafe('export_header_fetch_failed', { userId: user.id, error: String(err) });
    return new Response('Internal Server Error', { status: 500 });
  }

  const stream = buildExportStream(supabase, user.id, header);
  const date = new Date().toISOString().split('T')[0];

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="konto-export-${date}.json"`,
    },
  });
}
