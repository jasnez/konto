'use client';

import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from 'react';
import { toast } from 'sonner';
import { searchMerchants, type MerchantResult } from '@/app/(app)/merchants/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parseMoneyString } from '@/lib/format/amount';
import {
  bulkApplyCategoryToParsedRows,
  finalizeImport,
  rejectImport,
  updateParsedTransaction,
} from '@/lib/server/actions/imports';
import { cn } from '@/lib/utils';

const CATEGORY_NONE = '__none__';

export interface ReviewCategoryOption {
  id: string;
  name: string;
}

export interface ReviewParsedRow {
  id: string;
  transaction_date: string;
  raw_description: string;
  amount_minor: number;
  currency: string;
  category_id: string | null;
  merchant_id: string | null;
  selected_for_import: boolean;
  parse_confidence: 'high' | 'medium' | 'low' | null;
  categorization_source:
    | 'rule'
    | 'alias_exact'
    | 'alias_fuzzy'
    | 'history'
    | 'llm'
    | 'none'
    | 'user';
  categorization_confidence: number;
}

interface BatchHeaderModel {
  bankLabel: string;
  fileName: string;
  parseConfidence: 'high' | 'medium' | 'low' | null;
  parseWarnings: string[];
  periodStart: string | null;
  periodEnd: string | null;
}

interface ImportReviewClientProps {
  batchId: string;
  initialRows: ReviewParsedRow[];
  categories: ReviewCategoryOption[];
  batch: BatchHeaderModel;
}

function confidenceLabel(c: 'high' | 'medium' | 'low' | null): string {
  switch (c) {
    case 'high':
      return 'Visoka pouzdanost';
    case 'medium':
      return 'Srednja pouzdanost';
    case 'low':
      return 'Niska pouzdanost';
    default:
      return 'Nepoznato';
  }
}

function confidenceBadgeClass(c: 'high' | 'medium' | 'low' | null): string {
  switch (c) {
    case 'high':
      return 'border-primary/30 bg-primary/10 text-foreground';
    case 'medium':
      return 'border-border bg-muted text-foreground';
    case 'low':
      return 'border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/15 text-foreground';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

function formatStatementPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  try {
    const a = start ? format(parseISO(start), 'd. MMM yyyy.', { locale: bs }) : '…';
    const b = end ? format(parseISO(end), 'd. MMM yyyy.', { locale: bs }) : '…';
    return `${a} – ${b}`;
  } catch {
    return '—';
  }
}

function minorToEditableInput(minor: number): string {
  const major = minor / 100;
  return major.toLocaleString('bs-BA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCategorizationConfidence(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `${String(pct)}%`;
}

function categorizationBadgeMeta(source: ReviewParsedRow['categorization_source']): {
  label: string;
  className: string;
} {
  switch (source) {
    case 'rule':
    case 'alias_exact':
      return {
        label: 'Auto',
        className: 'border-primary/30 bg-primary/10 text-foreground',
      };
    case 'alias_fuzzy':
    case 'history':
      return {
        label: 'Provjeri',
        className: 'border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/15 text-foreground',
      };
    case 'llm':
      return {
        label: 'AI predlog',
        className: 'border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/20 text-foreground',
      };
    case 'user':
      return {
        label: 'Ručno',
        className: 'border-border bg-muted text-foreground',
      };
    case 'none':
    default:
      return {
        label: 'Nije kategorisano',
        className: 'border-destructive/40 bg-destructive/10 text-foreground',
      };
  }
}

type PendingPatch = Partial<{
  transaction_date: string;
  raw_description: string;
  amount_minor: number;
}>;

export function ImportReviewClient({
  batchId,
  initialRows,
  categories,
  batch,
}: ImportReviewClientProps) {
  const router = useRouter();
  const [rows, setRows] = useState<ReviewParsedRow[]>(() => initialRows);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkIds, setBulkIds] = useState<Set<string>>(() => new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState<string>(CATEGORY_NONE);
  const [isWorking, startTransition] = useTransition();

  const pendingByRow = useRef(new Map<string, PendingPatch>());
  const debounceTimers = useRef(new Map<string, number>());

  const flushRowDebounced = useCallback(
    (rowId: string) => {
      const t = debounceTimers.current.get(rowId);
      if (t !== undefined) {
        window.clearTimeout(t);
        debounceTimers.current.delete(rowId);
      }
      const pending = pendingByRow.current.get(rowId);
      if (pending === undefined || Object.keys(pending).length === 0) {
        return;
      }
      pendingByRow.current.delete(rowId);
      void (async () => {
        const res = await updateParsedTransaction({
          id: rowId,
          batchId,
          ...pending,
        });
        if (!res.success) {
          toast.error(
            res.error === 'VALIDATION_ERROR'
              ? (res.details._root[0] ?? 'Greška')
              : 'Greška pri snimanju.',
          );
        }
      })();
    },
    [batchId],
  );

  const scheduleRowPatch = useCallback(
    (rowId: string, patch: PendingPatch) => {
      const prev = pendingByRow.current.get(rowId);
      pendingByRow.current.set(rowId, { ...prev, ...patch });
      const existing = debounceTimers.current.get(rowId);
      if (existing !== undefined) window.clearTimeout(existing);
      debounceTimers.current.set(
        rowId,
        window.setTimeout(() => {
          flushRowDebounced(rowId);
        }, 400),
      );
    },
    [flushRowDebounced],
  );

  const patchRowLocal = useCallback((rowId: string, patch: Partial<ReviewParsedRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }, []);

  useEffect(() => {
    return () => {
      for (const t of debounceTimers.current.values()) {
        window.clearTimeout(t);
      }
      debounceTimers.current.clear();
    };
  }, []);

  const importSelectedCount = useMemo(
    () => rows.filter((r) => r.selected_for_import).length,
    [rows],
  );

  const toggleImport = useCallback(
    (rowId: string, checked: boolean) => {
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, selected_for_import: checked } : r)),
      );
      void (async () => {
        const res = await updateParsedTransaction({
          id: rowId,
          batchId,
          selected_for_import: checked,
        });
        if (!res.success) {
          toast.error('Nije moguće ažurirati odabir.');
          router.refresh();
        }
      })();
    },
    [batchId, router],
  );

  const excludeRow = useCallback(
    (rowId: string) => {
      toggleImport(rowId, false);
    },
    [toggleImport],
  );

  const setCategory = useCallback(
    (rowId: string, categoryId: string | null) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                category_id: categoryId,
                categorization_source: categoryId ? 'user' : 'none',
                categorization_confidence: categoryId ? 1 : 0,
              }
            : r,
        ),
      );
      void (async () => {
        const res = await updateParsedTransaction({
          id: rowId,
          batchId,
          category_id: categoryId,
        });
        if (!res.success) {
          toast.error('Kategorija nije snimljena.');
          return;
        }
        if (res.data?.aliasCreated === true) {
          toast.success('Naučio sam — sljedeći put ću ovo automatski kategorisati.');
        }
      })();
    },
    [batchId],
  );

  const setMerchantForRow = useCallback(
    (rowId: string, merchant: MerchantResult | null) => {
      const merchantId = merchant?.id ?? null;
      const categoryId = merchant?.default_category_id ?? null;
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                merchant_id: merchantId,
                category_id: categoryId ?? r.category_id,
                categorization_source: merchantId || categoryId ? 'user' : r.categorization_source,
                categorization_confidence:
                  merchantId || categoryId ? 1 : r.categorization_confidence,
              }
            : r,
        ),
      );
      void (async () => {
        const res = await updateParsedTransaction({
          id: rowId,
          batchId,
          merchant_id: merchantId,
          ...(categoryId ? { category_id: categoryId } : {}),
        });
        if (!res.success) {
          toast.error('Trgovac nije snimljen.');
          return;
        }
        if (res.data?.aliasCreated === true) {
          toast.success('Naučio sam — sljedeći put ću ovo automatski kategorisati.');
        }
      })();
    },
    [batchId],
  );

  const doConfirm = useCallback(
    (bypassCategoryCheck: boolean) => {
      // UX-7: warn before finalizing if any selected row has no category.
      const uncategorizedCount = rows.filter(
        (r) => r.selected_for_import && r.category_id === null,
      ).length;
      if (uncategorizedCount > 0 && !bypassCategoryCheck) {
        toast.warning(
          `${String(uncategorizedCount)} ${uncategorizedCount === 1 ? 'stavka nema' : 'stavki nemaju'} kategoriju.`,
          {
            description: 'Možeš nastaviti ili dodijeliti kategorije.',
            action: {
              label: 'Nastavi svejedno',
              onClick: () => {
                doConfirm(true);
              },
            },
            duration: 8000,
          },
        );
        return;
      }
      startTransition(async () => {
        const res = await finalizeImport({ batchId });
        if (!res.success) {
          if (res.error === 'BAD_STATE') {
            toast.error('Uvoz nije spreman za potvrdu.');
          } else if (res.error === 'ALL_DUPLICATES') {
            toast.error(
              'Sve odabrane stavke već postoje kao transakcije. Izmijeni ih ili isključi duplikate.',
            );
          } else if (res.error === 'EXTERNAL_SERVICE_ERROR') {
            toast.error('Tečaj ili vanjski servis trenutno ne odgovara. Pokušaj za minut.');
          } else {
            toast.error('Uvoz nije uspio.');
          }
          return;
        }
        if (res.data.skippedDuplicates > 0) {
          toast.success(
            `Importovano ${String(res.data.imported)} transakcija. ${String(res.data.skippedDuplicates)} preskočene kao duplikati.`,
          );
        } else {
          toast.success(`Importovano ${String(res.data.imported)} transakcija.`);
        }
        router.push('/transakcije');
      });
    },
    [batchId, router, rows],
  );

  const onConfirm = useCallback(() => {
    doConfirm(false);
  }, [doConfirm]);

  const onCancel = useCallback(() => {
    startTransition(async () => {
      const res = await rejectImport({ batchId });
      if (!res.success) {
        toast.error('Brisanje uvoza nije uspjelo.');
        return;
      }
      toast.message('Uvoz je otkazan.');
      router.push('/import');
    });
  }, [batchId, router]);

  const applyBulkCategory = useCallback(() => {
    if (bulkIds.size === 0) {
      toast.error('Odaberi barem jednu stavku za masovnu kategoriju.');
      return;
    }
    const cat = bulkCategoryId === CATEGORY_NONE ? null : bulkCategoryId;
    startTransition(async () => {
      const res = await bulkApplyCategoryToParsedRows({
        batchId,
        parsedIds: [...bulkIds],
        categoryId: cat,
      });
      if (!res.success) {
        toast.error('Masovna kategorija nije primijenjena.');
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          bulkIds.has(r.id)
            ? {
                ...r,
                category_id: cat,
                categorization_source: cat ? 'user' : 'none',
                categorization_confidence: cat ? 1 : 0,
              }
            : r,
        ),
      );
      toast.success(`Kategorija primijenjena na ${String(res.updated)} stavki.`);
      setBulkIds(new Set());
      setBulkMode(false);
    });
  }, [batchId, bulkCategoryId, bulkIds]);

  // UX-7: select-all / deselect-all for the bulk panel.
  const toggleAllBulk = useCallback(() => {
    setBulkIds((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }, [rows]);

  return (
    <div className="pb-36 md:pb-32">
      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{batch.bankLabel}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span>{batch.fileName}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Period izvoda:{' '}
              <span className="text-foreground">
                {formatStatementPeriod(batch.periodStart, batch.periodEnd)}
              </span>
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'h-11 w-fit px-3 text-sm font-medium',
              confidenceBadgeClass(batch.parseConfidence),
            )}
          >
            {confidenceLabel(batch.parseConfidence)}
          </Badge>
        </div>

        {batch.parseConfidence === 'low' ? (
          <div
            className="rounded-lg border border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/10 px-4 py-3 text-base text-foreground"
            role="status"
          >
            AI nije siguran. Pažljivo provjeri sve stavke.
          </div>
        ) : null}

        {batch.parseWarnings.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-border/80 bg-card p-4">
            <h2 className="text-base font-semibold">Upozorenja</h2>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {batch.parseWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            variant={bulkMode ? 'secondary' : 'outline'}
            className="h-11 min-h-11 w-full sm:w-auto"
            onClick={() => {
              setBulkMode((m) => !m);
              setBulkIds(new Set());
            }}
          >
            {bulkMode ? 'Zatvori masovni način' : 'Označi sve istom kategorijom'}
          </Button>
          {bulkMode ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={bulkCategoryId} onValueChange={setBulkCategoryId}>
                <SelectTrigger className="h-11 min-h-11 w-full sm:w-56">
                  <SelectValue placeholder="Kategorija za odabrane" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CATEGORY_NONE}>Bez kategorije</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                className="h-11 min-h-11 w-full sm:w-auto"
                onClick={applyBulkCategory}
                disabled={isWorking}
              >
                Primijeni kategoriju
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-11 w-full sm:w-auto"
                onClick={toggleAllBulk}
              >
                {bulkIds.size === rows.length ? 'Poništi sve' : 'Odaberi sve'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Odabrano za grupu: {String(bulkIds.size)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block md:overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <caption className="sr-only">Parsirane transakcije za uvoz</caption>
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-10 py-2 pr-2 font-medium" scope="col">
                Uvoz
              </th>
              {bulkMode ? (
                <th className="w-10 py-2 pr-2 font-medium" scope="col">
                  <Checkbox
                    checked={bulkIds.size > 0 && bulkIds.size === rows.length}
                    onCheckedChange={(checked) => {
                      setBulkIds(checked ? new Set(rows.map((r) => r.id)) : new Set());
                    }}
                    aria-label="Odaberi sve za grupu"
                  />
                </th>
              ) : null}
              <th className="py-2 pr-2 font-medium" scope="col">
                Datum
              </th>
              <th className="min-w-[12rem] py-2 pr-2 font-medium" scope="col">
                Opis
              </th>
              <th className="min-w-[8rem] py-2 pr-2 font-medium" scope="col">
                Kategorija
              </th>
              <th className="min-w-[10rem] py-2 pr-2 font-medium" scope="col">
                AI status
              </th>
              <th className="py-2 pr-2 font-medium" scope="col">
                Iznos
              </th>
              <th className="w-14 py-2 pr-2 font-medium" scope="col">
                Val.
              </th>
              <th className="w-10 py-2 font-medium" scope="col">
                <span className="sr-only">Isključi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ReviewDesktopRow
                key={row.id}
                row={row}
                categories={categories}
                bulkMode={bulkMode}
                bulkIds={bulkIds}
                setBulkIds={setBulkIds}
                onToggleImport={toggleImport}
                onExclude={excludeRow}
                onCategoryChange={setCategory}
                onMerchantPicked={setMerchantForRow}
                patchRowLocal={patchRowLocal}
                scheduleRowPatch={scheduleRowPatch}
                flushRowDebounced={flushRowDebounced}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <ReviewMobileCard
            key={row.id}
            row={row}
            categories={categories}
            bulkMode={bulkMode}
            bulkIds={bulkIds}
            setBulkIds={setBulkIds}
            onToggleImport={toggleImport}
            onExclude={excludeRow}
            onCategoryChange={setCategory}
            onMerchantPicked={setMerchantForRow}
            patchRowLocal={patchRowLocal}
            scheduleRowPatch={scheduleRowPatch}
            flushRowDebounced={flushRowDebounced}
          />
        ))}
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-center text-sm text-muted-foreground sm:text-left">
            <span className="font-medium tabular-nums text-foreground">{importSelectedCount}</span>{' '}
            od <span className="tabular-nums">{rows.length}</span> označeno za uvoz
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-12 min-h-12 w-full sm:w-auto"
              onClick={onCancel}
              disabled={isWorking}
            >
              Odustani
            </Button>
            <Button
              type="button"
              className="h-12 min-h-12 w-full text-base sm:min-w-[14rem]"
              onClick={onConfirm}
              disabled={isWorking || importSelectedCount === 0}
            >
              {isWorking ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                  Uvozim…
                </>
              ) : (
                'Potvrdi i importuj'
              )}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

interface RowCallbacks {
  categories: ReviewCategoryOption[];
  bulkMode: boolean;
  bulkIds: Set<string>;
  setBulkIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onToggleImport: (rowId: string, checked: boolean) => void;
  onExclude: (rowId: string) => void;
  onCategoryChange: (rowId: string, categoryId: string | null) => void;
  onMerchantPicked: (rowId: string, merchant: MerchantResult | null) => void;
  patchRowLocal: (rowId: string, patch: Partial<ReviewParsedRow>) => void;
  scheduleRowPatch: (rowId: string, patch: PendingPatch) => void;
  flushRowDebounced: (rowId: string) => void;
}

const ReviewDesktopRow = memo(function ReviewDesktopRow({
  row,
  categories,
  bulkMode,
  bulkIds,
  setBulkIds,
  onToggleImport,
  onExclude,
  onCategoryChange,
  onMerchantPicked,
  patchRowLocal,
  scheduleRowPatch,
  flushRowDebounced,
}: { row: ReviewParsedRow } & RowCallbacks) {
  const [desc, setDesc] = useState(row.raw_description);
  const [amountStr, setAmountStr] = useState(() => minorToEditableInput(row.amount_minor));

  useEffect(() => {
    setDesc(row.raw_description);
  }, [row.raw_description]);
  useEffect(() => {
    setAmountStr(minorToEditableInput(row.amount_minor));
  }, [row.amount_minor]);

  const lowConfidence = row.parse_confidence === 'low';
  const unknownMerchant = !row.merchant_id;
  const categorizationMeta = categorizationBadgeMeta(row.categorization_source);

  const toggleBulk = useCallback(() => {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }, [row.id, setBulkIds]);

  return (
    <tr
      className={cn(
        'border-b border-border/60 align-middle',
        !row.selected_for_import && 'opacity-50',
        lowConfidence && 'border-l-4 border-l-[hsl(var(--warning))]',
      )}
    >
      <td className="py-2 pr-2">
        <Checkbox
          checked={row.selected_for_import}
          onCheckedChange={(v) => {
            onToggleImport(row.id, v === true);
          }}
          className="h-6 w-6 min-h-11 min-w-11 sm:h-4 sm:w-4 sm:min-h-4 sm:min-w-4"
          aria-label="Uključi u uvoz"
        />
      </td>
      {bulkMode ? (
        <td className="py-2 pr-2">
          <Checkbox
            checked={bulkIds.has(row.id)}
            onCheckedChange={toggleBulk}
            className="h-6 w-6 min-h-11 min-w-11 sm:h-4 sm:w-4 sm:min-h-4 sm:min-w-4"
            aria-label="Odaberi za masovnu kategoriju"
          />
        </td>
      ) : null}
      <td className="py-2 pr-2">
        <input
          type="date"
          className="h-11 w-full min-w-[9rem] rounded-md border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={row.transaction_date}
          onChange={(e) => {
            const v = e.target.value;
            patchRowLocal(row.id, { transaction_date: v });
            scheduleRowPatch(row.id, { transaction_date: v });
          }}
          onBlur={() => {
            flushRowDebounced(row.id);
          }}
        />
      </td>
      <td className="py-2 pr-2">
        <MerchantDescriptionField
          description={desc}
          unknownMerchant={unknownMerchant}
          onDescriptionChange={(v) => {
            setDesc(v);
            patchRowLocal(row.id, { raw_description: v });
            scheduleRowPatch(row.id, { raw_description: v });
          }}
          onBlur={() => {
            flushRowDebounced(row.id);
          }}
          onMerchantPicked={(m) => {
            onMerchantPicked(row.id, m);
          }}
        />
      </td>
      <td className="py-2 pr-2">
        <Select
          value={row.category_id ?? CATEGORY_NONE}
          onValueChange={(v) => {
            onCategoryChange(row.id, v === CATEGORY_NONE ? null : v);
          }}
        >
          <SelectTrigger className="h-11 min-h-11 w-full min-w-[8rem]">
            <SelectValue placeholder="Kategorija" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CATEGORY_NONE}>Bez kategorije</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="py-2 pr-2">
        <Badge variant="outline" className={cn('h-8 px-2 text-xs', categorizationMeta.className)}>
          {categorizationMeta.label} ·{' '}
          {formatCategorizationConfidence(row.categorization_confidence)}
        </Badge>
      </td>
      <td className="py-2 pr-2">
        <input
          type="text"
          inputMode="decimal"
          className="h-11 w-full min-w-[7rem] rounded-md border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={amountStr}
          onChange={(e) => {
            setAmountStr(e.target.value);
          }}
          onBlur={() => {
            const parsed = parseMoneyString(amountStr.trim(), 'bs-BA');
            if (parsed === null) {
              toast.error('Iznos nije prepoznat.');
              setAmountStr(minorToEditableInput(row.amount_minor));
              return;
            }
            const n = Number(parsed);
            patchRowLocal(row.id, { amount_minor: n });
            scheduleRowPatch(row.id, { amount_minor: n });
            flushRowDebounced(row.id);
            setAmountStr(minorToEditableInput(n));
          }}
        />
      </td>
      <td className="py-2 pr-2 tabular-nums text-muted-foreground">{row.currency}</td>
      <td className="py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 min-h-11 min-w-11 text-muted-foreground hover:text-destructive"
          aria-label="Isključi iz uvoza"
          onClick={() => {
            onExclude(row.id);
          }}
        >
          <X className="h-5 w-5" />
        </Button>
      </td>
    </tr>
  );
});

const ReviewMobileCard = memo(function ReviewMobileCard(
  props: { row: ReviewParsedRow } & RowCallbacks,
) {
  const {
    row,
    onToggleImport,
    onExclude,
    categories,
    onCategoryChange,
    bulkMode,
    bulkIds,
    setBulkIds,
    patchRowLocal,
  } = props;
  const [desc, setDesc] = useState(row.raw_description);
  const [amountStr, setAmountStr] = useState(() => minorToEditableInput(row.amount_minor));

  useEffect(() => {
    setDesc(row.raw_description);
  }, [row.raw_description]);
  useEffect(() => {
    setAmountStr(minorToEditableInput(row.amount_minor));
  }, [row.amount_minor]);

  const lowConfidence = row.parse_confidence === 'low';
  const unknownMerchant = !row.merchant_id;
  const categorizationMeta = categorizationBadgeMeta(row.categorization_source);

  const toggleBulk = useCallback(() => {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }, [row.id, setBulkIds]);

  return (
    <div
      className={cn(
        'relative rounded-xl border bg-card p-4 shadow-sm',
        !row.selected_for_import && 'opacity-50',
        lowConfidence && 'border-[hsl(var(--warning))] ring-1 ring-[hsl(var(--warning))]/40',
      )}
    >
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {bulkMode ? (
          <Checkbox checked={bulkIds.has(row.id)} onCheckedChange={toggleBulk} aria-label="Grupa" />
        ) : null}
        <Checkbox
          checked={row.selected_for_import}
          onCheckedChange={(v) => {
            onToggleImport(row.id, v === true);
          }}
          aria-label="Uključi u uvoz"
        />
      </div>
      <div className="pr-14">
        <Badge
          variant="outline"
          className={cn('mb-2 h-8 px-2 text-xs', categorizationMeta.className)}
        >
          {categorizationMeta.label} ·{' '}
          {formatCategorizationConfidence(row.categorization_confidence)}
        </Badge>
        <input
          type="date"
          className="mb-2 h-11 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums"
          value={row.transaction_date}
          onChange={(e) => {
            const v = e.target.value;
            patchRowLocal(row.id, { transaction_date: v });
            props.scheduleRowPatch(row.id, { transaction_date: v });
          }}
          onBlur={() => {
            props.flushRowDebounced(row.id);
          }}
        />
        <MerchantDescriptionField
          description={desc}
          unknownMerchant={unknownMerchant}
          onDescriptionChange={(v) => {
            setDesc(v);
            patchRowLocal(row.id, { raw_description: v });
            props.scheduleRowPatch(row.id, { raw_description: v });
          }}
          onBlur={() => {
            props.flushRowDebounced(row.id);
          }}
          onMerchantPicked={(m) => {
            props.onMerchantPicked(row.id, m);
          }}
        />
        <Label className="mt-3 text-xs text-muted-foreground">Iznos ({row.currency})</Label>
        <input
          type="text"
          inputMode="decimal"
          className="mt-1 h-12 w-full rounded-md border border-input bg-background px-3 text-xl font-semibold tabular-nums tracking-tight"
          value={amountStr}
          onChange={(e) => {
            setAmountStr(e.target.value);
          }}
          onBlur={() => {
            const parsed = parseMoneyString(amountStr.trim(), 'bs-BA');
            if (parsed === null) {
              toast.error('Iznos nije prepoznat.');
              setAmountStr(minorToEditableInput(row.amount_minor));
              return;
            }
            const n = Number(parsed);
            patchRowLocal(row.id, { amount_minor: n });
            props.scheduleRowPatch(row.id, { amount_minor: n });
            props.flushRowDebounced(row.id);
            setAmountStr(minorToEditableInput(n));
          }}
        />
        <div className="mt-3">
          <Label className="text-xs text-muted-foreground">Kategorija</Label>
          <Select
            value={row.category_id ?? CATEGORY_NONE}
            onValueChange={(v) => {
              onCategoryChange(row.id, v === CATEGORY_NONE ? null : v);
            }}
          >
            <SelectTrigger className="mt-1 h-11 min-h-11 w-full">
              <SelectValue placeholder="Kategorija" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CATEGORY_NONE}>Bez kategorije</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 h-11 w-full"
          onClick={() => {
            onExclude(row.id);
          }}
        >
          Isključi iz uvoza
        </Button>
      </div>
    </div>
  );
});

const MerchantDescriptionField = memo(function MerchantDescriptionField({
  description,
  unknownMerchant,
  onDescriptionChange,
  onBlur,
  onMerchantPicked,
}: {
  description: string;
  unknownMerchant: boolean;
  onDescriptionChange: (v: string) => void;
  onBlur: () => void;
  onMerchantPicked: (m: MerchantResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<MerchantResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const runSearch = useCallback((q: string) => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        const res = await searchMerchants(q, 8);
        setLoading(false);
        if (res.success) setHits(res.data);
        else setHits([]);
      })();
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current);
    };
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setOpen(false);
  }, []);

  return (
    <div className="relative">
      <input
        type="text"
        className="h-11 w-full min-w-[10rem] rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={description}
        placeholder={unknownMerchant ? 'Novi trgovac — dodaj' : undefined}
        onChange={(e) => {
          const v = e.target.value;
          onDescriptionChange(v);
          runSearch(v);
          setOpen(true);
        }}
        onFocus={() => {
          runSearch(description);
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
          }, 150);
          onBlur();
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && (hits.length > 0 || loading) ? (
        <ul
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover py-1 text-sm shadow-md"
          role="listbox"
        >
          {loading ? (
            <li className="px-3 py-2 text-muted-foreground">Tražim…</li>
          ) : (
            hits.map((m) => (
              <li key={m.id} role="option">
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-accent"
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => {
                    onMerchantPicked(m);
                    onDescriptionChange(m.display_name);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{m.display_name}</span>
                  <span className="text-xs text-muted-foreground">{m.canonical_name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
});
