import { createClient } from '@/lib/supabase/server';
import { buildUserExportJsonForRequest } from '@/lib/export/build-user-export-json';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await buildUserExportJsonForRequest(supabase, user.id);

  if (!result.ok) {
    if (result.error === 'RATE_LIMITED') {
      return new Response('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '3600' },
      });
    }
    return new Response('Internal Server Error', { status: 500 });
  }

  const date = new Date().toISOString().split('T')[0];

  return new Response(result.json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="konto-export-${date}.json"`,
    },
  });
}
