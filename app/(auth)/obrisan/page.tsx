import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Nalog označen za brisanje — Konto',
};

export default function ObrisanPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Brisanje je u toku</CardTitle>
        <CardDescription>Tvoj nalog je privremeno blokiran.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Tvoj nalog je označen za brisanje. Automatski će biti trajno obrisan za 30 dana.
        </p>
        <p>Provjeri inbox za link za otkazivanje ako si se predomislio.</p>
      </CardContent>
    </Card>
  );
}
