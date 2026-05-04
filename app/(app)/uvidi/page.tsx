import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listInsights } from '@/lib/queries/insights';
import { UvidiClient } from './uvidi-client';

export const metadata: Metadata = {
  title: 'Uvidi — Konto',
};

export default async function UvidiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/prijava');

  // Both lists fetched in parallel — same Supabase client, separate filters.
  const [active, archived] = await Promise.all([
    listInsights(supabase, user.id, { mode: 'active', limit: 100 }),
    listInsights(supabase, user.id, { mode: 'archived', limit: 100 }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <UvidiClient
        active={active}
        archived={archived}
        // Surface the dev-only "Generiši ponovo" affordance only on dev builds.
        // In production the user can wait for the nightly cron — manual trigger
        // is intentionally hidden to avoid abuse without a UI rate-limit toast.
        isDev={process.env.NODE_ENV === 'development'}
      />
    </div>
  );
}
