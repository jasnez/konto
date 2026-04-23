import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { DeleteAccountForm } from './delete-account-form';

export const metadata: Metadata = {
  title: 'Obriši nalog — Konto',
};

export default async function ObrisiNalogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/prijava');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('deleted_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.deleted_at) {
    redirect('/obrisan');
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Obriši svoj nalog</h1>
        <p className="text-sm text-muted-foreground">
          <Link href="/podesavanja" className="text-primary underline-offset-4 hover:underline">
            ← Nazad na podešavanja
          </Link>
        </p>
      </div>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Šta će se obrisati</CardTitle>
          <CardDescription>
            Trajno uklanjamo sve tvoje podatke vezane za Konto nakon isteka roka.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>Svi računi</li>
            <li>Sve transakcije</li>
            <li>Kategorije</li>
            <li>Budžeti</li>
            <li>Ciljevi</li>
          </ul>
          <p className="mt-4 text-sm font-medium text-foreground">
            Nalog se soft-briše odmah. Nakon 30 dana se trajno briše.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Potvrda</CardTitle>
          <CardDescription>
            Dobijećeš email sa linkom za otkazivanje (važi 24 sata). Nakon toga možeš se samo prijaviti
            ponovo ako otkažeš brisanje.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountForm />
        </CardContent>
      </Card>
    </div>
  );
}
