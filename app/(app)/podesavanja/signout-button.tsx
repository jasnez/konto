'use client';

import { useTransition } from 'react';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signOut } from './actions';

/**
 * The sign-out click triggers the Server Action through `startTransition` so
 * the button can show a pending state while the request is in flight. The
 * action itself calls `redirect('/prijava')`, which Next.js surfaces to the
 * client — we never see a return value, so no success/error branch here.
 */
export function SignOutButton() {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant="destructive"
      className="h-11"
      disabled={pending}
      onClick={() => {
        start(async () => {
          await signOut();
        });
      }}
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Odjavljujem…
        </>
      ) : (
        <>
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          Odjavi se
        </>
      )}
    </Button>
  );
}
