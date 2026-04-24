import { Money } from '@/components/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
        <Money
          cents={amountCents}
          currency={currency}
          tone={tone}
          className="block text-2xl font-semibold tracking-tight"
        />
      </CardContent>
    </Card>
  );
}
