import type { Metadata } from 'next';
import { PieChart } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Uvidi — Konto',
};

export default function UvidiPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6">
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <PieChart className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <CardTitle>Uvidi dolaze u Fazi 3</CardTitle>
          <CardDescription>
            Trendovi, kategorizacija potrošnje, pretplate i forecasting — sve iz tvojih transakcija.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          Čim imaš prve transakcije u sistemu, tu ćeš vidjeti obrasce.
        </CardContent>
      </Card>
    </div>
  );
}
