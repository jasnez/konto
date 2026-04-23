import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format/format-money';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  amountCents: bigint;
  currency: string;
  tone?: 'default' | 'income' | 'expense';
}

export function MetricCard({ title, amountCents, currency, tone = 'default' }: MetricCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="space-y-1 p-4">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <p
          className={cn(
            'text-2xl font-semibold tabular-nums tracking-tight',
            tone === 'income' && 'text-green-600 dark:text-green-400',
            tone === 'expense' && 'text-red-600 dark:text-red-400',
          )}
        >
          {formatMoney(amountCents, currency, 'bs-BA')}
        </p>
      </CardContent>
    </Card>
  );
}
