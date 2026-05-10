'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { sendSigninOtp } from '@/app/(auth)/shared/actions';
import { SendSigninOtpSchema, type SendSigninOtpInput } from '@/app/(auth)/shared/schema';
import { OtpStep } from './otp-step';

interface SigninFormProps {
  /** True if /auth/callback bounced with ?error=true (expired link, prefetch). */
  callbackErrored?: boolean;
  /** True after middleware bounce due to expired session. */
  sessionExpired?: boolean;
}

/**
 * /prijava — sign-in for EXISTING users only. Two steps:
 *   1. Email entry → server action sendSigninOtp
 *   2. OTP entry  → server action verifyOtp (redirects to /pocetna)
 *
 * If the email isn't on file, the server returns EMAIL_NOT_FOUND and
 * the form points the user to /registracija. No invite field ever.
 */
export function SigninForm({ callbackErrored = false, sessionExpired = false }: SigninFormProps) {
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <OtpStep
        email={sentTo}
        onResend={async () => {
          const result = await sendSigninOtp({ email: sentTo });
          if (!result.success) {
            toast.error('Nije uspjelo.', {
              description: 'Pokušaj opet za par sekundi.',
            });
            return false;
          }
          return true;
        }}
        onChangeEmail={() => {
          setSentTo(null);
        }}
      />
    );
  }

  return (
    <EmailStep
      callbackErrored={callbackErrored}
      sessionExpired={sessionExpired}
      onSent={(email) => {
        setSentTo(email);
        toast.success('Kod je poslan.', { description: email });
      }}
    />
  );
}

function EmailStep({
  callbackErrored,
  sessionExpired,
  onSent,
}: {
  callbackErrored: boolean;
  sessionExpired: boolean;
  onSent: (email: string) => void;
}) {
  const form = useForm<SendSigninOtpInput>({
    resolver: zodResolver(SendSigninOtpSchema),
    defaultValues: { email: '' },
    mode: 'onSubmit',
  });

  async function onSubmit(values: SendSigninOtpInput) {
    const result = await sendSigninOtp(values);

    if (result.success) {
      onSent(values.email);
      return;
    }

    if (result.error === 'VALIDATION_ERROR') {
      if (result.details.email?.[0]) {
        form.setError('email', { message: result.details.email[0] });
      }
      return;
    }

    if (result.error === 'EMAIL_NOT_FOUND') {
      // Don't expose the route path in the message — the visible
      // "Nemaš nalog? Napravi ga." link below the form is the affordance.
      form.setError('email', {
        message: 'Nemamo nalog za ovaj email. Napravi novi ispod.',
      });
      return;
    }

    toast.error('Nije uspjelo.', {
      description: 'Ne možemo sada poslati kod. Pokušaj opet za par sekundi.',
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Prijavi se</CardTitle>
        <CardDescription>Unesi email i poslaćemo ti 6-cifreni kod. Bez lozinke.</CardDescription>
      </CardHeader>
      <CardContent>
        {sessionExpired ? (
          <p
            role="status"
            aria-live="polite"
            className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
          >
            Sesija je istekla. Prijavi se ponovo — nakon prijave nastavljaš gdje si stao.
          </p>
        ) : null}
        {callbackErrored ? (
          <p
            role="alert"
            aria-live="polite"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Link nije radio iz ovog browsera (često ga email aplikacija otvori prije tebe). Pošalji
            novi kod i upiši ga — radi iz bilo kojeg uređaja.
          </p>
        ) : null}

        <Form {...form}>
          <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      required
                      placeholder="ime@primjer.ba"
                      className="h-11"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting} className="h-11 w-full">
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Slanje…
                </>
              ) : (
                'Pošalji mi kod'
              )}
            </Button>
          </form>
        </Form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Nemaš nalog?{' '}
          <Link
            href="/registracija"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Napravi ga.
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
