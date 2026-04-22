'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateProfile } from './actions';
import {
  BASE_CURRENCIES,
  CURRENCY_LABELS,
  LOCALES,
  LOCALE_LABELS,
  UpdateProfileSchema,
  type UpdateProfileInput,
} from './schema';

export function ProfileForm({ defaultValues }: { defaultValues: UpdateProfileInput }) {
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues,
    mode: 'onSubmit',
  });

  async function onSubmit(values: UpdateProfileInput) {
    const result = await updateProfile(values);

    if (result.success) {
      toast.success('Sačuvano.');
      form.reset(values);
      return;
    }

    if (result.error === 'VALIDATION_ERROR') {
      const { display_name, base_currency, locale } = result.details;
      if (display_name?.[0]) form.setError('display_name', { message: display_name[0] });
      if (base_currency?.[0]) form.setError('base_currency', { message: base_currency[0] });
      if (locale?.[0]) form.setError('locale', { message: locale[0] });
      return;
    }

    if (result.error === 'UNAUTHORIZED') {
      toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
      return;
    }

    toast.error('Nije uspjelo.', { description: 'Pokušaj ponovo.' });
  }

  const isSubmitting = form.formState.isSubmitting;
  const isDirty = form.formState.isDirty;

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-6">
        <FormField
          control={form.control}
          name="display_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ime</FormLabel>
              <FormControl>
                <Input
                  autoComplete="name"
                  maxLength={100}
                  placeholder="Kako da ti se obraćamo?"
                  className="h-11"
                  {...field}
                />
              </FormControl>
              <FormDescription>Prikazuje se u pozdravu i nigdje javno.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="base_currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bazna valuta</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {BASE_CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {CURRENCY_LABELS[code]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Svi saldi i izvještaji se preračunavaju u ovu valutu.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="locale"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Jezik</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {LOCALES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {LOCALE_LABELS[code]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Utiče na format datuma i brojeva.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting || !isDirty} className="h-11">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Spašavam…
              </>
            ) : (
              'Sačuvaj'
            )}
          </Button>
          {isDirty ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => {
                form.reset(defaultValues);
              }}
            >
              Odustani
            </Button>
          ) : null}
        </div>
      </form>
    </Form>
  );
}
