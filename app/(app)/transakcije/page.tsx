import type { Metadata } from 'next';
import { Receipt } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Transakcije — Konto',
};

export default function TransakcijePage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Receipt className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <CardTitle>Transakcije stižu uskoro</CardTitle>
          <CardDescription>
            Lista, filteri, pretraga i ručni unos stižu u Fazi 1. Za sada ova stranica postoji da bi
            navigacija radila.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          Dodaj transakciju dugmetom „+&rdquo; u sidebar-u ili FAB-om na mobilnom — i to dolazi.
        </CardContent>
      </Card>
    </div>
  );
}
