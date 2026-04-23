import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { ExportDownloadButton } from './export-download-button';

export const metadata: Metadata = {
  title: 'Izvoz podataka — Konto',
};

export default async function IzvozPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/prijava');
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Izvezi sve tvoje podatke</h1>
        <p className="text-sm text-muted-foreground">
          Dobićeš JSON fajl sa svim računima, transakcijama, kategorijama i merchants-ima. Koristi
          za backup ili migraciju.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>JSON export</CardTitle>
          <CardDescription>Jedan export po satu po nalogu.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ExportDownloadButton />
          <p className="text-xs text-muted-foreground">Ovo može potrajati par sekundi.</p>
        </CardContent>
      </Card>
    </div>
  );
}
