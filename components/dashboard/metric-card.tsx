import { Money } from '@/components/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  amountCents: bigint;
  currency: string;
  tone?: 'default' | 'income' | 'expense';
  className?: string;
}

export function MetricCard({
  title,
  amountCents,
  currency,
  tone = 'default',
  className,
}: MetricCardProps) {
  return (
    <Card className={cn('h-full', className)}>
      <CardHeader className="space-y-1 p-4">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <Money
          cents={amountCents}
          currency={currency}
          tone={tone}
          className="block text-xl font-semibold tracking-tight sm:text-2xl"
        />
      </CardContent>
    </Card>
  );
}
