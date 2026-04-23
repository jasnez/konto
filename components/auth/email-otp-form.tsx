'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { sendOtp, verifyOtp } from '@/app/(auth)/shared/actions';
import {
  SendOtpSchema,
  VerifyOtpSchema,
  type SendOtpInput,
  type VerifyOtpInput,
} from '@/app/(auth)/shared/schema';

type Variant = 'signin' | 'signup';

interface EmailOtpFormProps {
  variant: Variant;
  /** True if the /auth/callback route bounced us here with ?error=true. */
  callbackErrored?: boolean;
}

const COPY: Record<
  Variant,
  {
    title: string;
    description: string;
    submitLabel: string;
    submittingLabel: string;
    crossLink: { href: string; prompt: string; cta: string };
  }
> = {
  signin: {
    title: 'Prijavi se',
    description: 'Unesi email i poslaćemo ti kod (i link) za prijavu. Bez lozinke.',
    submitLabel: 'Pošalji kod',
    submittingLabel: 'Šaljem…',
    crossLink: {
      href: '/registracija',
      prompt: 'Nemaš nalog?',
      cta: 'Napravi ga.',
    },
  },
  signup: {
    title: 'Napravi nalog',
    description:
      'Unesi email i poslaćemo ti 6-cifreni kod. Bez lozinke — samo potvrdi email i upao si.',
    submitLabel: 'Pošalji kod',
    submittingLabel: 'Šaljem…',
    crossLink: {
      href: '/prijava',
      prompt: 'Već imaš nalog?',
      cta: 'Prijavi se.',
    },
  },
};

export function EmailOtpForm({ variant, callbackErrored = false }: EmailOtpFormProps) {
  const copy = COPY[variant];
  const [sentTo, setSentTo] = useState<string | null>(null);

  return (
    <>
      {sentTo ? (
        <OtpCodeStep
          email={sentTo}
          onResend={() => {
            setSentTo(null);
          }}
        />
      ) : (
        <EmailStep
          copy={copy}
          callbackErrored={callbackErrored}
          onSent={(email) => {
            setSentTo(email);
          }}
        />
      )}
    </>
  );
}

function EmailStep({
  copy,
  callbackErrored,
  onSent,
}: {
  copy: (typeof COPY)[Variant];
  callbackErrored: boolean;
  onSent: (email: string) => void;
}) {
  const form = useForm<SendOtpInput>({
    resolver: zodResolver(SendOtpSchema),
    defaultValues: { email: '' },
    mode: 'onSubmit',
  });

  async function onSubmit(values: SendOtpInput) {
    const result = await sendOtp(values);

    if (result.success) {
      onSent(values.email);
      return;
    }

    if (result.error === 'VALIDATION_ERROR') {
      const message = result.details.email?.[0] ?? 'Provjeri email i pokušaj ponovo.';
      form.setError('email', { message });
      return;
    }

    toast.error('Nije uspjelo.', {
      description: 'Ne možemo sada poslati kod. Pokušaj opet za par sekundi.',
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
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
                      placeholder="ti@primjer.ba"
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
                  {copy.submittingLabel}
                </>
              ) : (
                copy.submitLabel
              )}
            </Button>
          </form>
        </Form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {copy.crossLink.prompt}{' '}
          <Link
            href={copy.crossLink.href}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy.crossLink.cta}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function OtpCodeStep({ email, onResend }: { email: string; onResend: () => void }) {
  const form = useForm<VerifyOtpInput>({
    resolver: zodResolver(VerifyOtpSchema),
    defaultValues: { email, token: '' },
    mode: 'onSubmit',
  });

  async function onSubmit(values: VerifyOtpInput) {
    const result = await verifyOtp(values);

    // Happy path: `verifyOtp` calls redirect(), which throws NEXT_REDIRECT
    // and never returns a value. Reaching this block always means an error.
    if (result.success) return;

    if (result.error === 'VALIDATION_ERROR') {
      const tokenError = result.details.token?.[0] ?? 'Provjeri kod.';
      form.setError('token', { message: tokenError });
      return;
    }

    form.setError('token', {
      message: 'Kod nije ispravan ili je istekao. Zatraži novi.',
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <CardTitle>Provjeri inbox</CardTitle>
        <CardDescription>
          Poslali smo kod na <span className="font-medium text-foreground">{email}</span>. Upiši 6
          cifara ispod — ili klikni link iz email-a.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4">
            <FormField
              control={form.control}
              name="token"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>6-cifreni kod</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{6}"
                      maxLength={6}
                      required
                      placeholder="123456"
                      className="h-11 text-center text-lg tracking-[0.5em] tabular-nums"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Kod važi 1 sat.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting} className="h-11 w-full">
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Provjeravam…
                </>
              ) : (
                'Prijavi se'
              )}
            </Button>
          </form>
        </Form>

        <Button
          type="button"
          variant="ghost"
          className="mt-4 h-11 w-full text-muted-foreground"
          onClick={onResend}
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
          Promijeni email i pošalji ponovo
        </Button>
      </CardContent>
    </Card>
  );
}
