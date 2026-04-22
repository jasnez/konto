import { createBrowserClient } from '@supabase/ssr';
import { mustExist } from '@/lib/env';

export function createClient() {
  return createBrowserClient(
    mustExist('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    mustExist('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
