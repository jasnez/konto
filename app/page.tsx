'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Konto</CardTitle>
          <CardDescription>Test shadcn/ui, Sonner toasta i tema.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            onClick={() =>
              toast.success('Radi!', {
                description: 'Sonner toast je uspješno prikazan.',
              })
            }
          >
            Prikaži toast
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.error('Greška', {
                description: 'Nešto nije u redu. Pokušaj ponovo?',
              })
            }
          >
            Prikaži error toast
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
