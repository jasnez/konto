'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface AccountOption {
  id: string;
  name: string;
  currency: string;
  /** Account type — used to conditionally show installment UI for credit cards. */
  type?: string;
}

interface AccountSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  accounts: AccountOption[];
  disabled?: boolean;
}

export function AccountSelect({
  id,
  value,
  onValueChange,
  accounts,
  disabled = false,
}: AccountSelectProps) {
  const current = accounts.find((account) => account.id === value);

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled || accounts.length === 0}
    >
      <SelectTrigger
        id={id}
        // axe-core flags `role="combobox"` buttons that derive their name from
        // inner SelectValue content as missing accessible name. Explicit
        // aria-label on the trigger satisfies WAI-ARIA's combobox naming rule.
        aria-label={current ? `Račun: ${current.name} (${current.currency})` : 'Račun'}
        className="h-11 w-full"
      >
        <SelectValue placeholder={accounts.length === 0 ? 'Nema računa' : 'Odaberi račun'} />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.name} ({account.currency})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
