'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

export function DeletionCanceledToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) {
      return;
    }
    if (searchParams.get('deletionCanceled') !== '1') {
      return;
    }
    shown.current = true;
    toast.success('Brisanje je otkazano.');
    router.replace(pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  return null;
}
