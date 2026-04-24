import { describe, expect, it, vi } from 'vitest';
import {
  type CategorizationCascadeClient,
  type CategorizationResult,
  LLM_FALLBACK_MIN_AMOUNT_MINOR,
  normalizeDescription,
  parseCascadeResult,
  runCategorizationCascade,
} from '@/lib/categorization/cascade';
import type { Json } from '@/supabase/types';

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

function makeRpcMock(payload: Json | null, error: { message: string } | null = null) {
  const calls: RpcCall[] = [];
  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return Promise.resolve({ data: payload, error });
  });
  return {
    supabase: { rpc } as unknown as CategorizationCascadeClient,
    calls,
    rpc,
  };
}

const baseInput = (overrides: Partial<Parameters<typeof runCategorizationCascade>[1]> = {}) => ({
  description: 'KONZUM BL',
  userId: '00000000-0000-0000-0000-000000000001',
  amountMinor: -4350,
  ...overrides,
});

describe('normalizeDescription', () => {
  it('lowercases and trims', () => {
    expect(normalizeDescription('  KONZUM BL  ')).toBe('konzum bl');
  });

  it('collapses repeated whitespace', () => {
    expect(normalizeDescription('konzum    bl\tBANJA  LUKA')).toBe('konzum bl banja luka');
  });

  it('strips punctuation but keeps spaces between tokens', () => {
    expect(normalizeDescription('Konzum, BL.')).toBe('konzum bl');
    expect(normalizeDescription('BH-Telecom (mobitel) #123!')).toBe('bh telecom mobitel 123');
  });

  it('preserves Unicode letters and digits', () => {
    expect(normalizeDescription('Šparkasse 123')).toBe('šparkasse 123');
    expect(normalizeDescription('ćevapdžinica Željo')).toBe('ćevapdžinica željo');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeDescription('   ')).toBe('');
  });
});

describe('parseCascadeResult', () => {
  const noneResult: CategorizationResult = { source: 'none', confidence: 0 };

  it('returns none for null payload', () => {
    expect(parseCascadeResult(null)).toEqual(noneResult);
  });

  it('returns none for unexpected primitive payload', () => {
    expect(parseCascadeResult(42)).toEqual(noneResult);
    expect(parseCascadeResult('rule')).toEqual(noneResult);
  });

  it('returns none for arrays', () => {
    expect(parseCascadeResult([])).toEqual(noneResult);
  });

  it('parses a rule hit with confidence 1', () => {
    const result = parseCascadeResult({
      source: 'rule',
      confidence: 1,
      merchant_id: 'merchant-1',
      category_id: 'category-1',
      rule_id: 'rule-1',
    });
    const expected: CategorizationResult = {
      source: 'rule',
      confidence: 1,
      merchantId: 'merchant-1',
      categoryId: 'category-1',
    };
    expect(result).toEqual(expected);
  });

  it('parses confidence delivered as numeric string (jsonb path)', () => {
    expect(parseCascadeResult({ source: 'alias_fuzzy', confidence: '0.85' }).confidence).toBe(0.85);
  });

  it('clamps confidence into [0, 1]', () => {
    expect(parseCascadeResult({ source: 'history', confidence: 1.5 }).confidence).toBe(1);
    expect(parseCascadeResult({ source: 'history', confidence: -0.2 }).confidence).toBe(0);
    expect(parseCascadeResult({ source: 'history', confidence: 'NaN' }).confidence).toBe(0);
  });

  it('drops merchant_id / category_id when missing or non-string', () => {
    const result = parseCascadeResult({
      source: 'none',
      confidence: 0,
      merchant_id: null,
      category_id: 42,
    });
    expect(result.merchantId).toBeUndefined();
    expect(result.categoryId).toBeUndefined();
  });

  it('coerces unknown source to none', () => {
    expect(parseCascadeResult({ source: 'embedding', confidence: 0.9 }).source).toBe('none');
  });
});

describe('runCategorizationCascade', () => {
  it('short-circuits on empty description without calling the RPC', async () => {
    const { supabase, rpc } = makeRpcMock(null);
    const result = await runCategorizationCascade(supabase, baseInput({ description: '' }));
    expect(result).toEqual<CategorizationResult>({ source: 'none', confidence: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('short-circuits on whitespace-only description', async () => {
    const { supabase, rpc } = makeRpcMock(null);
    const result = await runCategorizationCascade(supabase, baseInput({ description: '   \t  ' }));
    expect(result.source).toBe('none');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('forwards trimmed description and signed amount to the RPC', async () => {
    const { supabase, calls } = makeRpcMock({
      source: 'none',
      confidence: 0,
    });
    await runCategorizationCascade(
      supabase,
      baseInput({ description: '  Konzum BL  ', amountMinor: -4350 }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      fn: 'run_categorization_cascade',
      args: { p_description: 'Konzum BL', p_amount_minor: -4350 },
    });
  });

  it('returns rule match with confidence 1', async () => {
    const { supabase } = makeRpcMock({
      source: 'rule',
      confidence: 1,
      merchant_id: 'm-rule',
      category_id: 'c-rule',
      rule_id: 'r-1',
    });
    const result = await runCategorizationCascade(supabase, baseInput());
    const expected: CategorizationResult = {
      source: 'rule',
      confidence: 1,
      merchantId: 'm-rule',
      categoryId: 'c-rule',
    };
    expect(result).toEqual(expected);
  });

  it('returns alias_exact match with confidence 1', async () => {
    const { supabase } = makeRpcMock({
      source: 'alias_exact',
      confidence: 1,
      merchant_id: 'm-alias',
      category_id: 'c-alias',
    });
    const result = await runCategorizationCascade(supabase, baseInput());
    expect(result.source).toBe('alias_exact');
    expect(result.confidence).toBe(1);
    expect(result.merchantId).toBe('m-alias');
  });

  it('returns alias_fuzzy when SQL reports score >= 0.75', async () => {
    const { supabase } = makeRpcMock({
      source: 'alias_fuzzy',
      confidence: 0.84,
      merchant_id: 'm-fuzzy',
      category_id: 'c-fuzzy',
    });
    const result = await runCategorizationCascade(supabase, baseInput());
    expect(result.source).toBe('alias_fuzzy');
    expect(result.confidence).toBe(0.84);
  });

  it('falls through to whatever SQL returns when fuzzy score is sub-threshold', async () => {
    // SQL is the source of truth for the 0.75 cut-off. When fuzzy score is
    // below 0.75 the RPC returns history or none — we should surface that.
    const { supabase } = makeRpcMock({
      source: 'history',
      confidence: 0.62,
      merchant_id: 'm-hist',
      category_id: 'c-hist',
    });
    const result = await runCategorizationCascade(supabase, baseInput());
    expect(result.source).toBe('history');
    expect(result.confidence).toBeCloseTo(0.62);
    expect(result.categoryId).toBe('c-hist');
  });

  it('returns history fallback', async () => {
    const { supabase } = makeRpcMock({
      source: 'history',
      confidence: 0.7,
      category_id: 'c-hist',
    });
    const result = await runCategorizationCascade(supabase, baseInput());
    const expectedHistory: CategorizationResult = {
      source: 'history',
      confidence: 0.7,
      categoryId: 'c-hist',
    };
    expect(result).toEqual(expectedHistory);
  });

  it('returns none for empty cascade result', async () => {
    const { supabase } = makeRpcMock({ source: 'none', confidence: 0 });
    const result = await runCategorizationCascade(supabase, baseInput());
    const expectedNone: CategorizationResult = { source: 'none', confidence: 0 };
    expect(result).toEqual(expectedNone);
  });

  it('treats RPC errors as none rather than throwing', async () => {
    const { supabase } = makeRpcMock(null, { message: 'connection lost' });
    const result = await runCategorizationCascade(supabase, baseInput());
    const expectedNone: CategorizationResult = { source: 'none', confidence: 0 };
    expect(result).toEqual(expectedNone);
  });

  it('treats malformed RPC payload as none', async () => {
    const { supabase } = makeRpcMock(['rule', 1]);
    const result = await runCategorizationCascade(supabase, baseInput());
    expect(result.source).toBe('none');
  });
});

describe('LLM_FALLBACK_MIN_AMOUNT_MINOR', () => {
  it('is 50 KM in minor units', () => {
    expect(LLM_FALLBACK_MIN_AMOUNT_MINOR).toBe(5000);
  });
});
