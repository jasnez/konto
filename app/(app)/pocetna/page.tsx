import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Minimal post-login landing so the /auth/callback redirect has a working
 * target. The proper app shell (sidebar, top bar, nav) lands in F0-E3-T3 and
 * the real dashboard UI in Faza 1. Middleware already gates this route, but
 * we still fetch the user here so the page Server Component can read
 * display_name and so there is an explicit auth check at the page layer
 * (defense-in-depth per .cursor/rules/security.mdc).
 */
export default async function PocetnaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/prijava');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  const greeting = profile?.display_name ?? user.email?.split('@')[0] ?? 'korisniče';

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-4 py-16 sm:px-6">
      <p className="text-sm font-mono text-muted-foreground">Početna</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Dobro došli, {greeting}.
      </h1>
      <p className="text-muted-foreground">
        Prijavljen si. Pravi dashboard dolazi ubrzo — za sada je ovo samo privremena stranica.
      </p>
    </main>
  );
}
