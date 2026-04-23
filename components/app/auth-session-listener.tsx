'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const SHELL_PATH_PREFIXES = [
  '/pocetna',
  '/transakcije',
  '/racuni',
  '/podesavanja',
  '/kategorije',
  '/merchants',
  '/budzet',
  '/ciljevi',
  '/uvidi',
  '/uvoz',
] as const;

function isAuthenticatedShellPath(path: string): boolean {
  for (const prefix of SHELL_PATH_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

/**
 * Kada session istekne (refresh ne uspije), Supabase emituje SIGNED_OUT.
 * U tom slučaju redirekt na prijavu, umjesto prazne ili polutke stranice.
 */
export function AuthSessionListener() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      const path = window.location.pathname;
      if (!isAuthenticatedShellPath(path)) return;
      router.replace('/prijava?session=istekao');
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router, supabase]);

  return null;
}
