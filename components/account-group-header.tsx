import { Money } from '@/components/money';
import { cn } from '@/lib/utils';
import type { AccountGroup } from '@/app/(app)/racuni/types';

interface AccountGroupHeaderProps {
  group: AccountGroup;
}

export function AccountGroupHeader({ group }: AccountGroupHeaderProps) {
  const isNegative = group.subtotalBaseCents < 0n;
  return (
    <div className="flex items-center justify-between border-b border-border/50 px-1 pb-2">
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden>
          {group.emoji}
        </span>
        <h3 className="text-sm font-semibold tracking-tight">{group.label}</h3>
        <span className="text-xs text-muted-foreground">({group.accounts.length})</span>
      </div>
      <Money
        cents={group.subtotalBaseCents}
        currency={group.baseCurrency}
        tone="default"
        className={cn('text-sm font-semibold', isNegative && 'text-destructive')}
      />
    </div>
  );
}
