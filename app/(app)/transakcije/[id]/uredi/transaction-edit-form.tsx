'use client';

import Link from 'next/link';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { updateTransaction } from '@/app/(app)/transakcije/actions';
import { AccountSelect, type AccountOption } from '@/components/account-select';
import {
  CategorySelect,
  type CategoryOption,
  type TransactionKind,
} from '@/components/category-select';
import { DatePicker } from '@/components/date-picker';
import { MerchantCombobox } from '@/components/merchant-combobox';
import { MoneyInput } from '@/components/money-input';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateTransactionSchema } from '@/lib/schemas/transaction';

type EditFormValues = z.infer<typeof CreateTransactionSchema>;

interface TransactionEditFormProps {
  transactionId: string;
  initialValues: EditFormValues;
  initialKind: TransactionKind;
  accounts: AccountOption[];
  categories: CategoryOption[];
  /**
   * When the form renders inside a modal/sheet (intercepted route at the
   * (app)/@modal slot, audit N17), the host already provides a title and
   * close button — drop the form's own back link, h1, and outer page
   * padding so they don't double up. The full-page route omits the prop
   * (chromeless=false) and keeps the standalone framing.
   */
  chromeless?: boolean;
}

function normalizeAmountForKind(amountCents: bigint, kind: TransactionKind): bigint {
  const abs = amountCents < 0n ? -amountCents : amountCents;
  return kind === 'income' ? abs : -abs;
}

export function TransactionEditForm({
  transactionId,
  initialValues,
  initialKind,
  accounts,
  categories,
  chromeless = false,
}: TransactionEditFormProps) {
  const router = useRouter();
  const [kind, setKind] = useState<TransactionKind>(initialKind);
  const form = useForm<EditFormValues>({
    resolver: zodResolver(CreateTransactionSchema) as never,
    defaultValues: initialValues,
    mode: 'onSubmit',
  });

  async function onSubmit(values: EditFormValues) {
    const payload: EditFormValues = {
      ...values,
      amount_cents: normalizeAmountForKind(values.amount_cents, kind),
    };

    const result = await updateTransaction(transactionId, payload);
    if (result.success) {
      toast.success('Transakcija je sačuvana.');
      router.push(`/transakcije/${transactionId}`);
      router.refresh();
      return;
    }

    if (result.error === 'DUPLICATE') {
      toast.error('Duplikat transakcije.', {
        description: 'Slična transakcija već postoji u zadnjih 30 dana.',
      });
      return;
    }

    if (result.error === 'INCOME_NOT_ALLOWED_ON_PASIVA') {
      toast.error('Prihod nije podržan na kreditnom računu.', {
        description:
          'Plaćanje rate je Transfer iz tekućeg računa u kredit, a ne prihod. Promijeni račun ili pretvori transakciju u transfer.',
      });
      return;
    }

    if (result.error === 'VALIDATION_ERROR') {
      const d = result.details;
      if (d.amount_cents?.[0]) form.setError('amount_cents', { message: d.amount_cents[0] });
      if (d.account_id?.[0]) form.setError('account_id', { message: d.account_id[0] });
      if (d.transaction_date?.[0])
        form.setError('transaction_date', { message: d.transaction_date[0] });
      if (d.merchant_raw?.[0]) form.setError('merchant_raw', { message: d.merchant_raw[0] });
      if (d.category_id?.[0]) form.setError('category_id', { message: d.category_id[0] });
      if (d.notes?.[0]) form.setError('notes', { message: d.notes[0] });
      if (d._root?.[0]) toast.error('Validacija nije prošla.', { description: d._root[0] });
      return;
    }

    toast.error('Spremanje nije uspjelo.', { description: 'Pokušaj ponovo.' });
  }

  const selectedAccount = accounts.find((account) => account.id === form.watch('account_id'));

  return (
    <div className={chromeless ? 'w-full' : 'mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6'}>
      {chromeless ? null : (
        <>
          <Button asChild variant="ghost" className="-ml-2 mb-3 h-11 px-2 text-muted-foreground">
            <Link href={`/transakcije/${transactionId}`} className="inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Nazad na detalj
            </Link>
          </Button>

          <h1 className="mb-4 text-2xl font-semibold tracking-tight">Uredi transakciju</h1>
        </>
      )}

      <Form {...form}>
        <form
          onSubmit={(event) => {
            void form.handleSubmit(onSubmit)(event);
          }}
          className="space-y-4 rounded-2xl border bg-card p-5"
        >
          <FormField
            control={form.control}
            name="amount_cents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Iznos</FormLabel>
                <FormControl>
                  <MoneyInput
                    size="lg"
                    allowNegative
                    value={field.value}
                    currency={selectedAccount?.currency ?? 'BAM'}
                    onChange={(next) => {
                      form.setValue('amount_cents', normalizeAmountForKind(next, kind), {
                        shouldDirty: true,
                      });
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
              onValueChange={(next) => {
                const nextKind = next as TransactionKind;
                setKind(nextKind);
                const amount = form.getValues('amount_cents');
                form.setValue('amount_cents', normalizeAmountForKind(amount, nextKind), {
                  shouldDirty: true,
                });
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
                <FormLabel>Trgovac</FormLabel>
                <FormControl>
                  <MerchantCombobox
                    value={field.value ?? ''}
                    onValueChange={(next) => {
                      field.onChange(next);
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
                    accounts={accounts}
                    value={field.value}
                    onValueChange={(next) => {
                      field.onChange(next);
                      const nextCurrency =
                        accounts.find((account) => account.id === next)?.currency ?? 'BAM';
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
                <FormLabel>Datum</FormLabel>
                <FormControl>
                  <DatePicker value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Napomena</FormLabel>
                <FormControl>
                  <Textarea
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    rows={4}
                    maxLength={500}
                    placeholder="Opciona napomena..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button asChild type="button" variant="outline">
              <Link href={`/transakcije/${transactionId}`}>Otkaži</Link>
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sačuvaj
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
