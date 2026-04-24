'use client';

import { useTransition } from 'react';
import { Loader2, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { restoreDefaultCategories } from './actions';

export function RestoreDefaultCategoriesButton() {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 min-h-[44px]"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const result = await restoreDefaultCategories();
          if (result.success) {
            toast.success('Standardne kategorije su dodane.', {
              description: 'Već postojeći redovi nisu duplirani.',
            });
            return;
          }
          if (result.error === 'UNAUTHORIZED') {
            toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
            return;
          }
          toast.error('Nije uspjelo.', { description: 'Pokušaj ponovo za par sekundi.' });
        });
      }}
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Dodajem…
        </>
      ) : (
        <>
          <Tags className="mr-2 h-4 w-4" aria-hidden />
          Vrati standardne kategorije
        </>
      )}
    </Button>
  );
}
