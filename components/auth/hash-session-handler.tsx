'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Magic links from Supabase often land on `site_url` with tokens in the URL hash
 * (`/#access_token=...`). That can be `/` or another public route, not only `/prijava`.
 * Mount once at the root so the session is established and the user is sent onward.
 */
export function HashSessionHandler() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#')) return;

    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return;

    const supabase = createClient();
    void (async () => {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        window.location.replace('/prijava?error=true');
        return;
      }
      window.location.replace('/pocetna');
    })();
  }, []);

  return null;
}
