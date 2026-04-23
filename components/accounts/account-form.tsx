/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Control } from 'react-hook-form';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createAccount, updateAccount, type CreateAccountResult } from '@/app/(app)/racuni/actions';
import {
  AccountFormEditSchema,
  CreateAccountFormSchema,
  type AccountFormEditValues,
  type CreateAccountFormValues,
} from '@/lib/accounts/validation';
import { CURRENCIES, ACCOUNT_TYPE_OPTIONS, getCurrencyLabel } from '@/lib/accounts/constants';
import { formatMinorUnits } from '@/lib/format/amount';
import { Button } from '@/components/ui/button';
import { InstitutionCombobox } from '@/components/accounts/institution-combobox';
import { AccountColorField, AccountIconField } from '@/components/accounts/icon-color-fields';
import { MoneyInput } from '@/components/money-input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const defaultCreate: CreateAccountFormValues = {
  name: '',
  type: 'checking',
  institution: null,
  currency: 'BAM',
  initial_balance_cents: '0',
  icon: '💳',
  color: null,
};

type AccountFormProps =
  | { mode: 'create' }
  | {
      mode: 'edit';
      accountId: string;
      readOnlyInitialCents: number;
      defaultValues: AccountFormEditValues;
    };

export function AccountForm(props: AccountFormProps) {
  if (props.mode === 'create') {
    return <CreateAccountForm />;
  }
  return (
    <EditAccountForm
      accountId={props.accountId}
      readOnlyInitialCents={props.readOnlyInitialCents}
      defaultValues={props.defaultValues}
    />
  );
}

function CreateAccountForm() {
  const router = useRouter();
  const form = useForm<CreateAccountFormValues>({
    resolver: zodResolver(CreateAccountFormSchema) as never,
    defaultValues: defaultCreate,
    mode: 'onSubmit',
  });
  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: CreateAccountFormValues) {
    const result: CreateAccountResult = await createAccount(values);
    if (result.success) {
      toast.success('Račun je kreiran.');
      router.push('/racuni');
      router.refresh();
      return;
    }
    if (result.error === 'VALIDATION_ERROR') {
      const d = result.details;
      if (d.name?.[0]) form.setError('name', { message: d.name[0] });
      if (d.type?.[0]) form.setError('type', { message: d.type[0] });
      if (d.institution?.[0]) form.setError('institution', { message: d.institution[0] });
      if (d.currency?.[0]) form.setError('currency', { message: d.currency[0] });
      if (d.initial_balance_cents?.[0])
        form.setError('initial_balance_cents', { message: d.initial_balance_cents[0] });
      if (d.icon?.[0]) form.setError('icon', { message: d.icon[0] });
      if (d.color?.[0]) form.setError('color', { message: d.color[0] });
      return;
    }
    if (result.error === 'UNAUTHORIZED') {
      toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
      return;
    }
    if (result.error === 'OPENING_BALANCE_CATEGORY_MISSING') {
      toast.error('Nedostaje kategorija “Početno stanje”.', {
        description: 'Ažuriraj bazu (migracija) ili kontaktiraj podršku.',
      });
      return;
    }
    toast.error('Nije uspjelo', { description: 'Pokušaj ponovo.' });
  }

  return (
    <AccountFormFields
      form={form}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      mode="create"
      balanceSection={
        <FormField
          control={form.control}
          name="initial_balance_cents"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Početno stanje (opciono)</FormLabel>
              <FormControl>
                <InitialBalanceMoney
                  formControl={form.control}
                  fieldValue={field.value}
                  onCentsStringChange={field.onChange}
                  error={fieldState.error?.message}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      }
    />
  );
}

function EditAccountForm({
  accountId,
  readOnlyInitialCents,
  defaultValues,
}: {
  accountId: string;
  readOnlyInitialCents: number;
  defaultValues: AccountFormEditValues;
}) {
  const router = useRouter();
  const form = useForm<AccountFormEditValues>({
    resolver: zodResolver(AccountFormEditSchema) as never,
    defaultValues,
    mode: 'onSubmit',
  });
  const isSubmitting = form.formState.isSubmitting;
  const currency = form.watch('currency');

  async function onSubmit(values: AccountFormEditValues) {
    const res = await updateAccount(accountId, {
      name: values.name,
      type: values.type,
      institution: values.institution,
      currency: values.currency,
      icon: values.icon,
      color: values.color,
    });
    if (res.success) {
      toast.success('Račun je ažuriran.');
      router.push('/racuni');
      router.refresh();
      return;
    }
    if (res.error === 'VALIDATION_ERROR') {
      const d = res.details;
      if ('_root' in d && d._root[0]) form.setError('name', { message: d._root[0] });
      if ('name' in d && d.name?.[0]) form.setError('name', { message: d.name[0] });
      if ('type' in d && d.type?.[0]) form.setError('type', { message: d.type[0] });
      if ('institution' in d && d.institution?.[0])
        form.setError('institution', { message: d.institution[0] });
      if ('currency' in d && d.currency?.[0]) form.setError('currency', { message: d.currency[0] });
      if ('icon' in d && d.icon?.[0]) form.setError('icon', { message: d.icon[0] });
      if ('color' in d && d.color?.[0]) form.setError('color', { message: d.color[0] });
      return;
    }
    if (res.error === 'UNAUTHORIZED') {
      toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
      return;
    }
    if (res.error === 'NOT_FOUND') {
      form.setError('name', { message: 'Račun nije pronađen.' });
      return;
    }
    toast.error('Nije uspjelo', { description: 'Pokušaj ponovo.' });
  }

  return (
    <AccountFormFields
      form={form}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      mode="edit"
      balanceSection={
        <div className="rounded-lg border border-dashed p-4">
          <p className="text-sm text-muted-foreground">Početno stanje (samo prikaz)</p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatMinorUnits(readOnlyInitialCents, currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            Povijest iznosa ide kroz transakcije, ne ovdje.
          </p>
        </div>
      }
    />
  );
}

function InitialBalanceMoney({
  formControl,
  fieldValue,
  onCentsStringChange,
  error,
}: {
  formControl: Control<CreateAccountFormValues>;
  fieldValue: string | undefined;
  onCentsStringChange: (v: string) => void;
  error?: string;
}) {
  const currencyCode = useWatch({ control: formControl, name: 'currency', defaultValue: 'BAM' });
  let cents: bigint;
  try {
    cents = BigInt(fieldValue ?? '0');
  } catch {
    cents = 0n;
  }
  return (
    <MoneyInput
      id="initial_balance"
      aria-label="Početno stanje"
      value={cents}
      onChange={(c) => {
        onCentsStringChange(c.toString());
      }}
      currency={currencyCode}
      error={error}
    />
  );
}

interface FieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (v: any) => void | Promise<void>;
  isSubmitting: boolean;
  mode: 'create' | 'edit';
  balanceSection: ReactNode;
}

function AccountFormFields(props: FieldsProps) {
  const { form, onSubmit, isSubmitting, mode, balanceSection } = props;
  const router = useRouter();
  return (
    <Form {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(onSubmit)}
        className="mx-auto max-w-lg space-y-6 pb-24 md:pb-8"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Naziv</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  maxLength={100}
                  className="h-11 min-h-[44px] text-base"
                  placeholder="npr. Zaba tekući"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tip</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="h-11 min-h-[44px] text-base">
                    <SelectValue placeholder="Tip računa" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ACCOUNT_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="mr-2" aria-hidden>
                        {o.emoji}
                      </span>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="institution"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Institucija (opciono)</FormLabel>
              <FormControl>
                <InstitutionCombobox
                  value={field.value}
                  onChange={field.onChange}
                  id="institution"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Valuta</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="h-11 min-h-[44px] text-base">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {getCurrencyLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {balanceSection}

        <FormField
          control={form.control}
          name="icon"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormControl>
                <AccountIconField
                  id="account-icon"
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="color"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormControl>
                <AccountColorField
                  id="account-color"
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div
          className={cn(
            'fixed bottom-0 left-0 right-0 z-10 border-t bg-background/95 p-4 backdrop-blur supports-[padding:max(0px)]:pb-[max(1rem,env(safe-area-inset-bottom))] md:static md:z-0 md:border-0 md:bg-transparent md:p-0',
          )}
        >
          <div className="mx-auto flex max-w-lg flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-[44px] w-full sm:w-auto"
              onClick={() => {
                router.back();
              }}
            >
              Odustani
            </Button>
            <Button
              type="submit"
              className="h-11 min-h-[44px] w-full sm:w-auto"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === 'create' ? 'Dodaj račun' : 'Sačuvaj'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
