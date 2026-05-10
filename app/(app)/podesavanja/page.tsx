import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { ResetOnboardingButton } from '@/components/onboarding/reset-onboarding-button';
import { createClient } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';
import { RestoreDefaultCategoriesButton } from './restore-default-categories-button';
import { SignOutButton } from './signout-button';
import {
  BASE_CURRENCIES,
  LOCALES,
  type BaseCurrency,
  type Locale,
  type UpdateProfileInput,
} from './schema';
import { logSafe } from '@/lib/logger';

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
    logSafe('podesavanja_load_error', { userId: user.id, error: error.message });
  }

  const defaultValues: UpdateProfileInput = {
    display_name: profile?.display_name ?? user.email?.split('@')[0] ?? '',
    base_currency: narrowCurrency(profile?.base_currency),
    locale: narrowLocale(profile?.locale),
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-4 sm:gap-8 sm:px-6 sm:py-6">
      <p className="text-sm text-muted-foreground">
        Prijavljen si kao <span className="text-foreground">{user.email}</span>.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Pomoć i sigurnost</CardTitle>
          <CardDescription>
            Uputstvo za uvoz, česta pitanja i kako tretiramo podatke.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href="/vodic"
            className="inline-flex h-11 min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Vodič kroz Konto
          </Link>
          <Link
            href="/pomoc"
            className="inline-flex h-11 min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Pomoć (FAQ)
          </Link>
          <Link
            href="/sigurnost"
            className="inline-flex h-11 min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Sigurnost i privatnost
          </Link>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle>Kategorije</CardTitle>
          <CardDescription>
            Ako ti nedostaju standardne kategorije (npr. nalog je kreiran prije ažuriranja
            aplikacije), možeš ih ponovo uvesti. Ovo ne briše tvoje postojeće kategorije — samo
            dodaje one koje još nemaju isti slug.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RestoreDefaultCategoriesButton />
        </CardContent>
      </Card>

      {process.env.NODE_ENV === 'development' && (
        <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle>Dev: Onboarding</CardTitle>
            <CardDescription>
              Vraća tebe u onboarding wizard. Vidljivo samo u razvojnom modu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResetOnboardingButton />
          </CardContent>
        </Card>
      )}

      <Separator />

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-medium tracking-tight">Brisanje naloga</h2>
          <p className="text-sm text-muted-foreground">
            Trajno brisanje naloga i svih podataka. Imaš 30 dana da otkažeš ako se predomisliš.
          </p>
        </div>
        <Link
          href="/podesavanja/obrisi"
          className="inline-flex text-sm font-medium text-destructive underline-offset-4 hover:underline"
        >
          Obriši nalog
        </Link>
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-medium tracking-tight">Odjava</h2>
          <p className="text-sm text-muted-foreground">
            Odjavljuje samo ovaj uređaj. Možeš se vratiti istim emailom.
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
