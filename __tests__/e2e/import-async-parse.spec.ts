import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Database } from '@/supabase/types';
import { cleanupTestUser, signInAsTestUser } from './helpers';

/**
 * AV-2: verifies the async parse path end-to-end without invoking Gemini.
 *
 *   1. Create a batch with a deliberately fake `storage_path` (no real file).
 *   2. POST /api/imports/[id]/parse → expects 202 + status `enqueued`.
 *   3. Inngest worker picks up the event, the pipeline tries to download,
 *      Storage returns NoSuchKey, pipeline throws ParsePipelineError(pdf_not_found),
 *      worker writes status=`failed` + error_message=`pdf_not_found`.
 *
 * Requires:
 *   - IMPORTS_ASYNC=true in webServer env (set in worktree .env.local)
 *   - Inngest CLI dev server running on :8288 (auto-discovers the dev server
 *     and routes events to it).
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars for E2E admin client.');
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function inngestDevUp(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:8288/health', {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

test('AV-2: async parse 202 → enqueued → failed(pdf_not_found) @slow', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-safari', 'API-only flow.');
  const inngestReady = await inngestDevUp();
  test.skip(
    !inngestReady,
    'Inngest CLI dev server not detected on :8288. Run `pnpm exec inngest-cli dev -u http://127.0.0.1:4173/api/inngest --no-discovery`.',
  );

  test.setTimeout(90_000);

  const session = await signInAsTestUser(page);
  const admin = adminClient();

  const { data: account, error: accErr } = await admin
    .from('accounts')
    .select('id')
    .eq('user_id', session.userId)
    .is('deleted_at', null)
    .limit(1)
    .single();
  if (accErr) throw new Error(`E2E: missing account for ${session.userId}: ${accErr.message}`);

  const fakeChecksum = `e2e-${randomUUID()}`;
  const fakePath = `${session.userId}/non-existent-${randomUUID()}.pdf`;

  const { data: batch, error: batchErr } = await admin
    .from('import_batches')
    .insert({
      user_id: session.userId,
      account_id: account.id,
      storage_path: fakePath,
      checksum: fakeChecksum,
      original_filename: 'av2-async-test.pdf',
      status: 'uploaded',
    })
    .select('id')
    .single();
  if (batchErr) throw new Error(`E2E: insert batch failed: ${batchErr.message}`);

  try {
    const res = await page.request.post(`/api/imports/${batch.id}/parse`);
    expect(
      res.status(),
      'POST should return 202 in async mode — verify IMPORTS_ASYNC=true in webServer .env.local',
    ).toBe(202);
    expect(await res.json()).toEqual({ enqueued: true });

    const { data: enqueued } = await admin
      .from('import_batches')
      .select('status')
      .eq('id', batch.id)
      .single();
    expect(enqueued?.status).toBe('enqueued');

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('import_batches')
            .select('status, error_message')
            .eq('id', batch.id)
            .single();
          return data;
        },
        {
          timeout: 60_000,
          intervals: [1000, 2000, 3000, 5000],
          message: 'Inngest worker should mark batch as failed(pdf_not_found) within 60s',
        },
      )
      .toMatchObject({
        status: 'failed',
        error_message: 'pdf_not_found',
      });
  } finally {
    await admin.from('import_batches').delete().eq('id', batch.id);
    await cleanupTestUser(session.userId);
  }
});
