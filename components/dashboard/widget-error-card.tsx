/**
 * Fallback card rendered by `SectionBoundary` when a dashboard widget
 * fails to load (AV-9). Shaped to match the dashboard skeleton card
 * dimensions so a failing widget doesn't cause layout jank — sibling
 * widgets stay in place.
 */
import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  /** Short Bosnian label of what failed (e.g. "Saldo", "Forecast"). */
  label: string;
}

export function WidgetErrorCard({ label }: Props) {
  return (
    <Card role="alert" aria-live="polite" className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex items-start gap-3 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            <span className="text-muted-foreground">{label}</span> — nije uspjelo učitavanje.
          </p>
          <p className="text-xs text-muted-foreground">
            Osvježi stranicu da pokušaš ponovo. Ako se ponavlja, probaj kasnije.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
