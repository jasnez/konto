'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { AddGoalDialog } from '@/components/goals/add-goal-dialog';
import { EditGoalDialog, type EditableGoal } from '@/components/goals/edit-goal-dialog';
import { AddContributionDialog } from '@/components/goals/add-contribution-dialog';
import { GoalCard } from '@/components/goals/goal-card';
import { GoalsEmptyState } from '@/components/goals/empty-state';
import type { GoalAccount } from '@/components/goals/goal-form';
import type { GoalItem } from '@/lib/queries/goals';
import { deleteGoal, type DeleteGoalResult } from './actions';

/**
 * Client wrapper for /ciljevi. Owns dialog open-state + per-card mutation
 * orchestration. The Server Component (page.tsx) does the data fetch and
 * passes serialized rows down (bigints → strings to cross the RSC boundary).
 */

export interface SerializedGoal {
  id: string;
  name: string;
  targetAmountCents: string;
  currentAmountCents: string;
  currency: string;
  targetDate: string | null;
  accountId: string | null;
  icon: string | null;
  color: string | null;
  active: boolean;
  achievedAt: string | null;
  createdAt: string;
  updatedAt: string;
  progress: number;
  accountName: string | null;
  recommendedMonthlyCents: string | null;
  monthsLeft: number | null;
}

export interface GoalsClientProps {
  initialGoals: SerializedGoal[];
  accounts: GoalAccount[];
  baseCurrency: string;
}

const DELETE_ERROR_COPY: Record<string, string> = {
  NOT_FOUND: 'Cilj više ne postoji.',
  UNAUTHORIZED: 'Sesija je istekla.',
  DATABASE_ERROR: 'Servis je trenutno spor. Pokušaj za minut.',
};

export function GoalsClient({ initialGoals, accounts, baseCurrency }: GoalsClientProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [contributingId, setContributingId] = useState<string | null>(null);

  // Re-hydrate bigints from serialized strings
  const goals = useMemo<GoalItem[]>(
    () =>
      initialGoals.map((g) => ({
        id: g.id,
        name: g.name,
        targetAmountCents: BigInt(g.targetAmountCents),
        currentAmountCents: BigInt(g.currentAmountCents),
        currency: g.currency,
        targetDate: g.targetDate,
        accountId: g.accountId,
        icon: g.icon,
        color: g.color,
        active: g.active,
        achievedAt: g.achievedAt,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        progress: g.progress,
        accountName: g.accountName,
        recommendedMonthlyCents:
          g.recommendedMonthlyCents !== null ? BigInt(g.recommendedMonthlyCents) : null,
        monthsLeft: g.monthsLeft,
      })),
    [initialGoals],
  );

  const editingGoal = goals.find((g) => g.id === editingId);
  const contributingGoal = goals.find((g) => g.id === contributingId);

  async function handleDeleteConfirmed(id: string) {
    const result: DeleteGoalResult = await deleteGoal(id);
    if (result.success) {
      toast.success('Cilj obrisan.');
      setDeletingId(null);
      router.refresh();
      return;
    }
    if (result.error === 'VALIDATION_ERROR') {
      toast.error('Nevažeći zahtjev.');
      return;
    }
    toast.error(DELETE_ERROR_COPY[result.error] ?? 'Nepoznata greška.');
  }

  // Separate active from achieved for distinct sections
  const activeGoals = goals.filter((g) => g.active && g.achievedAt === null);
  const achievedGoals = goals.filter((g) => g.achievedAt !== null);
  const archivedGoals = goals.filter((g) => !g.active && g.achievedAt === null);

  return (
    <>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Ciljevi štednje</h1>
          <p className="text-sm text-muted-foreground">
            Prati napredak i slavi kad dostignuješ ciljeve.
          </p>
        </div>
        <Button
          onClick={() => {
            setAddOpen(true);
          }}
          size="lg"
          className="shrink-0"
        >
          <Plus className="mr-2 h-5 w-5" aria-hidden />
          Novi cilj
        </Button>
      </header>

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {goals.length === 0 && (
        <GoalsEmptyState
          onCreate={() => {
            setAddOpen(true);
          }}
        />
      )}

      {/* ── Active goals ──────────────────────────────────────────────────── */}
      {activeGoals.length > 0 && (
        <section aria-labelledby="active-goals-heading" className="mb-8">
          {(achievedGoals.length > 0 || archivedGoals.length > 0) && (
            <h2
              id="active-goals-heading"
              className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground"
            >
              Aktivni
            </h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {activeGoals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onEdit={(id) => {
                  setEditingId(id);
                }}
                onAddContribution={(id) => {
                  setContributingId(id);
                }}
                onDelete={(id) => {
                  setDeletingId(id);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Achieved goals ────────────────────────────────────────────────── */}
      {achievedGoals.length > 0 && (
        <section aria-labelledby="achieved-goals-heading" className="mb-8">
          <h2
            id="achieved-goals-heading"
            className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground"
          >
            Postignuti
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {achievedGoals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onEdit={(id) => {
                  setEditingId(id);
                }}
                onAddContribution={(id) => {
                  setContributingId(id);
                }}
                onDelete={(id) => {
                  setDeletingId(id);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Archived / inactive goals ─────────────────────────────────────── */}
      {archivedGoals.length > 0 && (
        <section aria-labelledby="archived-goals-heading">
          <h2
            id="archived-goals-heading"
            className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground"
          >
            Arhivirani
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {archivedGoals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onEdit={(id) => {
                  setEditingId(id);
                }}
                onAddContribution={(id) => {
                  setContributingId(id);
                }}
                onDelete={(id) => {
                  setDeletingId(id);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}

      <AddGoalDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        accounts={accounts}
        baseCurrency={baseCurrency}
      />

      {editingGoal && (
        <EditGoalDialog
          open={editingId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingId(null);
          }}
          goal={
            {
              id: editingGoal.id,
              name: editingGoal.name,
              targetAmountCents: editingGoal.targetAmountCents.toString(),
              currency: editingGoal.currency,
              targetDate: editingGoal.targetDate,
              accountId: editingGoal.accountId,
              icon: editingGoal.icon,
              color: editingGoal.color,
            } satisfies EditableGoal
          }
          accounts={accounts}
        />
      )}

      {contributingGoal && (
        <AddContributionDialog
          open={contributingId !== null}
          onOpenChange={(open) => {
            if (!open) setContributingId(null);
          }}
          goalId={contributingGoal.id}
          goalName={contributingGoal.name}
          currency={contributingGoal.currency}
        />
      )}

      <ConfirmDeleteDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
        title="Obrisati cilj?"
        description="Ova akcija je nepovratna. Cilj i sva uplata evidencija biće obrisani."
        onConfirm={async () => {
          if (deletingId) await handleDeleteConfirmed(deletingId);
        }}
      />
    </>
  );
}
