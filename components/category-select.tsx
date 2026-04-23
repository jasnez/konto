'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type TransactionKind = 'expense' | 'income' | 'transfer';

export interface CategoryOption {
  id: string;
  name: string;
  icon: string | null;
  kind: 'expense' | 'income' | 'transfer' | 'saving' | 'investment';
}

interface CategorySelectProps {
  id?: string;
  value: string | null;
  onValueChange: (value: string | null) => void;
  categories: CategoryOption[];
  kind: TransactionKind;
  disabled?: boolean;
}

function mapKindToCategoryKinds(kind: TransactionKind): CategoryOption['kind'][] {
  if (kind === 'income') return ['income'];
  if (kind === 'transfer') return ['transfer'];
  return ['expense'];
}

export function CategorySelect({
  id,
  value,
  onValueChange,
  categories,
  kind,
  disabled = false,
}: CategorySelectProps) {
  const allowedKinds = mapKindToCategoryKinds(kind);
  const filtered = categories.filter((category) => allowedKinds.includes(category.kind));
  const current = filtered.find((category) => category.id === value);

  return (
    <Select
      value={value ?? '__none__'}
      onValueChange={(next) => {
        onValueChange(next === '__none__' ? null : next);
      }}
      disabled={disabled || filtered.length === 0}
    >
      <SelectTrigger id={id} className="h-11 min-h-[44px] w-full">
        <SelectValue
          placeholder={filtered.length === 0 ? 'Nema kategorija' : 'Odaberi kategoriju'}
          aria-label={current ? current.name : undefined}
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Bez kategorije</SelectItem>
        {filtered.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            <span className="mr-2" aria-hidden>
              {category.icon ?? '📦'}
            </span>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
