'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { Money, type MoneyTone } from '@/components/money';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { getTransactionPrimaryLabel } from '@/lib/format/transaction-primary-label';
import { cn } from '@/lib/utils';
import type { TransactionListItem } from '@/app/(app)/transakcije/types';

interface TransactionRowProps {
  tx: TransactionListItem;
  index: number;
  selected: boolean;
  selectionMode: boolean;
  onOpen: (txId: string) => void;
  onToggleSelection: (
    index: number,
    meta: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => void;
  onLongPressSelect: (index: number) => void;
  onDelete: (txId: string) => void;
}

export function TransactionRow({
  tx,
  index,
  selected,
  selectionMode,
  onOpen,
  onToggleSelection,
  onLongPressSelect,
  onDelete,
}: TransactionRowProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (longPressTimer.current !== null) {
        window.clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  const merchantLabel = getTransactionPrimaryLabel({
    merchant_display_name: tx.merchant?.display_name,
    merchant_raw: tx.merchant_raw,
    description: tx.description,
    is_transfer: tx.is_transfer,
    original_amount_cents: tx.original_amount_cents,
    account_name: tx.account?.name ?? null,
    transfer_counterparty_account_name: tx.transfer_counterparty_account_name,
  });
  const categoryLabel = tx.category?.name ?? (tx.is_transfer ? 'Transfer' : 'Nerazvrstano');
  const accountLabel = tx.account?.name ?? 'Račun';
  const categoryIcon = tx.category ? tx.category.icon : null;
  const amount = BigInt(tx.original_amount_cents);
  const amountTone: MoneyTone = tx.is_transfer ? 'transfer' : 'auto';

  function clearLongPressTimer() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <li className="relative list-none overflow-hidden rounded-xl border bg-card">
      <div
        className={cn(
          'absolute inset-y-0 right-0 z-20 flex w-28 items-center justify-end gap-1 pr-2 md:hidden',
          // Kad nije otkriveno swipom, gumbi su ispod retka; kad jeste, moraju primiti klik.
          swipeOffset < -20 ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      >
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-9 w-9"
          aria-label="Uredi transakciju"
          onClick={() => {
            onOpen(tx.id);
          }}
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="h-9 w-9"
          aria-label="Obriši transakciju"
          onClick={() => {
            onDelete(tx.id);
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <button
        type="button"
        className={cn(
          'group relative z-10 flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-transform md:hover:bg-muted/40',
          selected && 'bg-accent',
        )}
        style={{ transform: `translateX(${String(swipeOffset)}px)` }}
        onClick={(event) => {
          if (selectionMode) {
            onToggleSelection(index, {
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
              ctrlKey: event.ctrlKey,
            });
            return;
          }
          onOpen(tx.id);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== 'touch') return;
          clearLongPressTimer();
          longPressTimer.current = window.setTimeout(() => {
            onLongPressSelect(index);
          }, 420);
        }}
        onPointerUp={() => {
          clearLongPressTimer();
        }}
        onPointerLeave={() => {
          clearLongPressTimer();
        }}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0].clientX;
        }}
        onTouchMove={(event) => {
          const startX = touchStartX.current;
          if (startX === null) return;
          const currentX = event.touches[0].clientX;
          const delta = currentX - startX;
          if (delta < 0) {
            setSwipeOffset(Math.max(delta, -112));
          }
        }}
        onTouchEnd={() => {
          touchStartX.current = null;
          setSwipeOffset((current) => (current < -48 ? -96 : 0));
        }}
      >
        {selectionMode ? (
          <Checkbox
            checked={selected}
            onCheckedChange={() => {
              onToggleSelection(index, { shiftKey: false, metaKey: false, ctrlKey: false });
            }}
            aria-label={`Odaberi transakciju ${merchantLabel}`}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-xl leading-none" aria-hidden>
            {categoryIcon ?? (tx.is_transfer ? '🔁' : '🧾')}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{merchantLabel}</p>
            <p className="truncate text-xs text-muted-foreground">
              {categoryLabel} · {accountLabel}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pl-2 text-right">
          {tx.fx_stale ? (
            <span
              className="inline-flex items-center text-amber-600 dark:text-amber-400"
              title="Tečaj za ovu transakciju je zastario — preračun u osnovnu valutu možda nije tačan."
              aria-label="Tečaj je zastario"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            </span>
          ) : null}
          <Money
            cents={amount}
            currency={tx.original_currency}
            tone={amountTone}
            className="font-medium"
          />
        </div>

        <div className="ml-2 hidden shrink-0 items-center gap-1 opacity-0 transition-opacity md:flex md:group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Uredi transakciju"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(tx.id);
            }}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive hover:text-destructive"
            aria-label="Obriši transakciju"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(tx.id);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </button>
    </li>
  );
}
