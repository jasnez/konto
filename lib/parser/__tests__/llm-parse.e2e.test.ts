// @vitest-environment node
// Opciono: poziva pravi Gemini API. Preskace se osim kad je `RUN_LLM_TESTS=1`.
// Pokreni ga rucno:
//   RUN_LLM_TESTS=1 GEMINI_API_KEY=...  pnpm exec vitest run "lib/parser/__tests__/llm-parse.e2e.test.ts"
// Ne pokreci na CI-u (kosta kredite).
import { describe, expect, it } from 'vitest';

import { parseStatementWithLLM, ParseResultSchema } from '../llm-parse';

const shouldRun = process.env.RUN_LLM_TESTS === '1' && Boolean(process.env.GEMINI_API_KEY);

describe.skipIf(!shouldRun)('parseStatementWithLLM (live Gemini API)', () => {
  it('obraduje kratak izvod i odgovara pod 10 sekundi', async () => {
    const sample = [
      'RAIFFEISEN BANK BH  — Izvod racuna',
      'Period: 01.04.2026 - 30.04.2026',
      'Valuta: BAM',
      '',
      '15.04.2026  BINGO MARKET SARAJEVO     -125,50',
      '18.04.2026  PLATA APRIL               +2500,00',
      '20.04.2026  BH TELECOM PRETPLATA       -45,00',
      '22.04.2026  SHELL PUMPA MOSTAR         -89,90',
    ].join('\n');

    const t0 = performance.now();
    const result = await parseStatementWithLLM(sample, 'Raiffeisen BH');
    const ms = performance.now() - t0;

    expect(ms).toBeLessThan(10_000);
    const validation = ParseResultSchema.safeParse(result);
    expect(validation.success).toBe(true);
    expect(result.transactions.length).toBeGreaterThan(0);
  }, 15_000);
});
