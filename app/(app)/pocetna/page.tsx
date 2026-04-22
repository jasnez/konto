import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Post-login home. Real dashboard UI lands in Faza 1 — this placeholder
 * establishes the routing target and gives the user a confirmation that
 * sign-in worked.
 */
export default async function PocetnaPage() {
  // Layout already enforced auth; we still fetch the user to personalize
  // the greeting. The profile row exists (seeded by handle_new_user trigger).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user?.id ?? '')
    .maybeSingle();

  const greeting = profile?.display_name ?? user?.email?.split('@')[0] ?? 'korisniče';

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Dobro došli, {greeting}.
        </h2>
        <p className="text-muted-foreground">Ovo je privremena početna stranica.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prazno za sada</CardTitle>
          <CardDescription>
            Još nema transakcija. Kad dodaš prvi račun i unesti transakciju, dashboard će zaživjeti.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Pravi dashboard (saldo, cashflow, kategorije, posljednje transakcije) dolazi u Fazi 1.
        </CardContent>
      </Card>
    </div>
  );
}
