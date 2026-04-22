import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { createClient } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';
import { SignOutButton } from './signout-button';
import {
  BASE_CURRENCIES,
  LOCALES,
  type BaseCurrency,
  type Locale,
  type UpdateProfileInput,
} from './schema';

export const metadata: Metadata = {
  title: 'Podešavanja — Konto',
};

export default async function PodesavanjaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/prijava');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, base_currency, locale')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('podesavanja_load_error', { userId: user.id, error: error.message });
  }

  const defaultValues: UpdateProfileInput = {
    display_name: profile?.display_name ?? user.email?.split('@')[0] ?? '',
    base_currency: narrowCurrency(profile?.base_currency),
    locale: narrowLocale(profile?.locale),
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <p className="text-sm text-muted-foreground">
        Prijavljen si kao <span className="text-foreground">{user.email}</span>.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>
            Osnovno o tebi i preferencije za valutu i jezik. Ovo nikad ne dijelimo sa trećim
            stranama.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm defaultValues={defaultValues} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Izgled</CardTitle>
          <CardDescription>Prebacivanje između svijetle, tamne i sistemske teme.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Separator />

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Sesija</h2>
          <p className="text-sm text-muted-foreground">
            Odjava briše sesiju samo na ovom uređaju. Možeš se opet prijaviti istim emailom.
          </p>
        </div>
        <SignOutButton />
      </section>
    </div>
  );
}

function narrowCurrency(value: string | null | undefined): BaseCurrency {
  return (BASE_CURRENCIES as readonly string[]).includes(value ?? '')
    ? (value as BaseCurrency)
    : 'BAM';
}

function narrowLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : 'bs-BA';
}
