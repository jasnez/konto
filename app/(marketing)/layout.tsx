import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Konto
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/prijava">Prijavi se</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Konto. Novac, lokalno i privatno.</p>
          <nav className="flex gap-6">
            <Link
              href="/privatnost"
              className="hover:text-foreground hover:underline hover:underline-offset-4"
            >
              Privatnost
            </Link>
            <Link
              href="/uslovi"
              className="hover:text-foreground hover:underline hover:underline-offset-4"
            >
              Uslovi
            </Link>
            <Link
              href="/kontakt"
              className="hover:text-foreground hover:underline hover:underline-offset-4"
            >
              Kontakt
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
