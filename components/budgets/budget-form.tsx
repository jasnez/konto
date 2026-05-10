'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { CreateBudgetFormSchema, type CreateBudgetFormValues } from '@/lib/budgets/validation';
import { CURRENCIES, getCurrencyLabel } from '@/lib/accounts/constants';
import { formatMoney } from '@/lib/format/format-money';
import { useFormDraft } from '@/lib/hooks/use-form-draft';
import { previewCategoryPeriodSpent } from '@/app/(app)/budzeti/actions';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { MoneyInput } from '@/components/money-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

/** Budgetable category — `kind in ('expense', 'saving')`. */
export interface BudgetableCategory {
  id: string;
  name: string;
  icon: string | null;
  kind: 'expense' | 'saving';
}

export interface BudgetFormProps {
  mode: 'create' | 'edit';
  /** All budgetable categories the user owns (kind in expense/saving). */
  categories: BudgetableCategory[];
  /** Defaults; for `mode='edit'` use the existing budget values. */
  defaultValues?: Partial<CreateBudgetFormValues>;
  /** Profile base currency, used as initial currency when no defaultValues given. */
  baseCurrency?: string;
  /** Submit handler. Returns null on success, or an error string for inline display. */
  onSubmit: (values: CreateBudgetFormValues) => Promise<string | null>;
  /** Form id — when set, parent renders the submit button outside (Dialog footer). */
  formId?: string;
  /** Hide the inline submit button (used by Dialog footer flow). */
  hideSubmit?: boolean;
  /**
   * OB-1: opt-in localStorage draft persistence (e.g. onboarding wizard
   * step). Hydrates form from + saves to localStorage on every change
   * (debounced 500 ms). Cleared automatically on successful submit. Forms
   * outside the wizard (Add/Edit dialog) omit this and behave as before.
   */
  draftKey?: string;
}

export function BudgetForm({
  mode,
  categories,
  defaultValues,
  baseCurrency = 'BAM',
  onSubmit,
  formId,
  hideSubmit,
  draftKey,
}: BudgetFormProps) {
  const form = useForm<CreateBudgetFormValues>({
    resolver: zodResolver(CreateBudgetFormSchema) as never,
    defaultValues: {
      category_id: defaultValues?.category_id ?? '',
      amount_cents: defaultValues?.amount_cents ?? '',
      currency: defaultValues?.currency ?? baseCurrency,
      period: defaultValues?.period ?? 'monthly',
      rollover: defaultValues?.rollover ?? false,
    },
    mode: 'onSubmit',
  });
  // OB-1: opt-in draft persistence (no-op when draftKey is undefined).
  const { clearDraft } = useFormDraft(draftKey, form);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const isSubmitting = form.formState.isSubmitting;

  const watchedCategory = form.watch('category_id');
  const watchedPeriod = form.watch('period');
  const watchedCurrency = form.watch('currency');

  async function handleSubmit(values: CreateBudgetFormValues) {
    setSubmitError(null);
    const error = await onSubmit(values);
    if (error) {
      setSubmitError(error);
      return;
    }
    // OB-1: clear persisted draft on success. No-op when draftKey undefined.
    clearDraft();
  }

  return (
    <Form {...form}>
      <form
        id={formId}
        onSubmit={(e) => {
          void form.handleSubmit(handleSubmit)(e);
        }}
        className="space-y-5"
        noValidate
      >
        {/* Kategorija */}
        <FormField
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kategorija</FormLabel>
              <Select
                value={field.value || undefined}
                onValueChange={(v) => {
                  field.onChange(v);
                }}
                disabled={mode === 'edit' || categories.length === 0}
              >
                <FormControl>
                  <SelectTrigger
                    aria-label={
                      categories.length === 0 ? 'Nema dostupnih kategorija' : 'Kategorija budžeta'
                    }
                    className="h-11 w-full"
                  >
                    <SelectValue
                      placeholder={
                        categories.length === 0
                          ? 'Kreiraj prvo kategoriju troška'
                          : 'Odaberi kategoriju'
                      }
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="mr-2" aria-hidden>
                        {c.icon ?? '📦'}
                      </span>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === 'edit' && (
                <FormDescription>Kategorija se ne može mijenjati nakon kreiranja.</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Period */}
        <FormField
          control={form.control}
          name="period"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Period</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                  }}
                  className="flex gap-3"
                >
                  <PeriodRadio value="monthly" label="Mjesečno" />
                  <PeriodRadio value="weekly" label="Sedmično" />
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Iznos */}
        <FormField
          control={form.control}
          name="amount_cents"
          render={({ field }) => {
            const initialCents = (() => {
              if (!field.value) return 0n;
              try {
                return BigInt(field.value);
              } catch {
                return 0n;
              }
            })();
            return (
              <FormItem>
                <FormLabel>Limit po periodu</FormLabel>
                <FormControl>
                  <MoneyInput
                    value={initialCents}
                    onChange={(cents) => {
                      field.onChange(cents.toString());
                    }}
                    currency={watchedCurrency}
                    onCurrencyChange={(c) => {
                      form.setValue('currency', c, { shouldValidate: false });
                    }}
                    aria-label="Limit po periodu"
                    size="lg"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* Rollover */}
        <FormField
          control={form.control}
          name="rollover"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Prenesi neutrošeno</FormLabel>
                <FormDescription>
                  Ako ne potrošiš sve, ostatak ide u sljedeći period.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={(v) => {
                    field.onChange(v);
                  }}
                  aria-label="Prenesi neutrošeno"
                />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Period preview */}
        <PreviewPanel
          categoryId={watchedCategory}
          period={watchedPeriod}
          currency={watchedCurrency}
        />

        {submitError && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {submitError}
          </p>
        )}

        {!hideSubmit && (
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {mode === 'create' ? 'Kreiraj budžet' : 'Sačuvaj'}
          </Button>
        )}
      </form>
    </Form>
  );
}

function PeriodRadio({ value, label }: { value: 'monthly' | 'weekly'; label: string }) {
  const id = `period-${value}`;
  return (
    <div className="flex flex-1 items-center gap-2 rounded-md border p-3">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
    </div>
  );
}

interface PreviewPanelProps {
  categoryId: string;
  period: 'monthly' | 'weekly';
  currency: string;
}

/**
 * Shows "Prošli {period} si potrošio X u ovoj kategoriji" — refetches when
 * category or period changes. Safe-degrades when API returns nothing.
 *
 * Currency: previewed amount comes from base_amount_cents already, so we
 * format it in the form's currency. The user can adjust currency separately
 * — the preview is a hint, not authoritative.
 */
function PreviewPanel({ categoryId, period, currency }: PreviewPanelProps) {
  const [loading, setLoading] = useState(false);
  const [spent, setSpent] = useState<bigint | null>(null);

  useEffect(() => {
    if (!categoryId) {
      setSpent(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void previewCategoryPeriodSpent({ category_id: categoryId, period, offset: -1 }).then(
      (result) => {
        if (cancelled) return;
        setLoading(false);
        if (result.success) {
          setSpent(BigInt(result.data.spentCents));
        } else {
          setSpent(null);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [categoryId, period]);

  if (!categoryId) return null;
  if (loading) {
    return <Skeleton className="h-12 w-full" />;
  }
  if (spent === null) return null;

  // Impersonal phrasing — sidesteps the masculine-default past participle
  // ("nisi imao", "si potrošio") that excluded ~half of users. Bonus: works
  // for both period values without the prior "Prošlu mjesec" agreement bug
  // (mjesec is masculine; the accusative "Prošlu" only fits feminine
  // sedmica). Distinct full phrases per period now agree correctly.
  const periodPhrase = period === 'monthly' ? 'Prošli mjesec' : 'Prošla sedmica';
  const formatted = formatMoney(spent, currency, 'bs-BA', { showCurrency: true });

  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {spent === 0n ? (
        <>{periodPhrase} — bez transakcija u ovoj kategoriji.</>
      ) : (
        <>
          {periodPhrase}: <strong className="text-foreground">{formatted}</strong> potrošeno u ovoj
          kategoriji.
        </>
      )}
    </div>
  );
}

// Re-export currency helpers so dialog wrappers don't need to import them
// twice — convenient for testing the form in isolation.
export { CURRENCIES, getCurrencyLabel };
