import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MoneyInput } from './money-input';

function CentsField({
  start = 0n,
  allowNegative = false,
  onCurrencyChange,
  max,
}: {
  start?: bigint;
  allowNegative?: boolean;
  onCurrencyChange?: (c: string) => void;
  max?: bigint;
}) {
  const [v, setV] = useState(start);
  return (
    <div>
      <MoneyInput
        id="amount"
        value={v}
        onChange={setV}
        currency="BAM"
        onCurrencyChange={onCurrencyChange}
        allowNegative={allowNegative}
        max={max}
        locale="bs-BA"
      />
      <span data-testid="cents">{v.toString()}</span>
    </div>
  );
}

describe('MoneyInput', () => {
  it('commits parsed cents on input and shows formatted string on blur', async () => {
    const user = userEvent.setup();
    render(<CentsField />);
    const input = screen.getByRole('textbox', { name: 'Iznos' });
    await user.clear(input);
    await user.type(input, '12,50');
    expect(screen.getByTestId('cents').textContent).toBe('1250');
    await user.tab();
    expect(input).toHaveValue('12,50');
  });

  it('formats integer as thousands and decimals on blur', async () => {
    const user = userEvent.setup();
    render(<CentsField />);
    const input = screen.getByRole('textbox', { name: 'Iznos' });
    await user.clear(input);
    await user.type(input, '1234');
    await user.tab();
    expect(input).toHaveValue('1.234,00');
    expect(screen.getByTestId('cents').textContent).toBe('123400');
  });

  it('allows negative when allowNegative is true', async () => {
    const user = userEvent.setup();
    render(<CentsField allowNegative />);
    const input = screen.getByRole('textbox', { name: 'Iznos' });
    await user.clear(input);
    await user.type(input, '-12,50');
    expect(screen.getByTestId('cents').textContent).toBe('-1250');
  });

  it('does not update cents for invalid text', async () => {
    const user = userEvent.setup();
    render(<CentsField start={100n} />);
    const input = screen.getByRole('textbox', { name: 'Iznos' });
    await user.clear(input);
    await user.type(input, 'abc');
    expect(screen.getByTestId('cents').textContent).toBe('100');
  });

  it('does not change value when only currency changes', async () => {
    const user = userEvent.setup();
    const onCur = vi.fn();
    const onCh = vi.fn();
    function C() {
      const [v, setV] = useState(1250n);
      return (
        <div>
          <MoneyInput
            id="a"
            value={v}
            onChange={(c) => {
              onCh(c);
              setV(c);
            }}
            currency="BAM"
            onCurrencyChange={onCur}
            locale="bs-BA"
          />
        </div>
      );
    }
    render(<C />);
    onCh.mockClear();
    await user.click(screen.getByLabelText('Valuta'));
    const eur = await screen.findByRole('option', { name: 'EUR' });
    await user.click(eur);
    expect(onCur).toHaveBeenCalledWith('EUR');
    expect(onCh).not.toHaveBeenCalled();
  });
});
