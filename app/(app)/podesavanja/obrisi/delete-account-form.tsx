'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { requestAccountDeletion, type RequestAccountDeletionResult } from './actions';
import { RequestAccountDeletionSchema, type RequestAccountDeletionInput } from './schema';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ActionError = Extract<RequestAccountDeletionResult, { success: false }>['error'];

const ERROR_MESSAGES: Record<ActionError, string> = {
  VALIDATION_ERROR: 'Provjeri unos.',
  UNAUTHORIZED: 'Sesija je istekla. Prijavi se ponovo.',
  EMAIL_MISMATCH: 'Email se ne poklapa sa nalogom.',
  ALREADY_PENDING: 'Nalog je već označen za brisanje.',
  EMAIL_SEND_FAILED: 'Nismo mogli poslati email. Pokušaj ponovo.',
  EMAIL_NOT_CONFIGURED:
    'Email servis trenutno ne radi. Javi nam na hello@konto.app — ovo je naš propust.',
  DATABASE_ERROR: 'Nije uspjelo. Pokušaj ponovo.',
};

export function DeleteAccountForm() {
  const [isPending, setIsPending] = useState(false);
  const [serverDetails, setServerDetails] = useState<Record<string, string[] | undefined>>({});

  const form = useForm<RequestAccountDeletionInput>({
    resolver: zodResolver(RequestAccountDeletionSchema),
    defaultValues: {
      email: '',
      understood: false,
    },
  });

  async function onSubmit(values: RequestAccountDeletionInput) {
    setServerDetails({});
    setIsPending(true);
    try {
      const result = await requestAccountDeletion(values);
      if (result.error === 'VALIDATION_ERROR' && result.details) {
        setServerDetails(result.details);
        if (result.details.email?.[0]) {
          form.setError('email', { message: result.details.email[0] });
        }
        if (result.details.understood?.[0]) {
          form.setError('understood', { message: result.details.understood[0] });
        }
      }
      toast.error(ERROR_MESSAGES[result.error]);
    } catch (error: unknown) {
      if (isRedirectError(error)) {
        return;
      }
      toast.error('Nije uspjelo.', { description: 'Pokušaj ponovo.' });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void form.handleSubmit(onSubmit)(e);
      }}
      className="flex flex-col gap-6"
    >
      <div className="space-y-2">
        <Label htmlFor="delete-email">Unesi svoj email da potvrdiš</Label>
        <Input
          id="delete-email"
          type="email"
          autoComplete="email"
          disabled={isPending}
          {...form.register('email')}
        />
        {form.formState.errors.email ? (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
        {serverDetails.email?.[0] && !form.formState.errors.email ? (
          <p className="text-sm text-destructive">{serverDetails.email[0]}</p>
        ) : null}
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="delete-understood"
          checked={form.watch('understood')}
          onCheckedChange={(v) => {
            form.setValue('understood', v === true, { shouldValidate: true });
          }}
          disabled={isPending}
        />
        <div className="grid gap-1.5 leading-none">
          <Label htmlFor="delete-understood" className="text-sm font-normal leading-snug">
            Razumijem da se brisanje naloga ne može poništiti.
          </Label>
          {form.formState.errors.understood ? (
            <p className="text-sm text-destructive">{form.formState.errors.understood.message}</p>
          ) : null}
        </div>
      </div>

      <Button type="submit" variant="destructive" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? 'Brisanje…' : 'Obriši nalog'}
      </Button>
    </form>
  );
}
