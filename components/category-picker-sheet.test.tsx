import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryPickerSheet } from './category-picker-sheet';
import type { CategoryOption } from '@/components/category-select';

const CATEGORIES: CategoryOption[] = [
  { id: 'cat-food', name: 'Hrana', icon: '🍔', kind: 'expense' },
  { id: 'cat-transport', name: 'Transport', icon: '🚌', kind: 'expense' },
  { id: 'cat-salary', name: 'Plata', icon: '💰', kind: 'income' },
  { id: 'cat-saving', name: 'Štednja', icon: '💎', kind: 'saving' },
];

interface RenderProps {
  open?: boolean;
  kind?: 'income' | 'expense';
  currentCategoryId?: string | null;
  onSelect?: (id: string | null) => void;
  onOpenChange?: (open: boolean) => void;
  transactionLabel?: string;
}

function renderSheet({
  open = true,
  kind = 'expense',
  currentCategoryId = null,
  onSelect = vi.fn<(id: string | null) => void>(),
  onOpenChange = vi.fn<(open: boolean) => void>(),
  transactionLabel,
}: RenderProps = {}) {
  const result = render(
    <CategoryPickerSheet
      open={open}
      onOpenChange={onOpenChange}
      categories={CATEGORIES}
      kind={kind}
      currentCategoryId={currentCategoryId}
      onSelect={onSelect}
      transactionLabel={transactionLabel}
    />,
  );
  return { ...result, onSelect, onOpenChange };
}

describe('CategoryPickerSheet — filtering by kind', () => {
  it('shows only expense categories when kind=expense', () => {
    renderSheet({ kind: 'expense' });
    expect(screen.getByRole('radio', { name: /Hrana/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Transport/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Plata/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: /Štednja/ })).toBeNull();
  });

  it('shows only income categories when kind=income', () => {
    renderSheet({ kind: 'income' });
    expect(screen.getByRole('radio', { name: /Plata/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Hrana/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: /Transport/ })).toBeNull();
  });

  it('always renders "Bez kategorije" first regardless of kind', () => {
    renderSheet({ kind: 'expense' });
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveTextContent('Bez kategorije');
  });

  it('renders empty-state hint when no categories match the kind', () => {
    render(
      <CategoryPickerSheet
        open
        onOpenChange={vi.fn()}
        categories={[]}
        kind="expense"
        currentCategoryId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/Nema kategorija ovog tipa/)).toBeInTheDocument();
  });
});

describe('CategoryPickerSheet — selection', () => {
  it('fires onSelect with the category id and closes the sheet', async () => {
    const user = userEvent.setup();
    const { onSelect, onOpenChange } = renderSheet({ kind: 'expense' });
    await user.click(screen.getByRole('radio', { name: /Hrana/ }));
    expect(onSelect).toHaveBeenCalledWith('cat-food');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('fires onSelect(null) when "Bez kategorije" is picked', async () => {
    const user = userEvent.setup();
    const { onSelect, onOpenChange } = renderSheet({ kind: 'expense' });
    await user.click(screen.getByRole('radio', { name: /Bez kategorije/ }));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('CategoryPickerSheet — current selection', () => {
  it('marks current category with aria-checked=true and others with false', () => {
    renderSheet({ kind: 'expense', currentCategoryId: 'cat-food' });
    expect(screen.getByRole('radio', { name: /Hrana/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Transport/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: /Bez kategorije/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('marks "Bez kategorije" as current when currentCategoryId is null', () => {
    renderSheet({ kind: 'expense', currentCategoryId: null });
    expect(screen.getByRole('radio', { name: /Bez kategorije/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

describe('CategoryPickerSheet — labelling', () => {
  it('renders the optional transactionLabel as a description', () => {
    renderSheet({ transactionLabel: 'Konzum — 15.00 BAM' });
    expect(screen.getByText('Konzum — 15.00 BAM')).toBeInTheDocument();
  });
});
