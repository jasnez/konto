import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { adminEmail } from '@/lib/auth/invite-config';

/**
 * Admin shell.
 *
 * Sole gating mechanism: the authenticated user's email must equal
 * `process.env.ADMIN_EMAIL`. There is no role/permission table — for closed
 * beta this single env-check is enough and keeps the data model lean.
 *
 * If the env var is unset, the entire `/admin/*` namespace is invisible
 * (returns 404, not 403, so attackers can't enumerate). If the user is
 * unauthenticated, redirect to /prijava as for any protected route.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/prijava');
  }

  const allowed = adminEmail();
  if (allowed === null) {
    // ADMIN_EMAIL not configured — admin is disabled in this environment.
    notFound();
  }

  if ((user.email ?? '').toLowerCase() !== allowed) {
    // Not the admin — pretend the route doesn't exist.
    notFound();
  }

  return <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">{children}</div>;
}
