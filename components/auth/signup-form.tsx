'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
import { previewInvite, sendSignupOtp } from '@/app/(auth)/shared/actions';
import {
  PreviewInviteSchema,
  SendSignupOtpSchema,
  type PreviewInviteInput,
  type SendSignupOtpInput,
} from '@/app/(auth)/shared/schema';
import { OtpStep } from './otp-step';

interface SignupFormProps {
  /** True if /auth/callback bounced with ?error=true (expired link, prefetch). */
  callbackErrored?: boolean;
  /**
   * Whether ENABLE_INVITES is on for this environment. When true, the
   * user must enter a valid invite code on Step 1 before they can
   * submit an email. When false, Step 1 is skipped — straight to email.
   */
  requireInvite: boolean;
}

const INVITE_ERROR_COPY: Record<string, string> = {
  INVITE_REQUIRED: 'Pozivnica je obavezna za novi nalog.',
  INVITE_INVALID: 'Pozivnica ne postoji. Provjeri da nije s razmakom ili pogrešnim slovom.',
  INVITE_USED: 'Ova pozivnica je već iskorištena.',
  INVITE_EXPIRED: 'Ova pozivnica je istekla. Zatraži novu.',
  // SE-10: server-side rate-limit hit (30 lookups/min/IP). InviteStep falls
  // back to the COPY map automatically; EmailStep matches RATE_LIMITED in
  // its switch below.
  RATE_LIMITED: 'Previše brzih pokušaja. Sačekaj minutu i pokušaj ponovo.',
};

type Step = 'invite' | 'email' | 'otp';

/**
 * /registracija — three-step new-account flow:
 *   1. Pozivnica (only when requireInvite=true) — validated via previewInvite RPC.
 *   2. Email — validated and OTP sent via sendSignupOtp.
 *   3. Kod   — verified via verifyOtp; redirects to /pocetna.
 *
 * Each step is a single-purpose card so the user always sees one task.
 */
export function SignupForm({ callbackErrored = false, requireInvite }: SignupFormProps) {
  const [step, setStep] = useState<Step>(requireInvite ? 'invite' : 'email');
  const [inviteCode, setInviteCode] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  if (step === 'invite') {
    return (
      <InviteStep
        callbackErrored={callbackErrored}
        onValidated={(code) => {
          setInviteCode(code);
          setStep('email');
        }}
      />
    );
  }

  if (step === 'email') {
    return (
      <EmailStep
        callbackErrored={callbackErrored}
        requireInvite={requireInvite}
        inviteCode={inviteCode}
        onSent={(addr) => {
          setEmail(addr);
          setStep('otp');
          toast.success('Kod je poslan.', { description: addr });
        }}
        onBack={
          requireInvite
            ? () => {
                setStep('invite');
              }
            : undefined
        }
      />
    );
  }

  return (
    <OtpStep
      email={email}
      onResend={async () => {
        const result = await sendSignupOtp({ email, inviteCode: inviteCode || undefined });
        if (!result.success) {
          toast.error('Nije uspjelo.', {
            description: 'Pokušaj opet za par sekundi.',
          });
          return false;
        }
        return true;
      }}
      onChangeEmail={() => {
        setStep('email');
      }}
    />
  );
}

function InviteStep({
  callbackErrored,
  onValidated,
}: {
  callbackErrored: boolean;
  onValidated: (code: string) => void;
}) {
  const form = useForm<PreviewInviteInput>({
    resolver: zodResolver(PreviewInviteSchema),
    defaultValues: { inviteCode: '' },
    mode: 'onSubmit',
  });

  async function onSubmit(values: PreviewInviteInput) {
    const result = await previewInvite(values);

    if (result.success) {
      onValidated(values.inviteCode.toUpperCase());
      return;
    }

    if (result.error === 'VALIDATION_ERROR') {
      if (result.details.inviteCode?.[0]) {
        form.setError('inviteCode', { message: result.details.inviteCode[0] });
      }
      return;
    }

    form.setError('inviteCode', {
      message: INVITE_ERROR_COPY[result.error] ?? 'Pozivnica nije valjana.',
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Napravi nalog</CardTitle>
        <CardDescription>
          Trenutno smo u zatvorenom beta testu — unesi pozivnicu da nastaviš.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {callbackErrored ? (
          <p
            role="alert"
            aria-live="polite"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Link iz email-a nije radio. Probaj opet — kod možeš upisati ručno na sljedećem koraku.
          </p>
        ) : null}

        <Form {...form}>
          <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4">
            <FormField
              control={form.control}
              name="inviteCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pozivnica</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="ABCD2345"
                      maxLength={8}
                      className="h-11 font-mono uppercase tracking-[0.25em]"
                      autoFocus
                      {...field}
                      onChange={(e) => {
                        field.onChange(e.target.value.toUpperCase());
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    8 znakova. Bez 0, 1, O, I, l (radi izbjegavanja zabune).{' '}
                    <Link href="/cekanje" className="underline">
                      Prijavi se na čekanje
                    </Link>{' '}
                    ako nemaš pozivnicu.
                  </FormDescription>
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
                'Nastavi'
              )}
            </Button>
          </form>
        </Form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Već imaš nalog?{' '}
          <Link
            href="/prijava"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Prijavi se.
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function EmailStep({
  callbackErrored,
  requireInvite,
  inviteCode,
  onSent,
  onBack,
}: {
  callbackErrored: boolean;
  requireInvite: boolean;
  inviteCode: string;
  onSent: (email: string) => void;
  onBack?: () => void;
}) {
  const form = useForm<SendSignupOtpInput>({
    resolver: zodResolver(SendSignupOtpSchema),
    defaultValues: requireInvite ? { email: '', inviteCode } : { email: '' },
    mode: 'onSubmit',
  });

  async function onSubmit(values: SendSignupOtpInput) {
    const result = await sendSignupOtp(values);

    if (result.success) {
      onSent(values.email);
      return;
    }

    if (result.error === 'VALIDATION_ERROR') {
      if (result.details.email?.[0]) {
        form.setError('email', { message: result.details.email[0] });
      }
      if (result.details.inviteCode?.[0]) {
        form.setError('email', { message: 'Pozivnica je istekla — vrati se nazad.' });
      }
      return;
    }

    if (result.error === 'EMAIL_ALREADY_EXISTS') {
      form.setError('email', {
        message: 'Već postoji nalog s ovim emailom. Idi na /prijava.',
      });
      return;
    }

    if (
      result.error === 'INVITE_REQUIRED' ||
      result.error === 'INVITE_INVALID' ||
      result.error === 'INVITE_USED' ||
      result.error === 'INVITE_EXPIRED' ||
      result.error === 'RATE_LIMITED'
    ) {
      // Invite became invalid between Step 1 and Step 2 (race / expiry /
      // rate-limit on the per-IP bucket). Bounce back to invite step
      // with a message via toast.
      toast.error(INVITE_ERROR_COPY[result.error] ?? 'Pozivnica nije valjana.');
      onBack?.();
      return;
    }

    toast.error('Nije uspjelo.', {
      description: 'Ne možemo sada poslati kod. Pokušaj opet za par sekundi.',
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Tvoj email</CardTitle>
        <CardDescription>Poslaćemo ti 6-cifreni kod za potvrdu. Bez lozinke.</CardDescription>
      </CardHeader>
      <CardContent>
        {callbackErrored ? (
          <p
            role="alert"
            aria-live="polite"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Link nije radio iz ovog browsera. Pošalji novi kod i upiši ga ručno.
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
                      autoFocus
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
                  Šaljem…
                </>
              ) : (
                'Pošalji mi kod'
              )}
            </Button>
          </form>
        </Form>

        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            className="mt-4 h-11 w-full text-muted-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            Promijeni pozivnicu
          </Button>
        ) : null}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Već imaš nalog?{' '}
          <Link
            href="/prijava"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Prijavi se.
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
