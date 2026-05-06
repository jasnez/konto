'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import { editRecurring, type EditRecurringResult } from '@/app/(app)/pretplate/actions';
import type { MerchantOption } from '@/components/recurring/add-recurring-dialog';
import { z } from 'zod';

const NO_MERCHANT = '__none__';

/**
 * Local form schema — keeps the amount as a string for RHF, transforms
 * to a server payload on submit. Mirrors the Form/Server split used by
 * lib/budgets/validation. Only fields the user is allowed to mutate
 * post-confirmation are in here (occurrences/last_seen are derived from
 * transaction history, never user input).
 */
const FormSchema = z.object({
  description: z.string().min(1).max(200),
  period: z.enum(['weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly']),
  amountAbsString: z.string().min(1),
  currency: z.string().length(3),
  nextExpectedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .or(z.literal('')),
  merchantId: z.string(),
});

type FormValues = z.infer<typeof FormSchema>;

const ERROR_COPY: Record<string, string> = {
  REFERENCED_NOT_OWNED: 'Kategorija/račun mora biti tvoj.',
  NOT_FOUND: 'Pretplata više ne postoji. Osvježi stranicu.',
  UNAUTHORIZED: 'Sesija je istekla. Prijavi se ponovo.',
  DATABASE_ERROR: 'Greška u bazi. Pokušaj opet za par sekundi.',
};

export interface EditRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurring: {
    id: string;
    description: string;
    period: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly';
    averageAmountCents: bigint;
    currency: string;
    nextExpectedDate: string | null;
    merchantId: string | null;
  };
  merchants: MerchantOption[];
}

export function EditRecurringDialog({
  open,
  onOpenChange,
  recurring,
  merchants,
}: EditRecurringDialogProps) {
  const router = useRouter();
  // The DB stores signed amounts (negative for outflows). The UI
  // exposes the absolute value so users don't enter a sign — we
  // restore the sign on submit using the original sign.
  const initialSign = recurring.averageAmountCents < 0n ? -1n : 1n;
  const initialAbs = (
    initialSign === -1n ? -recurring.averageAmountCents : recurring.averageAmountCents
  ).toString();

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema) as never,
    defaultValues: {
      description: recurring.description,
      period: recurring.period,
      amountAbsString: initialAbs,
      currency: recurring.currency,
      nextExpectedDate: recurring.nextExpectedDate ?? '',
      merchantId: recurring.merchantId ?? NO_MERCHANT,
    },
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isSubmitting = form.formState.isSubmitting;
  const watchedCurrency = form.watch('currency');

  async function handleSubmit(values: FormValues): Promise<void> {
    setSubmitError(null);
    let amountCents: bigint;
    try {
      const abs = BigInt(values.amountAbsString.trim());
      if (abs === 0n) {
        setSubmitError('Iznos mora biti različit od nule.');
        return;
      }
      amountCents = initialSign === -1n ? -abs : abs;
    } catch {
      setSubmitError('Iznos mora biti cijeli broj.');
      return;
    }

    const result: EditRecurringResult = await editRecurring(recurring.id, {
      description: values.description,
      period: values.period,
      averageAmountCents: amountCents.toString(),
      currency: values.currency,
      nextExpectedDate: values.nextExpectedDate === '' ? null : values.nextExpectedDate,
      merchantId: values.merchantId === NO_MERCHANT ? null : values.merchantId,
    });
    if (result.success) {
      toast.success('Pretplata ažurirana.');
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Uredi pretplatu</DialogTitle>
          <DialogDescription>
            Mijenjaj naziv, period, iznos ili sljedeći datum. Istorija ostaje netaknuta.
          </DialogDescription>
        </DialogHeader>
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
                    <Input {...field} placeholder="Netflix" maxLength={200} />
                  </FormControl>
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
              name="merchantId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trgovac (merchant)</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_MERCHANT}>Bez trgovca</SelectItem>
                      {merchants.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Pomaže grupisanje sa transakcijama na isti merchant.
                  </FormDescription>
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
                      Predznak (odliv/priliv) ostaje isti kao prije izmjene.
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
                  <FormDescription>Ostavi prazno ako ne znaš tačan datum.</FormDescription>
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
      </DialogContent>
    </Dialog>
  );
}
