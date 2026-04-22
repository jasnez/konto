import { createBrowserClient } from '@supabase/ssr';
import { mustExist } from '@/lib/env';
import type { Database } from '@/supabase/types';

export function createClient() {
  return createBrowserClient<Database>(
    mustExist('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    mustExist('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
