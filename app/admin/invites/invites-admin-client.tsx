'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createInviteCode, expireInviteCode } from './actions';

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

export interface InvitesAdminClientProps {
  invites: InviteRow[];
}

type Status = 'pending' | 'used' | 'expired';

function statusOf(row: InviteRow, now: Date): Status {
  if (row.used_at !== null) return 'used';
  if (new Date(row.expires_at) <= now) return 'expired';
  return 'pending';
}

const STATUS_PILL: Record<Status, string> = {
  pending: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  used: 'bg-muted text-muted-foreground',
  expired: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Slobodan',
  used: 'Iskorišten',
  expired: 'Istekao',
};

export function InvitesAdminClient({ invites }: InvitesAdminClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState('');
  const now = new Date();

  function handleCreate() {
    startTransition(() => {
      void (async () => {
        const result = await createInviteCode(notes.length > 0 ? { notes } : undefined);
        if (result.success) {
          toast.success(`Generisan kod: ${result.data.code}`, {
            duration: 8000,
            action: {
              label: 'Kopiraj',
              onClick: () => {
                void navigator.clipboard.writeText(result.data.code);
              },
            },
          });
          setNotes('');
          router.refresh();
          return;
        }
        if (result.error === 'FORBIDDEN' || result.error === 'UNAUTHORIZED') {
          toast.error('Nisi admin.');
          return;
        }
        toast.error('Greška: ' + (result.message ?? 'Nepoznata greška.'));
      })();
    });
  }

  function handleExpire(id: string) {
    startTransition(() => {
      void (async () => {
        const result = await expireInviteCode(id);
        if (result.success) {
          toast.success('Kod označen kao istekao.');
          router.refresh();
          return;
        }
        toast.error('Greška: ' + (result.message ?? 'Nepoznata greška.'));
      })();
    });
  }

  function handleCopy(code: string) {
    void navigator.clipboard.writeText(code);
    toast.success(`Kopiran: ${code}`);
  }

  const counts = invites.reduce<Record<Status, number>>(
    (acc, r) => {
      acc[statusOf(r, now)] += 1;
      return acc;
    },
    { pending: 0, used: 0, expired: 0 },
  );

  return (
    <>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold sm:text-3xl">Invite kodovi</h1>
        <p className="text-sm text-muted-foreground">
          Slobodno: <strong>{String(counts.pending)}</strong> · Iskorišteno:{' '}
          <strong>{String(counts.used)}</strong> · Isteklo:{' '}
          <strong>{String(counts.expired)}</strong>
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generiši novi kod</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="text"
              placeholder="Notes (opciono): ime primaoca…"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              maxLength={200}
              className="h-10 sm:flex-1"
            />
            <Button onClick={handleCreate} disabled={pending} className="h-10">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Generiši
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Za batch (npr. 20 kodova) koristi <code>pnpm tsx scripts/generate-invite-codes.mjs 20</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Svi kodovi ({String(invites.length)})</CardTitle>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Još nemaš generiranih kodova.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-4">Kod</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Notes</th>
                    <th className="pb-2 pr-4">Iskoristio</th>
                    <th className="pb-2 pr-4">Ističe</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((r) => {
                    const status = statusOf(r, now);
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => {
                              handleCopy(r.code);
                            }}
                            className="inline-flex items-center gap-1.5 font-mono text-sm hover:underline"
                            aria-label={`Kopiraj kod ${r.code}`}
                          >
                            <span>{r.code}</span>
                            <Copy className="h-3 w-3 text-muted-foreground" aria-hidden />
                          </button>
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                              STATUS_PILL[status],
                            )}
                          >
                            {STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {r.notes ?? '—'}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {r.used_by_email ?? (r.used_by ? 'nepoznato' : '—')}
                          {r.used_at ? (
                            <span className="ml-1">({r.used_at.slice(0, 10)})</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground tabular-nums">
                          {r.expires_at.slice(0, 10)}
                        </td>
                        <td className="py-2">
                          {status === 'pending' ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              disabled={pending}
                              onClick={() => {
                                handleExpire(r.id);
                              }}
                            >
                              <X className="mr-1 h-3 w-3" aria-hidden />
                              Istekni
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
