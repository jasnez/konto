'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function ExportDownloadButton() {
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    try {
      const res = await fetch('/api/export/data', { method: 'GET', credentials: 'include' });
      if (res.status === 401) {
        toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
        return;
      }
      if (res.status === 429) {
        toast.error('Export je već preuzet nedavno.', {
          description: 'Možeš ponovo za najviše jedan sat.',
        });
        return;
      }
      if (!res.ok) {
        toast.error('Export nije uspio.', { description: 'Pokušaj ponovo za trenutak.' });
        return;
      }

      let blob: Blob;
      try {
        blob = await res.blob();
      } catch {
        toast.error('Export se prekinuo.', { description: 'Pokušaj ponovo za trenutak.' });
        return;
      }
      const header = res.headers.get('Content-Disposition');
      const match = header?.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `konto-export-${new Date().toISOString().split('T')[0]}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" onClick={() => void download()} disabled={pending}>
      {pending ? 'Priprema…' : 'Preuzmi export'}
    </Button>
  );
}
