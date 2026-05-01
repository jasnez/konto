import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AppNotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="space-y-2">
        <p className="text-sm font-mono text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Stranica nije pronađena</h1>
        <p className="text-muted-foreground">
          Vrati se na{' '}
          <Link href="/pocetna" className="text-primary underline-offset-4 hover:underline">
            početnu
          </Link>
          .
        </p>
      </div>
      <Button asChild>
        <Link href="/pocetna">Na početnu</Link>
      </Button>
    </main>
  );
}
