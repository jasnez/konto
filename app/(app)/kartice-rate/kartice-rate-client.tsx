'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cancelInstallmentPlan, markOccurrencePaid } from './actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Progress } from '@/components/ui/progress';

export interface OccurrenceRow {
  id: string;
  occurrence_num: number;
  due_date: string;
  amount_cents: number;
  state: 'pending' | 'posted' | 'skipped';
  transaction_id: string | null;
}

export interface PlanRow {
  id: string;
  account_name: string;
  merchant_name: string | null;
  category_name: string | null;
  currency: string;
  total_cents: number;
  installment_count: number;
  installment_cents: number;
  start_date: string;
  day_of_month: number;
  notes: string | null;
  status: 'active' | 'completed' | 'cancelled';
  occurrences: OccurrenceRow[];
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('bs-BA', { style: 'currency', currency }).format(cents / 100);
}

function formatDate(iso: string): string {
  return format(parseISO(iso), 'd. MMM yyyy.', { locale: bs });
}

function PlanCard({ plan, onChanged }: { plan: PlanRow; onChanged: () => void }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const postedCount = plan.occurrences.filter((o) => o.state === 'posted').length;
  const progressPct = Math.round((postedCount / plan.installment_count) * 100);
  const nextPending = plan.occurrences.find((o) => o.state === 'pending');

  async function handleCancel() {
    const result = await cancelInstallmentPlan(plan.id);
    if (result.success) {
      toast.success('Plan je otkazan.');
      onChanged();
    } else {
      toast.error('Greška pri otkazivanju plana.');
    }
  }

  async function handleMarkPaid(occurrenceId: string) {
    const result = await markOccurrencePaid(occurrenceId);
    if (result.success) {
      toast.success('Rata označena kao plaćena.');
      onChanged();
    } else if (result.error === 'ALREADY_POSTED') {
      toast.info('Rata je već plaćena.');
    } else {
      toast.error('Greška pri označavanju rate.');
    }
  }

  const statusBadge =
    plan.status === 'active' ? (
      <Badge variant="default">Aktivan</Badge>
    ) : plan.status === 'completed' ? (
      <Badge variant="secondary">Završen</Badge>
    ) : (
      <Badge variant="destructive">Otkazan</Badge>
    );

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {plan.merchant_name ?? plan.category_name ?? 'Kupovina na rate'}
          </p>
          <p className="text-sm text-muted-foreground">{plan.account_name}</p>
        </div>
        {statusBadge}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">Ukupno</span>
        <span className="font-medium">{formatMoney(plan.total_cents, plan.currency)}</span>
        <span className="text-muted-foreground">Rata</span>
        <span>{formatMoney(plan.installment_cents, plan.currency)}</span>
        <span className="text-muted-foreground">Početak</span>
        <span>{formatDate(plan.start_date)}</span>
        <span className="text-muted-foreground">Dan u mj.</span>
        <span>{plan.day_of_month}.</span>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {postedCount} / {plan.installment_count} rata plaćeno
          </span>
          <span>{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      <ul className="mb-3 space-y-1">
        {plan.occurrences.map((occ) => (
          <li key={occ.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {occ.occurrence_num}. {formatDate(occ.due_date)}
            </span>
            <div className="flex items-center gap-2">
              <span>{formatMoney(occ.amount_cents, plan.currency)}</span>
              {occ.state === 'posted' ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-label="Plaćeno" />
              ) : occ.state === 'skipped' ? (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" aria-label="Preskočeno" />
              ) : (
                <Clock className="h-3.5 w-3.5 text-amber-500" aria-label="Na čekanju" />
              )}
              {occ.state === 'pending' && plan.status === 'active' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    void handleMarkPaid(occ.id);
                  }}
                >
                  Označi
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {plan.status === 'active' ? (
        <div className="flex gap-2">
          {nextPending ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 min-h-[36px] flex-1 text-xs"
              onClick={() => {
                void handleMarkPaid(nextPending.id);
              }}
            >
              Označi sljedeću plaćenom
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 min-h-[36px] px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => {
              setCancelOpen(true);
            }}
          >
            Otkaži
          </Button>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Otkazati plan "${plan.merchant_name ?? plan.category_name ?? 'na rate'}"?`}
        description="Buduće rate neće biti automatski plaćane. Već postavljene transakcije ostaju."
        confirmLabel="Otkaži plan"
        busyLabel="Otkazivanje…"
        onConfirm={handleCancel}
      />
    </div>
  );
}

export function KarticeRateClient({
  plans: initialPlans,
  onRefresh,
}: {
  plans: PlanRow[];
  // Server action from page.tsx — sync but triggers revalidation.
  onRefresh: () => unknown;
}) {
  if (initialPlans.length === 0) {
    return (
      <div className="flex min-h-[35vh] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-8 text-center">
        <p className="text-muted-foreground">
          Nema aktivnih planova na rate. Odaberi kreditnu karticu u brzom unosu i uključi &ldquo;Na
          rate&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {initialPlans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} onChanged={onRefresh} />
      ))}
    </div>
  );
}
