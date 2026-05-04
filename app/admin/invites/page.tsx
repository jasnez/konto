import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { InvitesAdminClient } from './invites-admin-client';

export const metadata: Metadata = {
  title: 'Admin · Invite codes — Konto',
};

interface InviteRow {
  id: string;
  code: string;
  used_by: string | null;
  used_by_email: string | null;
  used_at: string | null;
  expires_at: string;
  notes: string | null;
  created_at: string;
}

export default async function InvitesAdminPage() {
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from('invite_codes')
    .select('id, code, used_by, used_at, expires_at, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Greška: {error.message}
      </div>
    );
  }

  // Resolve used_by → email via the auth admin SDK. ListUsers is fine for the
  // closed-beta scale; if it grows we'll switch to a paginated lookup.
  const userIds = new Set(
    rows.map((r) => r.used_by).filter((v): v is string => v !== null),
  );
  const emailById = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of list.users) {
      if (u.email !== undefined && userIds.has(u.id)) emailById.set(u.id, u.email);
    }
  }

  const enriched: InviteRow[] = rows.map((r) => ({
    ...r,
    used_by_email: r.used_by ? (emailById.get(r.used_by) ?? null) : null,
  }));

  return <InvitesAdminClient invites={enriched} />;
}
