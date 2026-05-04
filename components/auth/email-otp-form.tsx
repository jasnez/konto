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
  /** True when middleware ili klijent pošalju ovdje nakon istekle sesije. */
  sessionExpired?: boolean;
  /**
   * When true (controlled by `ENABLE_INVITES` env on the server, passed
   * down by the page), shows the invite code input. New users without a
   * valid code can't sign up. Existing users sign in normally — the
   * Server Action looks up email existence and waives the gate when the
   * email is already in `auth.users`.
   */
  requireInvite?: boolean;
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

export function EmailOtpForm({
  variant,
  callbackErrored = false,
  sessionExpired = false,
  requireInvite = false,
}: EmailOtpFormProps) {
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
          sessionExpired={sessionExpired}
          requireInvite={requireInvite}
          onSent={(email) => {
            setSentTo(email);
          }}
        />
      )}
    </>
  );
}

const INVITE_ERROR_COPY: Record<string, string> = {
  INVITE_REQUIRED: 'Trenutno smo u zatvorenom beta testu — unesi invite kod.',
  INVITE_INVALID: 'Invite kod nije valjan. Provjeri da je tačno unesen.',
  INVITE_USED: 'Ovaj kod je već iskorišten.',
  INVITE_EXPIRED: 'Ovaj kod je istekao. Zatraži novi.',
};

function EmailStep({
  copy,
  callbackErrored,
  sessionExpired,
  requireInvite,
  onSent,
}: {
  copy: (typeof COPY)[Variant];
  callbackErrored: boolean;
  sessionExpired: boolean;
  requireInvite: boolean;
  onSent: (email: string) => void;
}) {
  // When invites aren't required, omit `inviteCode` from defaultValues so
  // it's `undefined` in form state — the schema's `.optional()` allows
  // that. Including it as `''` would trip the 8-char regex on submit even
  // though the user never sees the field. The conditional render below
  // matches: the field is mounted only when requireInvite=true.
  const form = useForm<SendOtpInput>({
    resolver: zodResolver(SendOtpSchema),
    defaultValues: requireInvite ? { email: '', inviteCode: '' } : { email: '' },
    mode: 'onSubmit',
  });

  async function onSubmit(values: SendOtpInput) {
    const result = await sendOtp(values);

    if (result.success) {
      onSent(values.email);
      return;
    }

    if (result.error === 'VALIDATION_ERROR') {
      if (result.details.email?.[0]) {
        form.setError('email', { message: result.details.email[0] });
      }
      if (result.details.inviteCode?.[0]) {
        form.setError('inviteCode', { message: result.details.inviteCode[0] });
      }
      return;
    }

    if (
      result.error === 'INVITE_REQUIRED' ||
      result.error === 'INVITE_INVALID' ||
      result.error === 'INVITE_USED' ||
      result.error === 'INVITE_EXPIRED'
    ) {
      form.setError('inviteCode', {
        message: INVITE_ERROR_COPY[result.error] ?? 'Kod nije valjan.',
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
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
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
                      placeholder="ti@primjer.ba"
                      className="h-11"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {requireInvite ? (
              <FormField
                control={form.control}
                name="inviteCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invite kod</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="text"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="ABCD2345"
                        maxLength={8}
                        className="h-11 font-mono uppercase tracking-[0.25em]"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value.toUpperCase());
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      8 znakova. Trenutno smo u zatvorenom beta testu —{' '}
                      <Link href="/cekanje" className="underline">
                        prijavi se na čekanje
                      </Link>{' '}
                      ako nemaš kod.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
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

    if (result.error === 'INVITE_REJECTED') {
      form.setError('token', {
        message:
          'Invite kod više nije valjan (možda je u međuvremenu iskorišten). Zatraži drugi kod.',
      });
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
