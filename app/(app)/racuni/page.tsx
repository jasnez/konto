import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { AccountCard } from '@/components/account-card';

/**
 * List template (DS §4.3): header + list grid; prazan state sa CTA.
 */
export default async function RacuniListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data: raw, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  const accounts = raw ?? [];
  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
        <p className="text-destructive">Ne mogu učitati račune. Pokušaj osvježiti stranicu.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Računi</h2>
        <Button
          asChild
          className="h-11 min-h-[44px] w-full shrink-0 sm:w-auto"
          data-testid="add-account"
        >
          <Link href="/racuni/novi" className="inline-flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            Dodaj račun
          </Link>
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div
          className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-8 text-center"
          data-testid="empty-accounts"
        >
          <span className="text-4xl" aria-hidden>
            🪴
          </span>
          <p className="text-lg font-medium">Još nema računa. Dodaj prvi da počneš.</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Račun može biti banka, gotovina, Revolut, Wise i slično — tu će se zbrajati transakcije.
          </p>
          <Button asChild className="h-11 min-h-[44px] w-full max-w-xs">
            <Link href="/racuni/novi">Dodaj račun</Link>
          </Button>
        </div>
      ) : (
        <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Lista računa">
          {accounts.map((a) => (
            <li key={a.id}>
              <AccountCard account={a} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
