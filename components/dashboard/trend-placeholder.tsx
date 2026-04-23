import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function TrendPlaceholder() {
  return (
    <section>
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg">Trend</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Graf dolazi u Fazi 3. Ovdje ćeš vidjeti trendove potrošnje i prihoda kroz vrijeme.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
