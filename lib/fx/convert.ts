import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { BAM_EUR_RATE, EUR_BAM_RATE } from './constants';
import { fetchEurQuoteRate } from './fetch-rate';

export type FxSource = 'identity' | 'currency_board' | 'ecb' | 'frankfurter' | 'stale';

interface FxRateEntry {
  rate: number;
  rateDate: string;
  source: 'ecb' | 'frankfurter';
}

export interface FxRateStore {
  getRateOnDate: (date: string, quote: string) => Promise<FxRateEntry | null>;
  getLatestRateBeforeDate: (date: string, quote: string) => Promise<FxRateEntry | null>;
  saveRate: (entry: {
    date: string;
    quote: string;
    rate: number;
    source: 'ecb' | 'frankfurter';
  }) => Promise<void>;
}

interface FxLeg {
  rate: number;
  rateDate: string;
  source: FxSource;
  stale: boolean;
}

let testStore: FxRateStore | null = null;
let adminClient: SupabaseClient<Database> | null | undefined;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function validateDate(date: string): void {
  if (!ISO_DATE_REGEX.test(date)) {
    throw new Error('FX date must be in ISO yyyy-mm-dd format');
  }
}

function getAdminClient(): SupabaseClient<Database> | null {
  if (adminClient !== undefined) {
    return adminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    adminClient = null;
    return adminClient;
  }

  adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return adminClient;
}

function sourceFromDb(value: string): 'ecb' | 'frankfurter' {
  return value === 'frankfurter' ? 'frankfurter' : 'ecb';
}

const defaultFxRateStore: FxRateStore = {
  async getRateOnDate(date, quote) {
    const supabase = getAdminClient();
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from('fx_rates')
      .select('date,rate,source')
      .eq('base', 'EUR')
      .eq('quote', quote)
      .eq('date', date)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      rate: data.rate,
      rateDate: data.date,
      source: sourceFromDb(data.source),
    };
  },

  async getLatestRateBeforeDate(date, quote) {
    const supabase = getAdminClient();
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from('fx_rates')
      .select('date,rate,source')
      .eq('base', 'EUR')
      .eq('quote', quote)
      .lt('date', date)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      rate: data.rate,
      rateDate: data.date,
      source: sourceFromDb(data.source),
    };
  },

  async saveRate(entry) {
    const supabase = getAdminClient();
    if (!supabase) {
      return;
    }

    await supabase.from('fx_rates').upsert(
      {
        date: entry.date,
        base: 'EUR',
        quote: entry.quote,
        rate: entry.rate,
        source: entry.source,
      },
      { onConflict: 'date,base,quote' },
    );
  },
};

function getFxRateStore(): FxRateStore {
  return testStore ?? defaultFxRateStore;
}

async function resolveEurToQuote(date: string, quoteCurrency: string): Promise<FxLeg> {
  if (quoteCurrency === 'EUR') {
    return { rate: 1, rateDate: date, source: 'identity', stale: false };
  }

  if (quoteCurrency === 'BAM') {
    return { rate: BAM_EUR_RATE, rateDate: date, source: 'currency_board', stale: false };
  }

  const store = getFxRateStore();
  const cached = await store.getRateOnDate(date, quoteCurrency);
  if (cached) {
    return {
      rate: cached.rate,
      rateDate: cached.rateDate,
      source: cached.source,
      stale: false,
    };
  }

  try {
    const fresh = await fetchEurQuoteRate(date, quoteCurrency);
    await store.saveRate({
      date: fresh.rateDate,
      quote: quoteCurrency,
      rate: fresh.rate,
      source: fresh.source,
    });

    return {
      rate: fresh.rate,
      rateDate: fresh.rateDate,
      source: fresh.source,
      stale: false,
    };
  } catch {
    const stale = await store.getLatestRateBeforeDate(date, quoteCurrency);
    if (stale) {
      return {
        rate: stale.rate,
        rateDate: stale.rateDate,
        source: 'stale',
        stale: true,
      };
    }
  }

  throw new Error(`FX rate unavailable for EUR/${quoteCurrency} on ${date}`);
}

function invertLeg(leg: FxLeg): FxLeg {
  return {
    rate: 1 / leg.rate,
    rateDate: leg.rateDate,
    source: leg.source,
    stale: leg.stale,
  };
}

async function resolveToEurRate(date: string, currency: string): Promise<FxLeg> {
  if (currency === 'EUR') {
    return { rate: 1, rateDate: date, source: 'identity', stale: false };
  }

  if (currency === 'BAM') {
    return { rate: EUR_BAM_RATE, rateDate: date, source: 'currency_board', stale: false };
  }

  const eurToCurrency = await resolveEurToQuote(date, currency);
  return invertLeg(eurToCurrency);
}

function combineSource(first: FxLeg, second: FxLeg): FxSource {
  if (first.stale || second.stale) {
    return 'stale';
  }
  if (first.source === 'frankfurter' || second.source === 'frankfurter') {
    return 'frankfurter';
  }
  return 'ecb';
}

function chooseRateDate(firstDate: string, secondDate: string, stale: boolean): string {
  if (!stale) {
    return firstDate >= secondDate ? firstDate : secondDate;
  }
  return firstDate <= secondDate ? firstDate : secondDate;
}

export function toCents(amountCents: bigint, rate: number): bigint {
  return BigInt(Math.round(Number(amountCents) * rate));
}

export function __setFxRateStoreForTests(store: FxRateStore | null): void {
  testStore = store;
}

export function __resetFxInternalsForTests(): void {
  adminClient = undefined;
  testStore = null;
}

export async function resolveFxRate(
  fromCurrency: string,
  toCurrency: string,
  date: string,
): Promise<{
  fxRate: number;
  fxRateDate: string;
  fxSource: FxSource;
  fxStale: boolean;
}> {
  validateDate(date);

  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);

  if (from === to) {
    return {
      fxRate: 1,
      fxRateDate: date,
      fxSource: 'identity',
      fxStale: false,
    };
  }

  if (from === 'BAM' && to === 'EUR') {
    return {
      fxRate: EUR_BAM_RATE,
      fxRateDate: date,
      fxSource: 'currency_board',
      fxStale: false,
    };
  }

  if (from === 'EUR' && to === 'BAM') {
    return {
      fxRate: BAM_EUR_RATE,
      fxRateDate: date,
      fxSource: 'currency_board',
      fxStale: false,
    };
  }

  const fromToEur = await resolveToEurRate(date, from);
  const eurToTarget = await resolveEurToQuote(date, to);
  const fxRate = fromToEur.rate * eurToTarget.rate;
  const fxStale = fromToEur.stale || eurToTarget.stale;

  return {
    fxRate,
    fxRateDate: chooseRateDate(fromToEur.rateDate, eurToTarget.rateDate, fxStale),
    fxSource: combineSource(fromToEur, eurToTarget),
    fxStale,
  };
}

export async function convertToBase(
  amountCents: bigint,
  fromCurrency: string,
  toCurrency: string,
  date: string,
): Promise<{
  baseCents: bigint;
  fxRate: number;
  fxRateDate: string;
  fxSource: FxSource;
  fxStale: boolean;
}> {
  const rate = await resolveFxRate(fromCurrency, toCurrency, date);
  return {
    baseCents: toCents(amountCents, rate.fxRate),
    ...rate,
  };
}
