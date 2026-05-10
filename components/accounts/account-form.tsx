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
  FormDescription,
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
import { Switch } from '@/components/ui/switch';
import { useFormDraft } from '@/lib/hooks/use-form-draft';
import { cn } from '@/lib/utils';

const defaultCreate: CreateAccountFormValues = {
  name: '',
  type: 'checking',
  institution: null,
  currency: 'BAM',
  initial_balance_cents: '0',
  icon: '💳',
  color: null,
  include_in_net_worth: true,
};

type AccountFormProps =
  | {
      mode: 'create';
      /**
       * Optional callback fired after a successful create. When provided,
       * the form skips its default `router.push('/racuni')` redirect — the
       * caller decides what to do next (e.g., advance an onboarding wizard
       * to the next step). Receives the newly-created account id.
       */
      onSuccess?: (accountId: string) => void;
      /** Override the success toast (e.g. wizard says "Korak 1 gotov"). */
      successToast?: string;
      /**
       * OB-1: opt-in localStorage draft persistence. Pass a stable key
       * (e.g. `'onboarding-step1-account'`) and the form will hydrate from
       * + save to localStorage on every change (debounced 500 ms). The
       * draft is cleared automatically on successful submit. Forms used
       * outside the wizard (e.g. `/racuni/novi`) can omit this and behave
       * as before.
       */
      draftKey?: string;
    }
  | {
      mode: 'edit';
      accountId: string;
      readOnlyInitialCents: number;
      defaultValues: AccountFormEditValues;
    };

export function AccountForm(props: AccountFormProps) {
  if (props.mode === 'create') {
    return (
      <CreateAccountForm
        onSuccess={props.onSuccess}
        successToast={props.successToast}
        draftKey={props.draftKey}
      />
    );
  }
  return (
    <EditAccountForm
      accountId={props.accountId}
      readOnlyInitialCents={props.readOnlyInitialCents}
      defaultValues={props.defaultValues}
    />
  );
}

interface CreateAccountFormProps {
  onSuccess?: (accountId: string) => void;
  successToast?: string;
  draftKey?: string;
}

function CreateAccountForm({ onSuccess, successToast, draftKey }: CreateAccountFormProps) {
  const router = useRouter();
  const form = useForm<CreateAccountFormValues>({
    resolver: zodResolver(CreateAccountFormSchema) as never,
    defaultValues: defaultCreate,
    mode: 'onSubmit',
  });
  // OB-1: opt-in draft persistence (no-op when draftKey is undefined).
  const { clearDraft } = useFormDraft(draftKey, form);
  const isSubmitting = form.formState.isSubmitting;
  const accountType = form.watch('type');

  async function onSubmit(values: CreateAccountFormValues) {
    const result: CreateAccountResult = await createAccount(values);
    if (result.success) {
      // OB-1: clear persisted draft on success so the next mount doesn't
      // re-hydrate stale values. No-op when draftKey is undefined.
      clearDraft();
      toast.success(successToast ?? 'Račun je kreiran.');
      if (onSuccess) {
        // Caller drives the next step (e.g. wizard). Skip the default redirect.
        onSuccess(result.data.id);
        return;
      }
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
      if (d.include_in_net_worth?.[0])
        form.setError('include_in_net_worth', { message: d.include_in_net_worth[0] });
      return;
    }
    if (result.error === 'UNAUTHORIZED') {
      toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
      return;
    }
    if (result.error === 'OPENING_BALANCE_CATEGORY_MISSING') {
      toast.error('Nešto je nepotpuno na strani Konta.', {
        description: 'Javi nam na hello@konto.app i riješićemo za nekoliko minuta.',
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
                  accountType={accountType}
                  error={fieldState.error?.message}
                />
              </FormControl>
              {accountType === 'credit_card' || accountType === 'loan' ? (
                <FormDescription>
                  Za kreditnu karticu/kredit unesi negativan iznos (zaduženje).
                </FormDescription>
              ) : null}
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
      include_in_net_worth: values.include_in_net_worth,
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
      if ('include_in_net_worth' in d && d.include_in_net_worth?.[0])
        form.setError('include_in_net_worth', { message: d.include_in_net_worth[0] });
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
  accountType,
  error,
}: {
  formControl: Control<CreateAccountFormValues>;
  fieldValue: string | undefined;
  onCentsStringChange: (v: string) => void;
  accountType: CreateAccountFormValues['type'];
  error?: string;
}) {
  const currencyCode = useWatch({ control: formControl, name: 'currency', defaultValue: 'BAM' });
  const allowNegative = accountType === 'credit_card' || accountType === 'loan';
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
      allowNegative={allowNegative}
      error={error}
    />
  );
}

// AccountFormFields renders the shared fields for both create and edit forms.
// The two callers pass different strongly-typed `useForm` instances
// (CreateAccountFormValues vs AccountFormEditValues). Expressing that
// heterogeneity in a single generic without leaking RHF's third transform-
// type parameter conflicts with zodResolver's widened return — the clean
// generic path fights zod's transforms more than it's worth for one shared
// shell. Instead we keep the interior typed as `any`-flavoured FieldsProps
// and scope the eslint-disable to just this function, not the whole file.

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
interface FieldsProps {
  form: any;
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
                  className="h-11 text-base"
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
              <Select
                onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue('include_in_net_worth', v === 'loan' ? false : true);
                }}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger className="h-11 text-base">
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
                  <SelectTrigger className="h-11 text-base">
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

        <FormField
          control={form.control}
          name="include_in_net_worth"
          render={({ field }) => (
            <FormItem className="rounded-lg border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <FormLabel className="text-base">Uključi u brojku na početnoj</FormLabel>
                  <FormDescription>
                    Zbroj uključenih računa na početnoj stranici. Za dugoročni kredit to možeš
                    isključiti — dug i dalje vidiš u zasebnom redu „Krediti (informativno)”.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="shrink-0"
                    aria-label="Uključi u brojku na početnoj"
                  />
                </FormControl>
              </div>
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
            // z-40 sits above the bottom nav (z-30) so the action bar isn't
            // hidden on mobile — fixes B1.
            'fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 p-4 backdrop-blur supports-[padding:max(0px)]:pb-[max(1rem,env(safe-area-inset-bottom))] md:static md:z-0 md:border-0 md:bg-transparent md:p-0',
          )}
        >
          <div className="mx-auto flex max-w-lg flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full sm:w-auto"
              onClick={() => {
                router.back();
              }}
            >
              Odustani
            </Button>
            <Button type="submit" className="h-11 w-full sm:w-auto" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === 'create' ? 'Dodaj račun' : 'Sačuvaj'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
