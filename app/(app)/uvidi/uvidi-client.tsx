'use client';

/**
 * /uvidi client wrapper. Owns:
 *   - Tab state (active / archived).
 *   - Filter state (severity multi-select, type multi-select).
 *   - Optimistic dismiss + restore via `useInsightDismiss`.
 *   - Dev-only "Generiši ponovo" trigger.
 *
 * The Server Component fetches both lists in parallel and passes serialized
 * rows. Insight rows have no bigint columns so deserialisation is a no-op.
 */
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InsightCard } from '@/components/insights/insight-card';
import { useInsightDismiss } from '@/hooks/use-insight-dismiss';
import { regenerateInsights } from './actions';
import type {
  InsightRow,
  InsightSeverity,
  InsightType,
} from '@/lib/queries/insights';
import {
  SEVERITIES_DISPLAY_ORDER,
  severityClasses,
} from '@/lib/insights/severity-palette';
import { TYPES_DISPLAY_ORDER, typeLabel } from '@/lib/insights/type-labels';

export interface UvidiClientProps {
  active: InsightRow[];
  archived: InsightRow[];
  isDev: boolean;
}

type TabValue = 'active' | 'archived';

const REGENERATE_ERROR_COPY: Record<string, string> = {
  UNAUTHORIZED: 'Sesija je istekla.',
  RATE_LIMITED: 'Pričekaj malo prije ponovnog pokretanja.',
  DATABASE_ERROR: 'Greška u bazi. Pokušaj ponovo.',
};

export function UvidiClient({ active, archived, isDev }: UvidiClientProps) {
  const [tab, setTab] = useState<TabValue>('active');
  const [severityFilters, setSeverityFilters] = useState<Set<InsightSeverity>>(
    () => new Set<InsightSeverity>(),
  );
  const [typeFilters, setTypeFilters] = useState<Set<InsightType>>(
    () => new Set<InsightType>(),
  );

  // Optimistic state for the active tab. Archive tab doesn't optimistically
  // update because there's no "vanishing" UX there (the row stays visible
  // post-restore until the server-side re-fetch).
  const [activeVisible, setActiveVisible] = useState<InsightRow[]>(active);
  // After router.refresh() the parent passes a new `active` prop. Sync the
  // local optimistic state to the server truth — this makes the optimistic
  // remove "stick" once the server confirms (or rolls back if it didn't).
  useEffect(() => {
    setActiveVisible(active);
  }, [active]);

  const { handleDismiss, handleRestore, pending } = useInsightDismiss({
    onOptimisticRemove: (id) => {
      setActiveVisible((prev) => prev.filter((x) => x.id !== id));
    },
    onRollback: () => {
      setActiveVisible(active);
    },
    onUndismissConfirmed: () => {
      // router.refresh() inside the hook reloads server data; the local
      // copy will get re-seeded on next render via the server prop.
      setActiveVisible(active);
    },
  });

  const filteredActive = useMemo(
    () => filterInsights(activeVisible, severityFilters, typeFilters),
    [activeVisible, severityFilters, typeFilters],
  );
  const filteredArchived = useMemo(
    () => filterInsights(archived, severityFilters, typeFilters),
    [archived, severityFilters, typeFilters],
  );

  function toggleSeverity(s: InsightSeverity): void {
    setSeverityFilters((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleType(t: InsightType): void {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function clearFilters(): void {
    setSeverityFilters(new Set());
    setTypeFilters(new Set());
  }

  const filtersActive = severityFilters.size > 0 || typeFilters.size > 0;

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Uvidi</h1>
          <p className="text-sm text-muted-foreground">
            Anomalije, prilike za uštedu i upozorenja — generisana iz tvojih transakcija.
          </p>
        </div>
        {isDev && <RegenerateDevButton />}
      </header>

      {/* Filters */}
      <section aria-label="Filteri" className="space-y-2">
        <FilterRow label="Hitnost">
          {SEVERITIES_DISPLAY_ORDER.map((s) => (
            <Chip
              key={s}
              size="sm"
              active={severityFilters.has(s)}
              onClick={() => {
                toggleSeverity(s);
              }}
            >
              {severityClasses(s).label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Vrsta">
          {TYPES_DISPLAY_ORDER.map((t) => (
            <Chip
              key={t}
              size="sm"
              active={typeFilters.has(t)}
              onClick={() => {
                toggleType(t);
              }}
            >
              {typeLabel(t)}
            </Chip>
          ))}
        </FilterRow>
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={clearFilters}
          >
            Poništi filtere
          </Button>
        )}
      </section>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (v === 'active' || v === 'archived') setTab(v);
        }}
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="active">
            Aktivni
            {activeVisible.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">
                {String(activeVisible.length)}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived">
            Arhiva
            {archived.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">
                {String(archived.length)}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4 space-y-3">
          {filteredActive.length === 0 ? (
            <EmptyState
              title="Nema aktivnih uvida"
              description={
                filtersActive
                  ? 'Ne odgovara nijedan filter. Probaj poništiti filtere.'
                  : 'Sve je u redu — nema novih anomalija ili upozorenja.'
              }
            />
          ) : (
            filteredActive.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                mode="active"
                onDismiss={(id) => {
                  if (!pending) handleDismiss(id);
                }}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="archived" className="mt-4 space-y-3">
          {filteredArchived.length === 0 ? (
            <EmptyState
              title="Nema arhiviranih uvida"
              description={
                filtersActive
                  ? 'Ne odgovara nijedan filter.'
                  : 'Tvoji odbačeni uvidi pojaviće se ovdje.'
              }
            />
          ) : (
            filteredArchived.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                mode="archived"
                onRestore={(id) => {
                  if (!pending) handleRestore(id);
                }}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterInsights(
  rows: InsightRow[],
  severityFilters: Set<InsightSeverity>,
  typeFilters: Set<InsightType>,
): InsightRow[] {
  if (severityFilters.size === 0 && typeFilters.size === 0) return rows;
  return rows.filter((r) => {
    if (severityFilters.size > 0 && !severityFilters.has(r.severity)) return false;
    if (typeFilters.size > 0 && !typeFilters.has(r.type)) return false;
    return true;
  });
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
      <Sparkles className="h-7 w-7 text-emerald-500" aria-hidden />
      <h3 className="text-base font-medium">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function RegenerateDevButton() {
  const [pending, startTransition] = useTransition();

  function handleClick(): void {
    startTransition(() => {
      void (async () => {
        const result = await regenerateInsights();
        if (result.success) {
          toast.success(`Generisano: ${String(result.data.created)} novih uvida.`);
          return;
        }
        if (result.error === 'RATE_LIMITED') {
          toast.error(
            `Pričekaj još ${String(result.retryAfterSeconds)}s prije ponovnog pokretanja.`,
          );
          return;
        }
        toast.error(REGENERATE_ERROR_COPY[result.error] ?? 'Nepoznata greška.');
      })();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={pending}>
      🧪 Generiši ponovo
    </Button>
  );
}
