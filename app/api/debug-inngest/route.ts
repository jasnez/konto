import { NextResponse } from 'next/server';

/**
 * Temporary debug endpoint — isolates which import is crashing /api/inngest.
 * DELETE after diagnosis is complete.
 */
export const runtime = 'nodejs';

export async function GET() {
  const results: Record<string, string> = {};

  const tryImport = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      results[label] = 'ok';
    } catch (e) {
      results[label] =
        e instanceof Error ? `${e.message}\n${String(e.stack).slice(0, 400)}` : String(e);
    }
  };

  await tryImport('inngest/client', () => import('@/lib/inngest/client'));
  await tryImport('parse-pipeline', () => import('@/lib/parser/parse-pipeline'));
  await tryImport('extract-text', () => import('@/lib/parser/extract-text'));
  await tryImport('llm-parse', () => import('@/lib/parser/llm-parse'));
  await tryImport('ocr-fallback', () => import('@/lib/parser/ocr-fallback'));
  await tryImport('parse-import-fn', () => import('@/lib/inngest/functions/parse-import'));
  await tryImport('watchdog-fn', () => import('@/lib/inngest/functions/watchdog-stuck-imports'));
  await tryImport('inngest/serve', () => import('inngest/next'));

  return NextResponse.json(results);
}
