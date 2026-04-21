import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="space-y-2">
        <p className="text-sm font-mono text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Stranica nije pronađena</h1>
        <p className="text-muted-foreground">
          Vrati se na{' '}
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            početnu
          </Link>
          .
        </p>
      </div>
      <Button asChild>
        <Link href="/">Na početnu</Link>
      </Button>
    </main>
  );
}
