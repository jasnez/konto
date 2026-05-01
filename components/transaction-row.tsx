'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FolderInput, Pencil, Trash2 } from 'lucide-react';
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
  onRequestDelete: (tx: TransactionListItem) => void;
  /** Optional — when omitted (or for transfers), the Kategoriziraj button is hidden. */
  onRequestCategorize?: (tx: TransactionListItem) => void;
}

export function TransactionRow({
  tx,
  index,
  selected,
  selectionMode,
  onOpen,
  onToggleSelection,
  onLongPressSelect,
  onRequestDelete,
  onRequestCategorize,
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

  // Categorize is only meaningful for non-transfer rows. Transfers get the
  // 2-button drawer (edit + delete) and the original swipe geometry; expense /
  // income rows get a 3-button drawer with a wider reveal threshold so all
  // three buttons fit comfortably on small phones.
  const categorizeHandler = tx.is_transfer ? null : (onRequestCategorize ?? null);
  const drawerWidthClass = categorizeHandler ? 'w-40' : 'w-28';
  const swipeSnapDistance = categorizeHandler ? -144 : -96;
  const swipeTriggerThreshold = categorizeHandler ? -72 : -48;
  const swipeMaxDistance = categorizeHandler ? -160 : -112;

  return (
    <li className="relative list-none overflow-hidden rounded-xl bg-card">
      <div
        className={cn(
          'absolute inset-y-0 right-0 z-20 flex items-center justify-end gap-1 pr-2 transition-opacity duration-150 md:hidden',
          drawerWidthClass,
          // Kad swipe nije aktivan, action drawer mora biti i nevidljiv
          // (`opacity-0`) i bez pointer eventa — inače gumbi prekrivaju
          // iznos s desne strane retka i čine ga nečitljivim (audit B6).
          swipeOffset < -20 ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {categorizeHandler ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-9 w-9"
            aria-label="Promijeni kategoriju"
            onClick={() => {
              categorizeHandler(tx);
            }}
          >
            <FolderInput className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
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
            onRequestDelete(tx);
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={`Otvori transakciju: ${merchantLabel}`}
        className={cn(
          'group relative z-10 flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hover:bg-muted/40',
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
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
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
            setSwipeOffset(Math.max(delta, swipeMaxDistance));
          }
        }}
        onTouchEnd={() => {
          touchStartX.current = null;
          setSwipeOffset((current) => (current < swipeTriggerThreshold ? swipeSnapDistance : 0));
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
              onRequestDelete(tx);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </li>
  );
}
