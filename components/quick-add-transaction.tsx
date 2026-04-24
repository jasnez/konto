'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { bs } from 'date-fns/locale';
import { CalendarDays, Loader2, MessageSquareMore } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createMerchant } from '@/app/(app)/merchants/actions';
import { createTransaction } from '@/app/(app)/transakcije/actions';
import { AccountSelect, type AccountOption } from '@/components/account-select';
import {
  type CategoryOption,
  CategorySelect,
  type TransactionKind,
} from '@/components/category-select';
import { DatePicker } from '@/components/date-picker';
import { MerchantCombobox } from '@/components/merchant-combobox';
import { MoneyInput } from '@/components/money-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { CreateTransactionSchema } from '@/lib/schemas/transaction';
import { cn } from '@/lib/utils';

const LAST_USED_STORAGE_KEY = 'konto:quick-add:last-used';

interface LastUsedValues {
  account_id: string | null;
  category_id: string | null;
  merchant_raw: string | null;
  kind: TransactionKind;
}

interface RetryDraft {
  values: QuickAddFormValues;
  kind: TransactionKind;
}

function getTodayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd', { locale: bs });
}

function normalizeAmountForKind(amountCents: bigint, kind: TransactionKind): bigint {
  const abs = amountCents < 0n ? -amountCents : amountCents;
  return kind === 'income' ? abs : -abs;
}

function toCanonicalMerchant(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function readLastUsed(): LastUsedValues | null {
  try {
    const raw = window.localStorage.getItem(LAST_USED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const maybePayload = parsed as Partial<LastUsedValues>;
    if (
      maybePayload.kind !== 'expense' &&
      maybePayload.kind !== 'income' &&
      maybePayload.kind !== 'transfer'
    ) {
      return null;
    }

    return {
      account_id: maybePayload.account_id ?? null,
      category_id: maybePayload.category_id ?? null,
      merchant_raw: maybePayload.merchant_raw ?? null,
      kind: maybePayload.kind,
    };
  } catch {
    return null;
  }
}

function writeLastUsed(payload: LastUsedValues) {
  try {
    window.localStorage.setItem(LAST_USED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage can be blocked in private mode.
  }
}

function buildDefaults(
  accounts: AccountOption[],
  categories: CategoryOption[],
  fallbackKind: TransactionKind,
): { values: QuickAddFormValues; kind: TransactionKind } {
  const today = getTodayIsoDate();
  const lastUsed = readLastUsed();
  const firstAccountId = accounts.at(0)?.id ?? '';
  const accountId =
    lastUsed?.account_id && accounts.some((account) => account.id === lastUsed.account_id)
      ? lastUsed.account_id
      : firstAccountId;
  const accountCurrency = accounts.find((account) => account.id === accountId)?.currency ?? 'BAM';
  const kind = lastUsed?.kind ?? fallbackKind;
  const categoryId =
    (lastUsed?.category_id && categories.some((category) => category.id === lastUsed.category_id)
      ? lastUsed.category_id
      : null) ?? null;

  return {
    kind,
    values: {
      account_id: accountId,
      amount_cents: normalizeAmountForKind(0n, kind),
      currency: accountCurrency,
      transaction_date: today,
      merchant_raw: lastUsed?.merchant_raw ?? null,
      category_id: categoryId,
      notes: null,
    },
  };
}

type QuickAddFormValues = z.infer<typeof CreateTransactionSchema>;

export interface QuickAddTransactionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountOption[];
  categories: CategoryOption[];
}

export function QuickAddTransaction({
  open,
  onOpenChange,
  accounts,
  categories,
}: QuickAddTransactionProps) {
  const isMobile = useIsMobile();
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const merchantInputRef = useRef<HTMLInputElement | null>(null);
  const createdMerchantsRef = useRef<Set<string>>(new Set());
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [showNotes, setShowNotes] = useState(false);
  const [retryDraft, setRetryDraft] = useState<RetryDraft | null>(null);

  const form = useForm<QuickAddFormValues>({
    resolver: zodResolver(CreateTransactionSchema) as never,
    defaultValues: {
      account_id: '',
      amount_cents: 0n,
      currency: 'BAM',
      transaction_date: getTodayIsoDate(),
      merchant_raw: null,
      category_id: null,
      notes: null,
    },
    mode: 'onSubmit',
  });

  const selectedAccountId = form.watch('account_id');
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);

  useEffect(() => {
    if (!open) return;

    if (retryDraft) {
      form.reset(retryDraft.values);
      setKind(retryDraft.kind);
      setShowNotes(Boolean(retryDraft.values.notes));
      setRetryDraft(null);
    } else {
      const defaults = buildDefaults(accounts, categories, 'expense');
      form.reset(defaults.values);
      setKind(defaults.kind);
      setShowNotes(false);
    }

    const timeout = window.setTimeout(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }, 10);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [accounts, categories, form, open, retryDraft]);

  async function ensureMerchantExists(candidate: string, defaultCategoryId: string | null) {
    const display = candidate.trim();
    if (display.length === 0) return;

    const canonical = toCanonicalMerchant(display);
    if (createdMerchantsRef.current.has(canonical)) return;

    const result = await createMerchant({
      canonical_name: canonical,
      display_name: display,
      default_category_id: defaultCategoryId,
      icon: null,
      color: null,
    });

    if (result.success || result.error === 'DUPLICATE_CANONICAL') {
      createdMerchantsRef.current.add(canonical);
    }
  }

  function focusCategoryField() {
    const element = document.getElementById('quick-add-category-trigger');
    if (element instanceof HTMLElement) {
      element.focus();
    }
  }

  async function onSubmit(values: QuickAddFormValues) {
    const signedAmount = normalizeAmountForKind(values.amount_cents, kind);
    const payload: QuickAddFormValues = {
      ...values,
      amount_cents: signedAmount,
      merchant_raw: values.merchant_raw,
      category_id: values.category_id,
      notes: values.notes,
    };

    const snapshot: RetryDraft = { values: payload, kind };
    onOpenChange(false);
    toast.success('Transakcija je dodata.');

    if (payload.merchant_raw) {
      await ensureMerchantExists(payload.merchant_raw, payload.category_id);
    }

    const result = await createTransaction(payload);
    if (result.success) {
      writeLastUsed({
        account_id: payload.account_id,
        category_id: payload.category_id,
        merchant_raw: payload.merchant_raw,
        kind,
      });
      return;
    }

    setRetryDraft(snapshot);
    toast.error('Nešto nije u redu. Pokušaj opet za par sekundi.', {
      description:
        result.error === 'DUPLICATE'
          ? 'Slična transakcija već postoji u zadnjih 30 dana.'
          : 'Podaci su sačuvani u formi. Možeš pokušati ponovo.',
      action: {
        label: 'Retry',
        onClick: () => {
          onOpenChange(true);
        },
      },
      duration: 10000,
    });
  }

  const content = (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
        }}
        className="flex h-full flex-col gap-4"
      >
        <div className="space-y-4 overflow-y-auto pr-1">
          <FormField
            control={form.control}
            name="amount_cents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Iznos</FormLabel>
                <FormControl>
                  <MoneyInput
                    inputRef={amountInputRef}
                    autoFocus
                    size="lg"
                    allowNegative
                    value={field.value}
                    currency={selectedAccount?.currency ?? 'BAM'}
                    onChange={(next) => {
                      form.setValue('amount_cents', normalizeAmountForKind(next, kind), {
                        shouldDirty: true,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        merchantInputRef.current?.focus();
                      }
                    }}
                    error={form.formState.errors.amount_cents?.message}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <Label>Tip</Label>
            <Tabs
              value={kind}
              onValueChange={(nextValue) => {
                const nextKind = nextValue as TransactionKind;
                setKind(nextKind);
                const currentAmount = form.getValues('amount_cents');
                form.setValue('amount_cents', normalizeAmountForKind(currentAmount, nextKind), {
                  shouldDirty: true,
                });
                form.setValue('category_id', null, { shouldDirty: true });
              }}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="expense">Trošak</TabsTrigger>
                <TabsTrigger value="income">Prihod</TabsTrigger>
                <TabsTrigger value="transfer">Transfer</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <FormField
            control={form.control}
            name="merchant_raw"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prodavač</FormLabel>
                <FormControl>
                  <MerchantCombobox
                    inputRef={merchantInputRef}
                    value={field.value ?? ''}
                    onValueChange={(next) => {
                      field.onChange(next);
                    }}
                    onEnterNext={focusCategoryField}
                    onBlurValue={(candidate, known) => {
                      if (!known) {
                        void ensureMerchantExists(candidate, form.getValues('category_id'));
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Kategorija</FormLabel>
                <FormControl>
                  <CategorySelect
                    id="quick-add-category-trigger"
                    categories={categories}
                    kind={kind}
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="account_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Račun</FormLabel>
                <FormControl>
                  <AccountSelect
                    id="quick-add-account"
                    accounts={accounts}
                    value={field.value}
                    onValueChange={(nextAccountId) => {
                      field.onChange(nextAccountId);
                      const nextCurrency =
                        accounts.find((account) => account.id === nextAccountId)?.currency ?? 'BAM';
                      form.setValue('currency', nextCurrency);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="transaction_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  Datum
                </FormLabel>
                <FormControl>
                  <DatePicker value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            {!showNotes ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10 justify-start px-2 text-muted-foreground"
                onClick={() => {
                  setShowNotes(true);
                }}
              >
                <MessageSquareMore className="mr-2 h-4 w-4" aria-hidden />
                Dodaj napomenu
              </Button>
            ) : null}

            {showNotes ? (
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Napomena (opciono)</FormLabel>
                    <FormControl>
                      <Textarea
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        rows={3}
                        maxLength={500}
                        placeholder="Kratka bilješka..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
          </div>
        </div>

        <div className="mt-auto flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Otkaži
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting || accounts.length === 0}>
            {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spasi
          </Button>
        </div>
      </form>
    </Form>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            'h-[100dvh] max-h-[100dvh] rounded-none px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 sm:max-w-none',
          )}
        >
          <SheetHeader className="mb-2 text-left">
            <SheetTitle>Brzi unos</SheetTitle>
            <SheetDescription>Dodaj transakciju u par poteza.</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogTitle>Brzi unos</DialogTitle>
        <DialogDescription>Dodaj transakciju bez napuštanja trenutne stranice.</DialogDescription>
        {content}
      </DialogContent>
    </Dialog>
  );
}
