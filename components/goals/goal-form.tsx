'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { CreateGoalFormSchema, type CreateGoalFormValues } from '@/lib/goals/validation';
import { CURRENCIES } from '@/lib/accounts/constants';
import { useFormDraft } from '@/lib/hooks/use-form-draft';
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
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/money-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Savings account option for the "link account" select. */
export interface GoalAccount {
  id: string;
  name: string;
}

export interface GoalFormProps {
  mode: 'create' | 'edit';
  accounts: GoalAccount[];
  defaultValues?: Partial<CreateGoalFormValues>;
  baseCurrency?: string;
  /** Submit handler. Returns null on success, or an error string for inline display. */
  onSubmit: (values: CreateGoalFormValues) => Promise<string | null>;
  formId?: string;
  hideSubmit?: boolean;
  /**
   * OB-1: opt-in localStorage draft persistence (e.g. onboarding wizard
   * step). Hydrates form from + saves to localStorage on every change
   * (debounced 500 ms). Cleared automatically on successful submit. Forms
   * outside the wizard (Add/Edit dialog) omit this and behave as before.
   */
  draftKey?: string;
}

// ─── Predefined icon palette ──────────────────────────────────────────────────

export const GOAL_ICONS: { emoji: string; label: string }[] = [
  { emoji: '🏖️', label: 'Ljetovanje' },
  { emoji: '🏠', label: 'Stan' },
  { emoji: '🚗', label: 'Auto' },
  { emoji: '💍', label: 'Vjenčanje' },
  { emoji: '🎓', label: 'Škola' },
  { emoji: '📦', label: 'Drugo' },
];

// ─── Predefined color palette ─────────────────────────────────────────────────

export const GOAL_COLORS: { hex: string; label: string; tailwind: string }[] = [
  { hex: '#10b981', label: 'Zelena', tailwind: 'bg-emerald-500' },
  { hex: '#3b82f6', label: 'Plava', tailwind: 'bg-blue-500' },
  { hex: '#f59e0b', label: 'Žuta', tailwind: 'bg-amber-500' },
  { hex: '#ef4444', label: 'Crvena', tailwind: 'bg-red-500' },
  { hex: '#8b5cf6', label: 'Ljubičasta', tailwind: 'bg-violet-500' },
  { hex: '#ec4899', label: 'Roza', tailwind: 'bg-pink-500' },
];

export const DEFAULT_GOAL_COLOR = '#10b981';

// ─── Component ────────────────────────────────────────────────────────────────

export function GoalForm({
  mode,
  accounts,
  defaultValues,
  baseCurrency = 'BAM',
  onSubmit,
  formId,
  hideSubmit,
  draftKey,
}: GoalFormProps) {
  const form = useForm<CreateGoalFormValues>({
    resolver: zodResolver(CreateGoalFormSchema) as never,
    defaultValues: {
      name: defaultValues?.name ?? '',
      target_amount_cents: defaultValues?.target_amount_cents ?? '',
      currency: defaultValues?.currency ?? baseCurrency,
      target_date: defaultValues?.target_date ?? null,
      account_id: defaultValues?.account_id ?? null,
      icon: defaultValues?.icon ?? GOAL_ICONS[5].emoji,
      color: defaultValues?.color ?? DEFAULT_GOAL_COLOR,
    },
    mode: 'onSubmit',
  });
  // OB-1: opt-in draft persistence (no-op when draftKey is undefined).
  const { clearDraft } = useFormDraft(draftKey, form);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const isSubmitting = form.formState.isSubmitting;

  const watchedCurrency = form.watch('currency');
  const watchedIcon = form.watch('icon');
  const watchedColor = form.watch('color');

  async function handleSubmit(values: CreateGoalFormValues) {
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
        {/* Naziv */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Naziv cilja</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="npr. Godišnji odmor"
                  className="h-11"
                  aria-label="Naziv cilja"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Ciljani iznos */}
        <FormField
          control={form.control}
          name="target_amount_cents"
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
                <FormLabel>Ciljani iznos</FormLabel>
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
                    aria-label="Ciljani iznos"
                    size="lg"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* Datum cilja */}
        <FormField
          control={form.control}
          name="target_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Datum cilja (opciono)</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  className="h-11"
                  value={field.value ?? ''}
                  onChange={(e) => {
                    field.onChange(e.target.value || null);
                  }}
                  aria-label="Datum cilja"
                />
              </FormControl>
              <FormDescription>
                Ako postaviš datum, izračunamo koliko treba odvajati mjesečno.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Veži za račun */}
        {accounts.length > 0 && (
          <FormField
            control={form.control}
            name="account_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Veži za račun (opciono)</FormLabel>
                <Select
                  value={field.value ?? 'none'}
                  onValueChange={(v) => {
                    field.onChange(v === 'none' ? null : v);
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="h-11 w-full" aria-label="Veži za račun">
                      <SelectValue placeholder="Bez vezanog računa" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">Bez vezanog računa</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Saldo vezanog računa automatski se koristi kao trenutni napredak.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Ikona */}
        <FormField
          control={form.control}
          name="icon"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ikona</FormLabel>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Odaberi ikonu">
                {GOAL_ICONS.map(({ emoji, label }) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={label}
                    aria-pressed={watchedIcon === emoji}
                    onClick={() => {
                      field.onChange(emoji);
                    }}
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-lg border text-xl transition-colors',
                      watchedIcon === emoji
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Boja */}
        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Boja</FormLabel>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Odaberi boju">
                {GOAL_COLORS.map(({ hex, label, tailwind }) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={label}
                    aria-pressed={watchedColor === hex}
                    onClick={() => {
                      field.onChange(hex);
                    }}
                    className={cn(
                      'h-9 w-9 rounded-full border-2 transition-all',
                      tailwind,
                      watchedColor === hex
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:border-muted-foreground',
                    )}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {submitError && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {submitError}
          </p>
        )}

        {!hideSubmit && (
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {mode === 'create' ? 'Kreiraj cilj' : 'Sačuvaj izmjene'}
          </Button>
        )}
      </form>
    </Form>
  );
}

export { CURRENCIES };
