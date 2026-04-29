'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Camera,
  Loader2,
  MessageSquareMore,
} from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createInstallmentPlan } from '@/app/(app)/kartice-rate/actions';
import { createMerchant } from '@/app/(app)/merchants/actions';
import { createCashAccount } from '@/app/(app)/racuni/actions';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import {
  buildDefaults,
  getTodayIsoDate,
  normalizeAmountForKind,
  type QuickAddFormValues,
  type RetryDraft,
  toCanonicalMerchant,
  writeLastUsed,
} from './quick-add-transaction-draft';

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
  const merchantIdCacheRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [showNotes, setShowNotes] = useState(false);
  const [retryDraft, setRetryDraft] = useState<RetryDraft | null>(null);
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(3);
  const [dayOfMonth, setDayOfMonth] = useState(15);
  const [atmMode, setAtmMode] = useState(false);
  const [localCashAccount, setLocalCashAccount] = useState<AccountOption | null>(null);
  const [cashCreateName, setCashCreateName] = useState('Gotovina');
  const [cashCreating, setCashCreating] = useState(false);

  const form = useForm<QuickAddFormValues>({
    resolver: zodResolver(CreateTransactionSchema) as never,
    defaultValues: {
      account_id: '',
      to_account_id: undefined,
      amount_cents: 0n,
      currency: 'BAM',
      transaction_date: getTodayIsoDate(),
      merchant_raw: null,
      category_id: null,
      notes: null,
    },
    mode: 'onSubmit',
  });

  // Local-only cash account (created inline within ATM mode) is merged into the
  // accounts list so the form can target it without waiting for a server round-trip.
  const effectiveAccounts = useMemo<AccountOption[]>(
    () => (localCashAccount ? [...accounts, localCashAccount] : accounts),
    [accounts, localCashAccount],
  );
  const cashAccount = useMemo(
    () => effectiveAccounts.find((account) => account.type === 'cash') ?? null,
    [effectiveAccounts],
  );
  // Source candidates for an ATM withdrawal: anything that isn't itself cash and
  // can plausibly hold a balance you'd pull from (excludes investment/loan).
  const atmSourceAccounts = useMemo(
    () =>
      effectiveAccounts.filter(
        (account) =>
          account.type !== 'cash' && account.type !== 'investment' && account.type !== 'loan',
      ),
    [effectiveAccounts],
  );
  const canShowAtmPreset = atmSourceAccounts.length > 0;

  const selectedAccountId = form.watch('account_id');
  const selectedToAccountId = form.watch('to_account_id');
  const watchedAmount = form.watch('amount_cents');
  const selectedAccount = effectiveAccounts.find((account) => account.id === selectedAccountId);
  const toAccounts = effectiveAccounts.filter((account) => account.id !== selectedAccountId);
  const isTransfer = kind === 'transfer';
  const isCreditCard = selectedAccount?.type === 'credit_card';
  const showInstallmentToggle = kind === 'expense' && isCreditCard && !isTransfer;
  const selectedCurrency = selectedAccount?.currency ?? 'BAM';
  const absAmount = watchedAmount < 0n ? -watchedAmount : watchedAmount;
  const derivedInstallmentCents =
    absAmount > 0n && installmentCount > 1
      ? absAmount / BigInt(installmentCount) + (absAmount % BigInt(installmentCount) > 0n ? 1n : 0n)
      : 0n;

  // Run reset logic ONLY on open transitions, not on every accounts/categories
  // change. Otherwise an inline action that triggers `revalidatePath('/racuni')`
  // (e.g. createCashAccount during ATM flow) would refetch accounts in the
  // parent layout, fire this effect, and clobber atmMode + localCashAccount
  // mid-flow.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false;
      return;
    }
    if (prevOpenRef.current) return;
    prevOpenRef.current = true;

    if (!retryDraft) {
      merchantIdCacheRef.current.clear();
      setIsInstallment(false);
      setInstallmentCount(3);
      setDayOfMonth(15);
      setAtmMode(false);
      setLocalCashAccount(null);
      setCashCreateName('Gotovina');
      setCashCreating(false);
    }

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

  function ensureMerchantExists(
    candidate: string,
    defaultCategoryId: string | null,
  ): Promise<string | null> {
    const display = candidate.trim();
    if (display.length === 0) return Promise.resolve(null);

    const canonical = toCanonicalMerchant(display);
    const cached = merchantIdCacheRef.current.get(canonical);
    if (cached) return cached;

    const promise = createMerchant({
      canonical_name: canonical,
      display_name: display,
      default_category_id: defaultCategoryId,
      icon: null,
      color: null,
    }).then((result) => {
      if (result.success) return result.data.id;
      if (result.error === 'DUPLICATE_CANONICAL') return result.existingId;
      return null;
    });

    merchantIdCacheRef.current.set(canonical, promise);
    return promise;
  }

  function focusCategoryField() {
    const element = document.getElementById('quick-add-category-trigger');
    if (element instanceof HTMLElement) {
      element.focus();
    }
  }

  function enterAtmMode() {
    setAtmMode(true);
    setKind('transfer');
    setIsInstallment(false);
    setShowNotes(false);

    // Pick a sensible default source account: prefer the currently-selected one if
    // it's a valid ATM source, else fall back to the first such account.
    const currentSource =
      selectedAccount && atmSourceAccounts.some((a) => a.id === selectedAccount.id)
        ? selectedAccount.id
        : (atmSourceAccounts.at(0)?.id ?? '');
    if (currentSource && currentSource !== form.getValues('account_id')) {
      form.setValue('account_id', currentSource, { shouldDirty: true });
      const sourceCurrency =
        atmSourceAccounts.find((a) => a.id === currentSource)?.currency ?? 'BAM';
      form.setValue('currency', sourceCurrency);
    }

    if (cashAccount) {
      form.setValue('to_account_id', cashAccount.id, { shouldDirty: true });
    }
    // Force amount sign to negative for the transfer-from leg, keeping any
    // amount the user already typed.
    const currentAmount = form.getValues('amount_cents');
    form.setValue('amount_cents', normalizeAmountForKind(currentAmount, 'transfer'), {
      shouldDirty: true,
    });
    form.setValue('category_id', null, { shouldDirty: true });
    form.setValue('merchant_raw', null, { shouldDirty: true });
  }

  function exitAtmMode() {
    setAtmMode(false);
    setKind('expense');
    form.setValue('to_account_id', undefined, { shouldDirty: true });
    const currentAmount = form.getValues('amount_cents');
    form.setValue('amount_cents', normalizeAmountForKind(currentAmount, 'expense'), {
      shouldDirty: true,
    });
  }

  async function handleCreateCashAccount() {
    const trimmed = cashCreateName.trim();
    if (trimmed.length === 0) {
      toast.error('Naziv ne može biti prazan.');
      return;
    }
    setCashCreating(true);
    const result = await createCashAccount(trimmed);
    setCashCreating(false);

    // ALREADY_EXISTS shouldn't normally surface (we only show the form when
    // cashAccount is null), but if it does we treat it as success: fetch
    // metadata and use it as the target.
    if (result.success || result.error === 'ALREADY_EXISTS') {
      const newId = result.success ? result.data.id : result.data.id;
      const synthesized: AccountOption = {
        id: newId,
        name: trimmed,
        currency: selectedAccount?.currency ?? 'BAM',
        type: 'cash',
      };
      setLocalCashAccount(synthesized);
      form.setValue('to_account_id', newId, { shouldDirty: true });
      toast.success(`Račun "${trimmed}" je kreiran.`);
      return;
    }

    if (result.error === 'UNAUTHORIZED') {
      toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
      return;
    }
    toast.error('Nije uspjelo kreiranje računa. Pokušaj ponovo.');
  }

  async function onSubmit(values: QuickAddFormValues) {
    // ATM mode requires a cash destination — block submit before closing the
    // sheet so the user can still create the cash account inline.
    if (atmMode && !values.to_account_id) {
      toast.error('Prvo napravi gotovinski račun.');
      return;
    }

    const signedAmount = normalizeAmountForKind(values.amount_cents, kind);

    // Kick off merchant lookup immediately (may be already in-flight from onBlur).
    // Transfers and installments handle merchant separately.
    const merchantPromise =
      !isTransfer && values.merchant_raw
        ? ensureMerchantExists(values.merchant_raw, values.category_id ?? null)
        : Promise.resolve(null);

    onOpenChange(false);

    const merchantId = await merchantPromise;

    // ── Installment plan branch ───────────────────────────────────────────
    if (isInstallment && showInstallmentToggle) {
      toast.success('Plan na rate je kreiran.');
      const totalAbs = signedAmount < 0n ? -signedAmount : signedAmount;
      const result = await createInstallmentPlan({
        account_id: values.account_id,
        merchant_id: merchantId ?? null,
        category_id: values.category_id ?? null,
        currency: values.currency,
        total_cents: totalAbs,
        installment_count: installmentCount,
        installment_cents: derivedInstallmentCents > 0n ? derivedInstallmentCents : totalAbs,
        start_date: values.transaction_date,
        day_of_month: dayOfMonth,
        notes: values.notes ?? null,
      });
      if (!result.success) {
        toast.error('Greška pri kreiranju plana na rate.', {
          description:
            result.error === 'NOT_CREDIT_CARD'
              ? 'Odabrani račun nije kreditna kartica.'
              : 'Pokušaj ponovo.',
        });
      }
      return;
    }

    // ── Regular / transfer branch ─────────────────────────────────────────
    toast.success(atmMode ? 'Podizanje je zabilježeno.' : 'Transakcija je dodata.');

    const payload: QuickAddFormValues = {
      ...values,
      amount_cents: signedAmount,
      merchant_id: isTransfer ? null : merchantId,
      merchant_raw: isTransfer ? null : values.merchant_raw,
      category_id: isTransfer ? null : values.category_id,
    };

    const snapshot: RetryDraft = { values: payload, kind };

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
        label: 'Pokušaj ponovo',
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
          <Button asChild type="button" variant="outline" className="h-11 min-h-[44px] w-full">
            <Link
              href="/skeniraj"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              <Camera className="mr-2 size-4" aria-hidden />
              Uslikaj račun umjesto ručnog unosa
            </Link>
          </Button>
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

          {atmMode ? (
            <div
              className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3"
              role="region"
              aria-label="Podizanje s bankomata"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-primary" aria-hidden />
                  <span className="text-sm font-semibold">Podizanje s bankomata</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 text-muted-foreground"
                  onClick={exitAtmMode}
                >
                  <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
                  Otkaži
                </Button>
              </div>
              {cashAccount ? (
                <p className="text-xs text-muted-foreground">
                  Cilj: <span className="font-medium text-foreground">{cashAccount.name}</span> (
                  {cashAccount.currency})
                </p>
              ) : (
                <div className="space-y-2 rounded-md border border-dashed bg-background p-3">
                  <p className="text-sm">
                    Još nemaš račun za gotovinu. Napravi ga jednim klikom da knjižiš podizanje kao
                    transfer.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={cashCreateName}
                      onChange={(event) => {
                        setCashCreateName(event.target.value);
                      }}
                      maxLength={100}
                      placeholder="Naziv računa"
                      className="h-11 min-h-[44px] flex-1"
                      aria-label="Naziv novog gotovinskog računa"
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        void handleCreateCashAccount();
                      }}
                      disabled={cashCreating || cashCreateName.trim().length === 0}
                      className="h-11 min-h-[44px]"
                    >
                      {cashCreating ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        'Napravi'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {canShowAtmPreset ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 min-h-[44px] w-full justify-start"
                  onClick={enterAtmMode}
                >
                  <Banknote className="mr-2 size-4" aria-hidden />
                  Podizanje s bankomata
                </Button>
              ) : null}
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
                  // Smart default: when switching to Transfer and there is exactly
                  // one cash account, pre-fill it as the destination.
                  if (
                    nextKind === 'transfer' &&
                    cashAccount &&
                    form.getValues('account_id') !== cashAccount.id
                  ) {
                    form.setValue('to_account_id', cashAccount.id, { shouldDirty: true });
                  } else {
                    form.setValue('to_account_id', undefined, { shouldDirty: true });
                  }
                  if (nextKind !== 'expense') setIsInstallment(false);
                }}
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="expense">Trošak</TabsTrigger>
                  <TabsTrigger value="income">Prihod</TabsTrigger>
                  <TabsTrigger value="transfer">Transfer</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {!isTransfer ? (
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
                      onBlurValue={(candidate) => {
                        if (candidate.trim().length > 0) {
                          void ensureMerchantExists(
                            candidate,
                            form.getValues('category_id') ?? null,
                          );
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          {!isTransfer ? (
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
          ) : null}

          <FormField
            control={form.control}
            name="account_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {atmMode ? 'Sa kojeg računa podižeš' : isTransfer ? 'Sa računa' : 'Račun'}
                </FormLabel>
                <FormControl>
                  <AccountSelect
                    id="quick-add-account"
                    accounts={atmMode ? atmSourceAccounts : effectiveAccounts}
                    value={field.value}
                    onValueChange={(nextAccountId) => {
                      field.onChange(nextAccountId);
                      const nextAccount = effectiveAccounts.find((a) => a.id === nextAccountId);
                      const nextCurrency = nextAccount?.currency ?? 'BAM';
                      form.setValue('currency', nextCurrency);
                      // Reset to_account_id if it now matches the selected from-account.
                      if (form.getValues('to_account_id') === nextAccountId) {
                        form.setValue('to_account_id', undefined, { shouldDirty: true });
                      }
                      // Turn off installment if new account is not a credit card.
                      if (nextAccount?.type !== 'credit_card') {
                        setIsInstallment(false);
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {isTransfer && !atmMode ? (
            <FormField
              control={form.control}
              name="to_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Na račun</FormLabel>
                  <FormControl>
                    <AccountSelect
                      id="quick-add-to-account"
                      accounts={toAccounts}
                      value={field.value ?? ''}
                      onValueChange={(nextAccountId) => {
                        field.onChange(nextAccountId || undefined);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          {isTransfer &&
          selectedToAccountId &&
          selectedAccount?.currency !==
            effectiveAccounts.find((a) => a.id === selectedToAccountId)?.currency ? (
            <p className="text-sm text-muted-foreground">
              Međuvalutni transfer — iznos će biti automatski konvertovan po tekućem kursu.
            </p>
          ) : null}

          {showInstallmentToggle ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="installment-toggle" className="cursor-pointer">
                  Na rate
                </Label>
                <Switch
                  id="installment-toggle"
                  checked={isInstallment}
                  onCheckedChange={setIsInstallment}
                />
              </div>

              {isInstallment ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="inst-count" className="text-xs text-muted-foreground">
                        Broj rata (2–60)
                      </Label>
                      <Input
                        id="inst-count"
                        type="number"
                        min={2}
                        max={60}
                        value={installmentCount}
                        onChange={(e) => {
                          const v = Math.max(2, Math.min(60, Number(e.target.value)));
                          setInstallmentCount(Number.isFinite(v) ? v : 3);
                        }}
                        className="h-11 min-h-[44px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="inst-day" className="text-xs text-muted-foreground">
                        Dan u mj. (1–28)
                      </Label>
                      <Input
                        id="inst-day"
                        type="number"
                        min={1}
                        max={28}
                        value={dayOfMonth}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(28, Number(e.target.value)));
                          setDayOfMonth(Number.isFinite(v) ? v : 15);
                        }}
                        className="h-11 min-h-[44px]"
                      />
                    </div>
                  </div>
                  {derivedInstallmentCents > 0n ? (
                    <p className="text-xs text-muted-foreground">
                      ≈{' '}
                      {new Intl.NumberFormat('bs-BA', {
                        style: 'currency',
                        currency: selectedCurrency,
                      }).format(Number(derivedInstallmentCents) / 100)}{' '}
                      / rati · zadnja rata može biti različita zbog zaokruživanja
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

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
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || effectiveAccounts.length === 0}
          >
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
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-xl">
        <DialogTitle>Brzi unos</DialogTitle>
        <DialogDescription>Dodaj transakciju bez napuštanja trenutne stranice.</DialogDescription>
        {content}
      </DialogContent>
    </Dialog>
  );
}
