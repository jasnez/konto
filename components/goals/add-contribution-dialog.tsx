'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { MoneyInput } from '@/components/money-input';
import { AddContributionFormSchema, type AddContributionFormValues } from '@/lib/goals/validation';
import { addContribution, type AddContributionResult } from '@/app/(app)/ciljevi/actions';

export interface AddContributionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalId: string;
  goalName: string;
  currency: string;
}

const ERROR_COPY: Record<string, string> = {
  NOT_FOUND: 'Cilj nije pronađen. Možda je obrisan.',
  UNAUTHORIZED: 'Sesija je istekla. Prijavi se ponovo.',
  DATABASE_ERROR: 'Servis je trenutno spor. Pokušaj za minut.',
};

async function fireConfetti(): Promise<void> {
  try {
    const confetti = (await import('canvas-confetti')).default;
    void confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'],
    });
  } catch {
    // confetti is cosmetic — swallow any import/runtime error
  }
}

export function AddContributionDialog({
  open,
  onOpenChange,
  goalId,
  goalName,
  currency,
}: AddContributionDialogProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<AddContributionFormValues>({
    resolver: zodResolver(AddContributionFormSchema) as never,
    defaultValues: { amount_cents: '' },
    mode: 'onSubmit',
  });

  const isSubmitting = form.formState.isSubmitting;

  async function handleSubmit(values: AddContributionFormValues) {
    setSubmitError(null);
    const result: AddContributionResult = await addContribution(goalId, {
      amount_cents: values.amount_cents,
    });

    if (result.success) {
      if (result.data.justAchieved) {
        void fireConfetti();
        toast.success(`Cilj "${goalName}" je postignut! 🎉`, {
          description: 'Postavi sljedeći kad si spreman/spremna.',
          duration: 6000,
        });
      } else {
        toast.success('Uplata dodana.');
      }
      form.reset();
      onOpenChange(false);
      router.refresh();
      return;
    }

    if (result.error === 'VALIDATION_ERROR') {
      const details = result.details;
      const msg =
        details.amount_cents?.[0] ??
        (details._root.length > 0 ? details._root[0] : 'Provjeri unos i pokušaj ponovo.');
      setSubmitError(msg);
      return;
    }

    setSubmitError(ERROR_COPY[result.error] ?? 'Nepoznata greška.');
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset();
      setSubmitError(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Dodaj uplatu</DialogTitle>
          <DialogDescription>
            Koliko si uplatio ka cilju{' '}
            <strong className="text-foreground">&ldquo;{goalName}&rdquo;</strong>?
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
                    <FormLabel>Iznos uplate</FormLabel>
                    <FormControl>
                      <MoneyInput
                        value={initialCents}
                        onChange={(cents) => {
                          field.onChange(cents.toString());
                        }}
                        currency={currency}
                        aria-label="Iznos uplate"
                        size="lg"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {submitError && (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {submitError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                disabled={isSubmitting}
                onClick={() => {
                  handleOpenChange(false);
                }}
              >
                Odustani
              </Button>
              <Button type="submit" className="h-11 flex-1" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Dodaj uplatu
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
