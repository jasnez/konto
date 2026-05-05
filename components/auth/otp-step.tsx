'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { verifyOtp } from '@/app/(auth)/shared/actions';
import { VerifyOtpSchema, type VerifyOtpInput } from '@/app/(auth)/shared/schema';

interface OtpStepProps {
  email: string;
  /** Called when the user clicks "Pošalji ponovo" (resend). The parent
   *  re-runs whichever sendOtp action it owns. Returns true on success
   *  so the cooldown timer can restart. */
  onResend: () => Promise<boolean>;
  /** Called when the user clicks "Promijeni email" — parent should
   *  return to the previous step. */
  onChangeEmail: () => void;
}

const RESEND_COOLDOWN_SECONDS = 60;

export function OtpStep({ email, onResend, onChangeEmail }: OtpStepProps) {
  const form = useForm<VerifyOtpInput>({
    resolver: zodResolver(VerifyOtpSchema),
    defaultValues: { email, token: '' },
    mode: 'onSubmit',
  });

  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [isResending, setIsResending] = useState(false);
  const submittedRef = useRef(false);

  // Cooldown ticker. Starts at RESEND_COOLDOWN_SECONDS on mount and on
  // each successful resend; counts down to 0 then stays there until
  // user clicks resend again.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => {
      setCooldown((s) => s - 1);
    }, 1000);
    return () => {
      window.clearTimeout(id);
    };
  }, [cooldown]);

  async function onSubmit(values: VerifyOtpInput) {
    const result = await verifyOtp(values);
    if (result.success) return; // redirect throws, never reaches here

    if (result.error === 'VALIDATION_ERROR') {
      form.setError('token', {
        message: result.details.token?.[0] ?? 'Provjeri kod.',
      });
      return;
    }

    if (result.error === 'INVITE_REJECTED') {
      form.setError('token', {
        message: 'Pozivnica više nije valjana (možda je u međuvremenu iskorištena). Zatraži novu.',
      });
      return;
    }

    form.setError('token', {
      message: 'Kod nije ispravan ili je istekao. Pošalji novi.',
    });
  }

  async function handleResend() {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      const ok = await onResend();
      if (ok) {
        toast.success('Novi kod je poslan.', { description: email });
        setCooldown(RESEND_COOLDOWN_SECONDS);
        form.reset({ email, token: '' });
        submittedRef.current = false;
      }
    } finally {
      setIsResending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <CardTitle>Provjeri inbox</CardTitle>
        <CardDescription>
          Poslali smo 6-cifreni kod na <span className="font-medium text-foreground">{email}</span>.
          <br />
          Provjeri i spam folder. Kod važi 1 sat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-4">
            <FormField
              control={form.control}
              name="token"
              render={({ field }) => (
                <FormItem className="flex flex-col items-center">
                  <FormControl>
                    <InputOTP
                      maxLength={6}
                      autoFocus
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next);
                        // Auto-submit when 6 digits entered. Guard against
                        // re-submitting after an error has been shown:
                        // require the user to edit before re-firing.
                        if (next.length === 6 && !submittedRef.current) {
                          submittedRef.current = true;
                          void form.handleSubmit(onSubmit)();
                        }
                        if (next.length < 6) {
                          submittedRef.current = false;
                        }
                      }}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </FormControl>
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

        <div className="mt-4 flex flex-col gap-1">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full text-muted-foreground"
            onClick={() => void handleResend()}
            disabled={cooldown > 0 || isResending}
          >
            {isResending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Šaljem…
              </>
            ) : cooldown > 0 ? (
              `Pošalji novi kod (${String(cooldown)}s)`
            ) : (
              'Pošalji novi kod'
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full text-muted-foreground"
            onClick={onChangeEmail}
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            Promijeni email
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
