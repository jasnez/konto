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
      <SelectTrigger id={id} className="h-11 min-h-[44px] w-full">
        <SelectValue
          placeholder={accounts.length === 0 ? 'Nema računa' : 'Odaberi račun'}
          aria-label={current ? `${current.name} (${current.currency})` : undefined}
        />
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
