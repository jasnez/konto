import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionRow } from './transaction-row';
import type { TransactionListItem } from '@/app/(app)/transakcije/types';

function makeTx(overrides?: Partial<TransactionListItem>): TransactionListItem {
  return {
    id: 'tx-1',
    transaction_date: '2026-04-15',
    original_amount_cents: -1500,
    original_currency: 'BAM',
    merchant_raw: 'Konzum',
    description: null,
    notes: null,
    is_transfer: false,
    fx_stale: false,
    transfer_pair_id: null,
    transfer_counterparty_account_name: null,
    account: { id: 'acc-1', name: 'Tekući', currency: 'BAM' },
    category: { id: 'cat-1', name: 'Hrana', icon: '🍔', kind: 'expense' },
    merchant: null,
    ...overrides,
  };
}

interface RenderProps {
  tx?: TransactionListItem;
  index?: number;
  selected?: boolean;
  selectionMode?: boolean;
  onOpen?: (txId: string) => void;
  onToggleSelection?: (
    index: number,
    meta: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => void;
  onLongPressSelect?: (index: number) => void;
  onRequestDelete?: (tx: TransactionListItem) => void;
}

function renderRow({
  tx = makeTx(),
  index = 0,
  selected = false,
  selectionMode = false,
  onOpen = vi.fn<(txId: string) => void>(),
  onToggleSelection = vi.fn<
    (index: number, meta: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void
  >(),
  onLongPressSelect = vi.fn<(index: number) => void>(),
  onRequestDelete = vi.fn<(tx: TransactionListItem) => void>(),
}: RenderProps = {}) {
  const result = render(
    <ul>
      <TransactionRow
        tx={tx}
        index={index}
        selected={selected}
        selectionMode={selectionMode}
        onOpen={onOpen}
        onToggleSelection={onToggleSelection}
        onLongPressSelect={onLongPressSelect}
        onRequestDelete={onRequestDelete}
      />
    </ul>,
  );
  return { ...result, onOpen, onToggleSelection, onLongPressSelect, onRequestDelete };
}

describe('TransactionRow — click', () => {
  it('fires onOpen with tx id when not in selection mode', async () => {
    const user = userEvent.setup();
    const { onOpen, onToggleSelection } = renderRow();
    // The outer div has role="button" and aria-label="Otvori transakciju: ..."
    await user.click(screen.getByRole('button', { name: /Otvori transakciju: Konzum/ }));
    expect(onOpen).toHaveBeenCalledWith('tx-1');
    expect(onToggleSelection).not.toHaveBeenCalled();
  });

  it('fires onToggleSelection (not onOpen) when in selection mode', async () => {
    const user = userEvent.setup();
    const { onOpen, onToggleSelection } = renderRow({ selectionMode: true, index: 3 });
    await user.click(screen.getByRole('button', { name: /Otvori transakciju: Konzum/ }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(onToggleSelection).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ shiftKey: false, metaKey: false, ctrlKey: false }),
    );
  });
});

describe('TransactionRow — keyboard', () => {
  it('Enter key opens the transaction (mirrors click)', async () => {
    const user = userEvent.setup();
    const { onOpen } = renderRow();
    const row = screen.getByRole('button', { name: /Otvori transakciju: Konzum/ });
    row.focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('tx-1');
  });

  it('Space key opens the transaction (mirrors click)', async () => {
    const user = userEvent.setup();
    const { onOpen } = renderRow();
    const row = screen.getByRole('button', { name: /Otvori transakciju: Konzum/ });
    row.focus();
    await user.keyboard(' ');
    expect(onOpen).toHaveBeenCalledWith('tx-1');
  });

  it('Enter in selection mode toggles selection', async () => {
    const user = userEvent.setup();
    const { onToggleSelection, onOpen } = renderRow({ selectionMode: true, index: 5 });
    const row = screen.getByRole('button', { name: /Otvori transakciju: Konzum/ });
    row.focus();
    await user.keyboard('{Enter}');
    expect(onOpen).not.toHaveBeenCalled();
    expect(onToggleSelection).toHaveBeenCalledWith(5, expect.objectContaining({ shiftKey: false }));
  });

  it('Escape key does nothing (does not preventDefault unrelated keys)', async () => {
    const user = userEvent.setup();
    const { onOpen, onToggleSelection } = renderRow();
    const row = screen.getByRole('button', { name: /Otvori transakciju: Konzum/ });
    row.focus();
    await user.keyboard('{Escape}');
    expect(onOpen).not.toHaveBeenCalled();
    expect(onToggleSelection).not.toHaveBeenCalled();
  });
});

describe('TransactionRow — nested action buttons (stopPropagation)', () => {
  it('inner edit button click fires onOpen but does NOT also fire from row container', async () => {
    const user = userEvent.setup();
    const { onOpen } = renderRow();
    // Hover-revealed edit button (md+ flex variant). There are TWO edit buttons:
    // (1) swipe-revealed (md:hidden), (2) hover-revealed (md:flex). Both have same aria-label.
    const editButtons = screen.getAllByRole('button', { name: 'Uredi transakciju' });
    expect(editButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(editButtons[0]);
    // onOpen called exactly once (from inner button, not bubbled to outer div)
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('tx-1');
  });

  it('inner delete button fires onRequestDelete only (not onOpen)', async () => {
    const user = userEvent.setup();
    const { onOpen, onRequestDelete } = renderRow();
    const deleteButtons = screen.getAllByRole('button', { name: 'Obriši transakciju' });
    await user.click(deleteButtons[0]);
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(onRequestDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1' }));
    // Critical: outer onOpen should NOT fire when inner stopPropagation works
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('TransactionRow — accessibility', () => {
  it('row container has role="button" and tabIndex=0 for keyboard reachability', () => {
    renderRow();
    const row = screen.getByRole('button', { name: /Otvori transakciju: Konzum/ });
    expect(row).toHaveAttribute('tabindex', '0');
  });

  it('aria-label includes the resolved merchant label (uses merchant_raw fallback)', () => {
    renderRow({ tx: makeTx({ merchant_raw: 'Bingo' }) });
    expect(screen.getByRole('button', { name: 'Otvori transakciju: Bingo' })).toBeInTheDocument();
  });

  it('renders focus-visible ring classes for keyboard focus indicator', () => {
    renderRow();
    const row = screen.getByRole('button', { name: /Otvori transakciju/ });
    expect(row.className).toContain('focus-visible:ring-2');
    expect(row.className).toContain('focus-visible:ring-ring');
  });
});
