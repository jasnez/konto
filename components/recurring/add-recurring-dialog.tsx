'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/money-input';
import { confirmRecurring, type ConfirmRecurringResult } from '@/app/(app)/pretplate/actions';

const NO_CATEGORY = '__none__';

const FormSchema = z.object({
  description: z.string().min(1, 'Naziv je obavezan').max(200),
  accountId: z.uuid({ message: 'Odaberi račun' }),
  categoryId: z.string(),
  period: z.enum(['weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly']),
  amountAbsString: z.string().min(1, 'Iznos je obavezan'),
  currency: z.string().length(3),
  nextExpectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Datum mora biti YYYY-MM-DD'),
});

type FormValues = z.infer<typeof FormSchema>;

const ERROR_COPY: Record<string, string> = {
  REFERENCED_NOT_OWNED: 'Kategorija/račun mora biti tvoj.',
  UNAUTHORIZED: 'Sesija je istekla. Prijavi se ponovo.',
  DATABASE_ERROR: 'Greška u bazi. Pokušaj opet za par sekundi.',
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${day}`;
}

function defaultNextExpectedIso(): string {
  // Default: 30 days from today — sensible monthly anchor; user can change.
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${day}`;
}

export interface AccountOption {
  id: string;
  name: string;
  currency: string;
  type: string;
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface AddRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountOption[];
  categories: CategoryOption[];
}

export function AddRecurringDialog({
  open,
  onOpenChange,
  accounts,
  categories,
}: AddRecurringDialogProps) {
  const router = useRouter();
  const firstAccount: AccountOption | undefined = accounts.length > 0 ? accounts[0] : undefined;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema) as never,
    defaultValues: {
      description: '',
      accountId: firstAccount ? firstAccount.id : '',
      categoryId: NO_CATEGORY,
      period: 'monthly',
      amountAbsString: '0',
      currency: firstAccount ? firstAccount.currency : 'BAM',
      nextExpectedDate: defaultNextExpectedIso(),
    },
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isSubmitting = form.formState.isSubmitting;
  const watchedCurrency = form.watch('currency');
  const watchedAccountId = form.watch('accountId');

  // When the user picks a different account, refresh the currency to that
  // account's currency. They can still override via the MoneyInput's
  // currency picker if needed.
  useEffect(() => {
    const acc = accounts.find((a) => a.id === watchedAccountId);
    if (acc && acc.currency !== form.getValues('currency')) {
      form.setValue('currency', acc.currency, { shouldValidate: false });
    }
  }, [watchedAccountId, accounts, form]);

  // Reset the form each time the dialog opens so a previous draft doesn't
  // leak in.
  useEffect(() => {
    if (open) {
      form.reset({
        description: '',
        accountId: firstAccount ? firstAccount.id : '',
        categoryId: NO_CATEGORY,
        period: 'monthly',
        amountAbsString: '0',
        currency: firstAccount ? firstAccount.currency : 'BAM',
        nextExpectedDate: defaultNextExpectedIso(),
      });
      setSubmitError(null);
    }
  }, [open, firstAccount, form]);

  async function handleSubmit(values: FormValues): Promise<void> {
    setSubmitError(null);
    let amountCentsAbs: bigint;
    try {
      amountCentsAbs = BigInt(values.amountAbsString.trim());
    } catch {
      setSubmitError('Iznos mora biti cijeli broj.');
      return;
    }
    if (amountCentsAbs === 0n) {
      setSubmitError('Iznos mora biti različit od nule.');
      return;
    }

    // Outflow → store as negative cents (matches detector convention).
    const signedAmount = -amountCentsAbs;

    const result: ConfirmRecurringResult = await confirmRecurring({
      merchantId: null,
      categoryId: values.categoryId === NO_CATEGORY ? null : values.categoryId,
      accountId: values.accountId,
      description: values.description,
      period: values.period,
      averageAmountCents: signedAmount.toString(),
      currency: values.currency,
      lastSeen: todayIso(),
      nextExpected: values.nextExpectedDate,
      occurrences: 0,
      transactionIds: [],
    });

    if (result.success) {
      toast.success('Pretplata dodata.');
      onOpenChange(false);
      router.refresh();
      return;
    }
    if (result.error === 'VALIDATION_ERROR') {
      setSubmitError('Provjeri unos i pokušaj ponovo.');
      return;
    }
    setSubmitError(ERROR_COPY[result.error] ?? 'Nepoznata greška.');
  }

  const noAccounts = accounts.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dodaj pretplatu</DialogTitle>
          <DialogDescription>
            Unesi pretplatu ručno (npr. nova Netflix pretplata koja još nije u istoriji
            transakcija). Buduće transakcije možeš kasnije vezati za ovu pretplatu.
          </DialogDescription>
        </DialogHeader>

        {noAccounts ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            Nemaš nijedan tekući/štedni/cash račun na koji bi pretplata teretila. Prvo dodaj račun
            na stranici{' '}
            <Link className="font-medium underline" href="/racuni">
              Računi
            </Link>
            .
          </p>
        ) : (
          <Form {...form}>
            <form
              onSubmit={(e) => {
                void form.handleSubmit(handleSubmit)(e);
              }}
              className="space-y-4"
              noValidate
            >
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Naziv</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Netflix" maxLength={200} autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Račun</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Odaberi račun" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} · {a.currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Sa ovog računa će se pretplata teretiti u projekciji.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategorija</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_CATEGORY}>Bez kategorije</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
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
                name="period"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="weekly">Sedmično</SelectItem>
                        <SelectItem value="bi-weekly">Dvosedmično</SelectItem>
                        <SelectItem value="monthly">Mjesečno</SelectItem>
                        <SelectItem value="quarterly">Kvartalno</SelectItem>
                        <SelectItem value="yearly">Godišnje</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amountAbsString"
                render={({ field }) => {
                  const cents = (() => {
                    if (!field.value) return 0n;
                    try {
                      return BigInt(field.value);
                    } catch {
                      return 0n;
                    }
                  })();
                  return (
                    <FormItem>
                      <FormLabel>Iznos</FormLabel>
                      <FormControl>
                        <MoneyInput
                          value={cents}
                          onChange={(v) => {
                            field.onChange(v.toString());
                          }}
                          currency={watchedCurrency}
                          onCurrencyChange={(c) => {
                            form.setValue('currency', c, { shouldValidate: false });
                          }}
                          size="lg"
                          aria-label="Iznos pretplate"
                        />
                      </FormControl>
                      <FormDescription>
                        Unesi pozitivan iznos — sistem ga sprema kao odliv.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="nextExpectedDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sljedeći datum</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>Datum kad očekuješ sljedeću naplatu.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {submitError && (
                <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {submitError}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onOpenChange(false);
                  }}
                  disabled={isSubmitting}
                >
                  Odustani
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  Sačuvaj
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
