'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { RecurringCard } from '@/components/recurring/recurring-card';
import { SuggestedCard } from '@/components/recurring/suggested-card';
import { EditRecurringDialog } from '@/components/recurring/edit-recurring-dialog';
import { PauseRecurringDialog } from '@/components/recurring/pause-recurring-dialog';
import {
  AddRecurringDialog,
  type AccountOption,
  type CategoryOption,
  type MerchantOption,
} from '@/components/recurring/add-recurring-dialog';
import { RecurringEmptyState } from '@/components/recurring/empty-state';
import { MonthlyEquivalentFooter } from '@/components/recurring/monthly-equivalent-footer';
import type { ActiveRecurring } from '@/lib/queries/recurring';
import {
  cancelRecurring,
  confirmRecurring,
  detectAndSuggestRecurring,
  ignoreCandidate,
  type CancelRecurringResult,
  type ConfirmRecurringResult,
  type IgnoreCandidateResult,
  type SuggestedCandidate,
} from './actions';

export interface SerializedActiveRecurring extends Omit<ActiveRecurring, 'averageAmountCents'> {
  averageAmountCents: string;
}

export type { AccountOption, CategoryOption, MerchantOption };

export interface PretplateClientProps {
  initialActive: SerializedActiveRecurring[];
  initialSuggestions: SuggestedCandidate[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  merchants: MerchantOption[];
}

const CANCEL_ERROR: Record<string, string> = {
  NOT_FOUND: 'Pretplata više ne postoji.',
  UNAUTHORIZED: 'Sesija je istekla.',
  DATABASE_ERROR: 'Servis je trenutno spor. Pokušaj za minut.',
};
const CONFIRM_ERROR: Record<string, string> = {
  REFERENCED_NOT_OWNED: 'Kategorija/račun mora biti tvoj.',
  UNAUTHORIZED: 'Sesija je istekla.',
  DATABASE_ERROR: 'Servis je trenutno spor. Pokušaj za minut.',
};
const IGNORE_ERROR: Record<string, string> = {
  UNAUTHORIZED: 'Sesija je istekla.',
  DATABASE_ERROR: 'Servis je trenutno spor. Pokušaj za minut.',
};

export function PretplateClient({
  initialActive,
  initialSuggestions,
  accounts,
  categories,
  merchants,
}: PretplateClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [busyCandidateKey, setBusyCandidateKey] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedCandidate[]>(initialSuggestions);

  const active = useMemo<ActiveRecurring[]>(
    () =>
      initialActive.map((a) => ({
        id: a.id,
        description: a.description,
        period: a.period,
        averageAmountCents: BigInt(a.averageAmountCents),
        currency: a.currency,
        nextExpectedDate: a.nextExpectedDate,
        lastSeenDate: a.lastSeenDate,
        pausedUntil: a.pausedUntil,
        isPaused: a.isPaused,
        detectionConfidence: a.detectionConfidence,
        occurrences: a.occurrences,
        merchantId: a.merchantId,
        categoryId: a.categoryId,
        accountId: a.accountId,
        merchantName: a.merchantName,
        categoryName: a.categoryName,
        accountName: a.accountName,
        createdAt: a.createdAt,
      })),
    [initialActive],
  );

  const editingItem = active.find((a) => a.id === editingId);

  async function handleScan(): Promise<void> {
    setScanBusy(true);
    try {
      const result = await detectAndSuggestRecurring();
      if (result.success) {
        setSuggestions(result.data.candidates);
        toast.success(
          result.data.candidates.length === 0
            ? 'Nema novih predloga.'
            : `Pronađeno ${String(result.data.candidates.length)} ${
                result.data.candidates.length === 1 ? 'predlog' : 'predloga'
              }.`,
        );
      } else {
        toast.error(IGNORE_ERROR[result.error] ?? 'Skeniranje nije uspjelo.');
      }
    } finally {
      setScanBusy(false);
    }
  }

  async function handleConfirmCandidate(c: SuggestedCandidate): Promise<void> {
    setBusyCandidateKey(c.groupKey);
    try {
      const result: ConfirmRecurringResult = await confirmRecurring({
        merchantId: c.merchantId,
        categoryId: c.suggestedCategoryId,
        accountId: null,
        description: c.description,
        period: c.period,
        averageAmountCents: c.averageAmountCents,
        currency: c.currency,
        lastSeen: c.lastSeen,
        nextExpected: c.nextExpected,
        confidence: c.confidence,
        occurrences: c.occurrences,
        transactionIds: c.transactionIds,
      });
      if (result.success) {
        toast.success('Pretplata potvrđena.');
        setSuggestions((prev) => prev.filter((s) => s.groupKey !== c.groupKey));
        router.refresh();
        return;
      }
      if (result.error === 'VALIDATION_ERROR') {
        toast.error('Provjeri unos.');
        return;
      }
      toast.error(CONFIRM_ERROR[result.error] ?? 'Nepoznata greška.');
    } finally {
      setBusyCandidateKey(null);
    }
  }

  async function handleIgnoreCandidate(c: SuggestedCandidate): Promise<void> {
    setBusyCandidateKey(c.groupKey);
    try {
      const result: IgnoreCandidateResult = await ignoreCandidate({ groupKey: c.groupKey });
      if (result.success) {
        toast.success('Predlog je ignorisan.');
        setSuggestions((prev) => prev.filter((s) => s.groupKey !== c.groupKey));
        router.refresh();
        return;
      }
      toast.error(
        result.error === 'VALIDATION_ERROR'
          ? 'Nevažeći zahtjev.'
          : (IGNORE_ERROR[result.error] ?? 'Nepoznata greška.'),
      );
    } finally {
      setBusyCandidateKey(null);
    }
  }

  function handleCancelConfirmed(id: string): Promise<void> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const result: CancelRecurringResult = await cancelRecurring(id);
        if (result.success) {
          toast.success('Pretplata otkazana.');
          setCancellingId(null);
          router.refresh();
        } else if (result.error === 'VALIDATION_ERROR') {
          toast.error('Nevažeći zahtjev.');
        } else {
          toast.error(CANCEL_ERROR[result.error] ?? 'Nepoznata greška.');
        }
        resolve();
      });
    });
  }

  const showEmptyHero = active.length === 0 && suggestions.length === 0;

  return (
    <>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Pretplate</h1>
          <p className="text-sm text-muted-foreground">
            Auto-otkrivene pretplate iz tvoje istorije transakcija.
          </p>
        </div>
        {!showEmptyHero && (
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddOpen(true);
              }}
              size="lg"
              className="self-start sm:self-auto"
            >
              <Plus className="mr-2 h-5 w-5" aria-hidden />
              Dodaj ručno
            </Button>
            <Button
              onClick={() => {
                void handleScan();
              }}
              disabled={scanBusy}
              size="lg"
              className="self-start sm:self-auto"
            >
              <Search className="mr-2 h-5 w-5" aria-hidden />
              {scanBusy ? 'Skeniranje…' : 'Pronađi nove'}
            </Button>
          </div>
        )}
      </header>

      {showEmptyHero ? (
        <RecurringEmptyState
          onScan={() => {
            void handleScan();
          }}
          onAddManual={() => {
            setIsAddOpen(true);
          }}
          busy={scanBusy}
        />
      ) : (
        <div className="space-y-8">
          {/* Aktivne */}
          <section aria-label="Aktivne pretplate" className="space-y-3">
            <h2 className="text-lg font-semibold">
              Aktivne <span className="text-muted-foreground">({String(active.length)})</span>
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Još nema potvrđenih pretplata. Potvrdi neki predlog ispod.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {active.map((a) => (
                  <RecurringCard
                    key={a.id}
                    item={a}
                    onEdit={(id) => {
                      setEditingId(id);
                    }}
                    onPause={(id) => {
                      setPausingId(id);
                    }}
                    onCancel={(id) => {
                      setCancellingId(id);
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Predloženo */}
          <section aria-label="Predložene pretplate" className="space-y-3">
            <h2 className="text-lg font-semibold">
              Predloženo{' '}
              <span className="text-muted-foreground">({String(suggestions.length)})</span>
            </h2>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nema novih predloga. Skeniraj ponovo nakon novih transakcija.
              </p>
            ) : (
              <div className="space-y-3">
                {suggestions.map((c) => (
                  <SuggestedCard
                    key={c.groupKey}
                    candidate={c}
                    onConfirm={(cand) => {
                      void handleConfirmCandidate(cand);
                    }}
                    onIgnore={(cand) => {
                      void handleIgnoreCandidate(cand);
                    }}
                    busy={busyCandidateKey === c.groupKey}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Footer */}
          {active.length > 0 && <MonthlyEquivalentFooter items={active} />}
        </div>
      )}

      {/* Dialogs */}
      {editingItem && (
        <EditRecurringDialog
          open={editingId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingId(null);
          }}
          recurring={{
            id: editingItem.id,
            description: editingItem.description,
            period: editingItem.period,
            averageAmountCents: editingItem.averageAmountCents,
            currency: editingItem.currency,
            nextExpectedDate: editingItem.nextExpectedDate,
            merchantId: editingItem.merchantId,
          }}
          merchants={merchants}
        />
      )}
      {pausingId !== null && (
        <PauseRecurringDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setPausingId(null);
          }}
          recurringId={pausingId}
        />
      )}
      <ConfirmDeleteDialog
        open={cancellingId !== null}
        onOpenChange={(open) => {
          if (!open) setCancellingId(null);
        }}
        title="Otkazati pretplatu?"
        description="Pretplata će biti deaktivirana. Istorija transakcija ostaje netaknuta."
        confirmLabel="Otkaži"
        busyLabel="Otkazujem…"
        onConfirm={async () => {
          if (cancellingId) await handleCancelConfirmed(cancellingId);
        }}
      />
      <AddRecurringDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        accounts={accounts}
        categories={categories}
        merchants={merchants}
      />
    </>
  );
}
