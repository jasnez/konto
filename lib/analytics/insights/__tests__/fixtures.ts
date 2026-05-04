/**
 * Shared fixtures for insight detector tests. Each helper returns a literal
 * shape — no real Supabase calls. Detectors are pure functions over context.
 */
import type {
  DetectorContext,
  InsightsAccountRow,
  InsightsTxRow,
} from '../types';
import type { BudgetWithProgress } from '@/lib/queries/budgets';
import type { ActiveRecurring } from '@/lib/queries/recurring';

let TX_SEQ = 0;
function nextTxId(): string {
  TX_SEQ += 1;
  return `tx-${String(TX_SEQ).padStart(4, '0')}`;
}

let CAT_SEQ = 0;
function nextCategoryId(): string {
  CAT_SEQ += 1;
  return `cat-${String(CAT_SEQ).padStart(2, '0')}`;
}

export function freshIds(): void {
  TX_SEQ = 0;
  CAT_SEQ = 0;
}

// ─── Tx factory ───────────────────────────────────────────────────────────────

export interface MakeTxOpts {
  /** YYYY-MM-DD or Date. */
  date: string | Date;
  /** Negative for expenses (default −2500). */
  amountCents?: number | bigint;
  currency?: string;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryKind?: InsightsTxRow['categoryKind'];
  recurringId?: string | null;
  merchantName?: string | null;
}

function isoDate(d: string | Date): string {
  if (typeof d === 'string') return d;
  return d.toISOString().slice(0, 10);
}

export function makeTx(opts: MakeTxOpts): InsightsTxRow {
  const amount = opts.amountCents ?? -2500;
  return {
    id: nextTxId(),
    transactionDate: isoDate(opts.date),
    baseAmountCents: typeof amount === 'bigint' ? amount : BigInt(amount),
    currency: opts.currency ?? 'BAM',
    categoryId: opts.categoryId ?? null,
    recurringId: opts.recurringId ?? null,
    merchantName: opts.merchantName ?? null,
    categoryName: opts.categoryName ?? null,
    categoryKind: opts.categoryKind ?? 'expense',
  };
}

// ─── Budget factory ───────────────────────────────────────────────────────────

export interface MakeBudgetOpts {
  id?: string;
  amountCents?: bigint;
  spentCents?: bigint;
  period?: 'monthly' | 'weekly';
  active?: boolean;
  daysLeft?: number;
  categoryId?: string;
  categoryName?: string;
  currency?: string;
}

let BUDGET_SEQ = 0;
function nextBudgetId(): string {
  BUDGET_SEQ += 1;
  return `bud-${String(BUDGET_SEQ).padStart(2, '0')}`;
}

export function makeBudget(opts: MakeBudgetOpts = {}): BudgetWithProgress {
  const amount = opts.amountCents ?? 50000n;
  const spent = opts.spentCents ?? 0n;
  return {
    id: opts.id ?? nextBudgetId(),
    amountCents: amount,
    currency: opts.currency ?? 'BAM',
    period: opts.period ?? 'monthly',
    active: opts.active ?? true,
    rollover: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    category: {
      id: opts.categoryId ?? nextCategoryId(),
      name: opts.categoryName ?? 'Hrana',
      slug: 'hrana',
      icon: '🍎',
      color: null,
      kind: 'expense',
    },
    spentCents: spent,
    progress: amount === 0n ? 0 : Math.min(1, Number(spent) / Number(amount)),
    daysLeft: opts.daysLeft ?? 15,
  };
}

// ─── Recurring factory ────────────────────────────────────────────────────────

export interface MakeRecurringOpts {
  id?: string;
  description?: string;
  period?: ActiveRecurring['period'];
  averageAmountCents?: bigint;
  currency?: string;
  lastSeenDate?: string | null;
  isPaused?: boolean;
  occurrences?: number;
  categoryId?: string | null;
  categoryName?: string | null;
}

let REC_SEQ = 0;
function nextRecurringId(): string {
  REC_SEQ += 1;
  return `rec-${String(REC_SEQ).padStart(2, '0')}`;
}

export function makeRecurring(opts: MakeRecurringOpts = {}): ActiveRecurring {
  return {
    id: opts.id ?? nextRecurringId(),
    description: opts.description ?? 'Netflix',
    period: opts.period ?? 'monthly',
    averageAmountCents: opts.averageAmountCents ?? 1500n,
    currency: opts.currency ?? 'BAM',
    nextExpectedDate: null,
    lastSeenDate: opts.lastSeenDate ?? '2026-04-15',
    pausedUntil: null,
    isPaused: opts.isPaused ?? false,
    detectionConfidence: 0.9,
    occurrences: opts.occurrences ?? 6,
    merchantId: null,
    categoryId: opts.categoryId ?? null,
    accountId: null,
    merchantName: null,
    categoryName: opts.categoryName ?? null,
    accountName: null,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

// ─── Account factory ──────────────────────────────────────────────────────────

export function makeAccount(
  overrides: Partial<InsightsAccountRow> = {},
): InsightsAccountRow {
  return {
    id: overrides.id ?? 'acc-01',
    name: overrides.name ?? 'Glavni',
    currency: overrides.currency ?? 'BAM',
    baseBalanceCents: overrides.baseBalanceCents ?? 100000n,
  };
}

// ─── Context builder ──────────────────────────────────────────────────────────

export interface MakeContextOpts {
  today?: Date;
  baseCurrency?: string;
  transactions?: InsightsTxRow[];
  budgets?: BudgetWithProgress[];
  recurring?: ActiveRecurring[];
  accounts?: InsightsAccountRow[];
  liveDedupKeys?: ReadonlySet<string>;
}

/**
 * Builds a minimal DetectorContext for tests. Supabase is stubbed with a
 * never-call sentinel — detectors are pure and shouldn't touch it.
 */
export function makeContext(opts: MakeContextOpts = {}): DetectorContext {
  const supabaseStub = {
    from: () => {
      throw new Error('detector should not query supabase');
    },
    rpc: () => {
      throw new Error('detector should not call supabase.rpc');
    },
  } as unknown as DetectorContext['supabase'];

  return {
    userId: 'user-test',
    supabase: supabaseStub,
    baseCurrency: opts.baseCurrency ?? 'BAM',
    today: opts.today ?? new Date('2026-05-04T12:00:00Z'),
    transactions: opts.transactions ?? [],
    budgets: opts.budgets ?? [],
    recurring: opts.recurring ?? [],
    accounts: opts.accounts ?? [],
    liveDedupKeys: opts.liveDedupKeys ?? new Set<string>(),
  };
}

// ─── Time series helpers ──────────────────────────────────────────────────────

/**
 * Generate `count` daily transactions starting at `start` for the same
 * category. Useful for filling baseline windows.
 */
export function dailyTxs(
  start: string,
  count: number,
  opts: Omit<MakeTxOpts, 'date'>,
): InsightsTxRow[] {
  const out: InsightsTxRow[] = [];
  const startDate = new Date(start);
  for (let i = 0; i < count; i += 1) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(makeTx({ ...opts, date: d }));
  }
  return out;
}
