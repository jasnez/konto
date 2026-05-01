'use client';

import Link from 'next/link';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { MoreHorizontal } from 'lucide-react';
import type { Account } from '@/lib/supabase/types';
import { formatMinorUnits } from '@/lib/format/amount';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AccountCardDelete } from '@/components/accounts/account-card-delete';
import { cn } from '@/lib/utils';
import type { AccountLastTransaction } from '@/app/(app)/racuni/types';

interface AccountCardProps {
  account: Account;
  selected?: boolean;
  onToggleSelection?: (accountId: string) => void;
  /** Most recent transaction for this account, when present, surfaced as
   * a "Zadnja: <merchant> · prije 2h" subtitle line below the balance. */
  lastTransaction?: AccountLastTransaction;
}

/** Format an ISO transaction_date as a Bosnian relative-time string.
 * `transaction_date` is a date (no time component); we treat midnight UTC
 * of that day as the reference, which is precise enough for the "prije
 * X dana" / "prije X mjeseci" granularity we surface here. Returns "danas"
 * for today's date. */
function formatRelativeTransactionDate(iso: string): string {
  try {
    const date = parseISO(iso);
    if (Number.isNaN(date.getTime())) return '';
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 24 * 60 * 60 * 1000 && diffMs > -24 * 60 * 60 * 1000) {
      return 'danas';
    }
    return `prije ${formatDistanceToNowStrict(date, { locale: bs })}`;
  } catch {
    return '';
  }
}

export function AccountCard({
  account,
  selected = false,
  onToggleSelection,
  lastTransaction,
}: AccountCardProps) {
  const bal = account.current_balance_cents;
  const isDebtAccount = account.type === 'credit_card' || account.type === 'loan';
  const isDebtBalanceNegative = isDebtAccount && bal < 0;
  const selectionEnabled = typeof onToggleSelection === 'function';

  return (
    <Card
      className={cn(
        'relative overflow-hidden border transition-all duration-fast ease-out',
        // Subtle hover lift on desktop only — mobile cards are usually
        // tapped, not hovered, and the lift competes with swipe affordance.
        'hover:bg-accent/30 md:hover:-translate-y-0.5 md:hover:shadow-md',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      {/* Color tag rendered as a 4px left stripe instead of a full 2px
       * border (audit R3). The full-border treatment read as
       * "selected/highlighted" and competed visually with the actual
       * `selected` ring; the stripe is a subtle accent that scales when
       * the user has many color-tagged accounts. */}
      {account.color ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: account.color }}
        />
      ) : null}

      {selectionEnabled ? (
        <Checkbox
          checked={selected}
          onCheckedChange={() => {
            onToggleSelection(account.id);
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          aria-label={selected ? `Odznači ${account.name}` : `Odaberi ${account.name}`}
          className="absolute left-3 top-3 z-20 h-5 w-5"
        />
      ) : null}

      <Link
        href={`/racuni/${account.id}`}
        className={cn(
          'block min-h-[44px] touch-manipulation pr-14 pt-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selectionEnabled ? 'pl-12' : 'pl-4',
        )}
      >
        <CardContent className="p-0 pb-4">
          <div className="flex items-start gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl"
              aria-hidden
            >
              {account.icon ?? '🏦'}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-base font-semibold leading-tight">{account.name}</p>
              {account.institution ? (
                <p className="truncate text-sm text-muted-foreground">{account.institution}</p>
              ) : null}
              <p
                className={cn(
                  'text-2xl font-semibold tabular-nums tracking-tight',
                  isDebtBalanceNegative && 'text-destructive',
                )}
              >
                {formatMinorUnits(bal, account.currency)}
              </p>
              {lastTransaction ? (
                <p
                  className="truncate text-xs text-muted-foreground"
                  data-testid="account-card-last-tx"
                >
                  Zadnja: {lastTransaction.merchantLabel} ·{' '}
                  {formatRelativeTransactionDate(lastTransaction.transactionDate)}
                </p>
              ) : null}
              {!account.include_in_net_worth ? (
                <p className="text-xs text-muted-foreground">Nije u zbrojku na početnoj</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Link>

      <div className="absolute right-1 top-1 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 min-w-[44px] shrink-0"
              aria-label="Meni za račun"
              onClick={(e) => {
                e.preventDefault();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href={`/racuni/${account.id}/uredi`} className="cursor-pointer">
                Uredi
              </Link>
            </DropdownMenuItem>
            <AccountCardDelete accountId={account.id} accountName={account.name} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
