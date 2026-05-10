import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickAddTransaction } from './quick-add-transaction';
import { createMerchant, searchMerchants } from '@/app/(app)/prodavaci/actions';
import { createTransaction } from '@/app/(app)/transakcije/actions';
import { toast } from 'sonner';

vi.mock('@/app/(app)/transakcije/actions', () => ({
  createTransaction: vi.fn(),
}));

vi.mock('@/app/(app)/prodavaci/actions', () => ({
  createMerchant: vi.fn(),
  searchMerchants: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createTransactionMock = vi.mocked(createTransaction);
const createMerchantMock = vi.mocked(createMerchant);
const searchMerchantsMock = vi.mocked(searchMerchants);
const toastSuccessMock = vi.mocked(toast.success);
const toastErrorMock = vi.mocked(toast.error);

const accounts = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Tekući', currency: 'BAM' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'EUR račun', currency: 'EUR' },
];

const categories = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Namirnice',
    icon: '🛒',
    kind: 'expense' as const,
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Plata',
    icon: '💰',
    kind: 'income' as const,
  },
];

interface ToastActionLike {
  label?: string;
  onClick?: () => void;
}

function mockDesktopMediaQuery() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '(max-width: 767px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('QuickAddTransaction', () => {
  beforeEach(() => {
    mockDesktopMediaQuery();
    window.localStorage.clear();
    createTransactionMock.mockReset();
    createMerchantMock.mockReset();
    searchMerchantsMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    searchMerchantsMock.mockResolvedValue({ success: true, data: [] });
    createMerchantMock.mockResolvedValue({ success: true, data: { id: 'm1' } });
  });

  it('focuses amount input on open and moves focus to merchant on Enter', async () => {
    const user = userEvent.setup();
    render(
      <QuickAddTransaction
        open
        onOpenChange={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );

    const amountInput = await screen.findByRole('textbox', { name: 'Iznos' });
    await waitFor(() => {
      expect(amountInput).toHaveFocus();
    });

    await user.type(amountInput, '{Enter}');
    const merchantInput = screen.getByPlaceholderText('npr. Konzum');
    expect(merchantInput).toHaveFocus();
  });

  it('runs merchant autocomplete search as user types', async () => {
    const user = userEvent.setup();
    searchMerchantsMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'm1',
          canonical_name: 'konzum',
          display_name: 'Konzum',
          default_category_id: null,
          icon: null,
          color: null,
          transaction_count: 10,
          similarity_score: 0.9,
        },
      ],
    });

    render(
      <QuickAddTransaction
        open
        onOpenChange={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );

    const merchantInput = screen.getByPlaceholderText('npr. Konzum');
    await user.type(merchantInput, 'Konz');

    await waitFor(() => {
      expect(searchMerchantsMock).toHaveBeenCalled();
    });
    expect(searchMerchantsMock).toHaveBeenLastCalledWith('Konz', 8);
  });

  it('submits optimistically and shows retry action on server error', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    createTransactionMock.mockResolvedValue({ success: false, error: 'DATABASE_ERROR' });

    render(
      <QuickAddTransaction
        open
        onOpenChange={onOpenChange}
        accounts={accounts}
        categories={categories}
      />,
    );

    const amountInput = await screen.findByRole('textbox', { name: 'Iznos' });
    await user.clear(amountInput);
    await user.type(amountInput, '12,50');
    await user.click(screen.getByRole('button', { name: 'Spasi' }));

    await waitFor(() => {
      expect(createTransactionMock).toHaveBeenCalledTimes(1);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastSuccessMock).toHaveBeenCalledWith('Transakcija je dodata.');
    expect(toastErrorMock).toHaveBeenCalledTimes(1);

    const toastPayload = toastErrorMock.mock.calls[0]?.[1] as
      | { action?: ToastActionLike }
      | undefined;
    expect(toastPayload?.action?.label).toBe('Pokušaj ponovo');
    toastPayload?.action?.onClick?.();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('resolves merchant_id and passes it to createTransaction on submit', async () => {
    const user = userEvent.setup();
    createTransactionMock.mockResolvedValue({ success: true, data: { id: 'tx1' } });
    createMerchantMock.mockResolvedValue({ success: true, data: { id: 'merch-uuid-1' } });

    render(
      <QuickAddTransaction
        open
        onOpenChange={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );

    const amountInput = await screen.findByRole('textbox', { name: 'Iznos' });
    await user.clear(amountInput);
    await user.type(amountInput, '50,00');

    const merchantInput = screen.getByPlaceholderText('npr. Konzum');
    await user.type(merchantInput, 'Konzum');

    await user.click(screen.getByRole('button', { name: 'Spasi' }));

    await waitFor(() => {
      expect(createTransactionMock).toHaveBeenCalledTimes(1);
    });

    const txCall = createTransactionMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(txCall).toMatchObject({ merchant_raw: 'Konzum', merchant_id: 'merch-uuid-1' });
    expect(createMerchantMock).toHaveBeenCalledWith(
      expect.objectContaining({ canonical_name: 'konzum', display_name: 'Konzum' }),
    );
  });

  it('uses existingId from DUPLICATE_CANONICAL on submit', async () => {
    const user = userEvent.setup();
    createTransactionMock.mockResolvedValue({ success: true, data: { id: 'tx2' } });
    createMerchantMock.mockResolvedValue({
      success: false,
      error: 'DUPLICATE_CANONICAL',
      existingId: 'existing-merch-uuid',
    });

    render(
      <QuickAddTransaction
        open
        onOpenChange={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );

    const amountInput = await screen.findByRole('textbox', { name: 'Iznos' });
    await user.clear(amountInput);
    await user.type(amountInput, '30,00');

    const merchantInput = screen.getByPlaceholderText('npr. Konzum');
    await user.type(merchantInput, 'Bingo');

    await user.click(screen.getByRole('button', { name: 'Spasi' }));

    await waitFor(() => {
      expect(createTransactionMock).toHaveBeenCalledTimes(1);
    });

    const txCall = createTransactionMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(txCall).toMatchObject({
      merchant_raw: 'Bingo',
      merchant_id: 'existing-merch-uuid',
    });
  });

  it('deduplicates concurrent ensureMerchantExists calls for the same canonical', async () => {
    const user = userEvent.setup();
    createTransactionMock.mockResolvedValue({ success: true, data: { id: 'tx3' } });

    let resolveCreateMerchant!: (v: Awaited<ReturnType<typeof createMerchant>>) => void;
    createMerchantMock.mockReturnValue(
      new Promise((res) => {
        resolveCreateMerchant = res;
      }),
    );

    render(
      <QuickAddTransaction
        open
        onOpenChange={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );

    const merchantInput = screen.getByPlaceholderText('npr. Konzum');
    await user.type(merchantInput, 'Lidl');
    // Trigger onBlur to start the pre-warm promise
    await user.tab();

    // Now submit while the merchant call is still in-flight
    const amountInput = screen.getByRole('textbox', { name: 'Iznos' });
    await user.clear(amountInput);
    await user.type(amountInput, '20,00');
    await user.click(screen.getByRole('button', { name: 'Spasi' }));

    // Resolve the pending merchant call
    resolveCreateMerchant({ success: true, data: { id: 'lidl-id' } });

    await waitFor(() => {
      expect(createTransactionMock).toHaveBeenCalledTimes(1);
    });

    // createMerchant must have been called only once despite onBlur + onSubmit both triggering it
    expect(createMerchantMock).toHaveBeenCalledTimes(1);
    const txCall = createTransactionMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(txCall).toMatchObject({ merchant_id: 'lidl-id' });
  });

  it('uses last-used values as defaults on open', async () => {
    window.localStorage.setItem(
      'konto:quick-add:last-used',
      JSON.stringify({
        account_id: accounts[1].id,
        category_id: categories[1].id,
        merchant_raw: 'Kafeterija',
        kind: 'income',
      }),
    );

    render(
      <QuickAddTransaction
        open
        onOpenChange={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );

    const merchantInput = await screen.findByDisplayValue('Kafeterija');
    expect(merchantInput).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prihod' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a Type chip updates aria-pressed across the group', async () => {
    const user = userEvent.setup();
    render(
      <QuickAddTransaction
        open
        onOpenChange={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );

    // Default: expense (Trošak) is active
    expect(screen.getByRole('button', { name: 'Trošak' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Prihod' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Transfer' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // Click Prihod — pressed state migrates
    await user.click(screen.getByRole('button', { name: 'Prihod' }));
    expect(screen.getByRole('button', { name: 'Trošak' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Prihod' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Transfer' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // Click Transfer — pressed state migrates again
    await user.click(screen.getByRole('button', { name: 'Transfer' }));
    expect(screen.getByRole('button', { name: 'Trošak' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Prihod' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Transfer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('Type chips are wrapped in a labeled role="group" for screen readers', () => {
    render(
      <QuickAddTransaction
        open
        onOpenChange={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );
    expect(screen.getByRole('group', { name: 'Tip transakcije' })).toBeInTheDocument();
  });

  it('Type chips have type="button" so clicking does not submit the form', () => {
    render(
      <QuickAddTransaction
        open
        onOpenChange={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );
    // All three Type chips render as <button type="button"> via the Chip primitive default
    expect(screen.getByRole('button', { name: 'Trošak' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Prihod' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Transfer' })).toHaveAttribute('type', 'button');
  });
});
