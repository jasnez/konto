import { createClient } from '@supabase/supabase-js';
import { mustExist } from '@/lib/env';
import type { Database } from '@/supabase/types';

/** Service-role client for server-only jobs (audit writes, cancel flow, cron). */
export function createAdminClient() {
  return createClient<Database>(
    mustExist('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    mustExist('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
