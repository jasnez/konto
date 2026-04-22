'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Mail } from 'lucide-react';
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
import { sendMagicLink } from './actions';
import { SigninSchema, type SigninInput } from './schema';

export function PrijavaForm({ callbackErrored }: { callbackErrored: boolean }) {
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<SigninInput>({
    resolver: zodResolver(SigninSchema),
    defaultValues: { email: '' },
    mode: 'onSubmit',
  });

  async function onSubmit(values: SigninInput) {
    const result = await sendMagicLink(values);

    if (result.success) {
      setSentTo(values.email);
      return;
    }

    if (result.error === 'VALIDATION_ERROR') {
      const message = result.details.email?.[0] ?? 'Provjeri email i pokušaj ponovo.';
      form.setError('email', { message });
      return;
    }

    toast.error('Nije uspjelo.', {
      description: 'Ne možemo sada poslati link. Pokušaj opet za par sekundi.',
    });
  }

  if (sentTo) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <CardTitle>Provjeri inbox</CardTitle>
          <CardDescription>
            Poslali smo ti link na <span className="font-medium text-foreground">{sentTo}</span>.
            Klikni da se prijaviš.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => {
              setSentTo(null);
              form.reset();
            }}
          >
            Pošalji ponovo
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Nije stigao? Provjeri spam folder ili pokušaj opet za nekoliko minuta.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Prijavi se</CardTitle>
        <CardDescription>Unesi email i poslaćemo ti link za prijavu. Bez lozinke.</CardDescription>
      </CardHeader>
      <CardContent>
        {callbackErrored ? (
          <p
            role="alert"
            aria-live="polite"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Link više nije ispravan ili je istekao. Unesi email i poslaćemo novi.
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
                  Šaljem…
                </>
              ) : (
                'Pošalji link'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
