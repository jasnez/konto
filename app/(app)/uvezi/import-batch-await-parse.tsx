'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const PARSE_POLL_MS = 3000;
const PARSE_SLOW_AFTER_MS = 90_000;

interface ImportBatchAwaitParseProps {
  batchId: string;
  status: 'uploaded' | 'enqueued' | 'parsing';
}

/**
 * Kicks off POST /parse once for `uploaded`, polls server every 3s while
 * `enqueued`/`parsing`, and surfaces a slow-parse hint after 90s
 * (per F2-E3-T3).
 *
 * `enqueued` is a legacy transitional status retained in the type union for
 * historical rows; new uploads go straight `uploaded → parsing`. Treated
 * identically to `parsing` for polling/UX purposes.
 */
export function ImportBatchAwaitParse({ batchId, status }: ImportBatchAwaitParseProps) {
  const router = useRouter();
  const parseStarted = useRef(false);
  const [slowNotice, setSlowNotice] = useState(false);

  useEffect(() => {
    if (status !== 'uploaded' || parseStarted.current) return;
    parseStarted.current = true;
    void (async () => {
      const res = await fetch(`/api/imports/${batchId}/parse`, { method: 'POST' });
      if (res.status === 401) {
        parseStarted.current = false;
        return;
      }
      if (res.status === 429) {
        parseStarted.current = false;
        toast.error('Previše pokušaja parsiranja. Pokušaj za 10 minuta.');
        return;
      }
      router.refresh();
    })();
  }, [batchId, status, router]);

  const isInFlight = status === 'enqueued' || status === 'parsing';

  useEffect(() => {
    if (!isInFlight) {
      setSlowNotice(false);
      return;
    }
    const slowId = window.setTimeout(() => {
      setSlowNotice(true);
    }, PARSE_SLOW_AFTER_MS);
    return () => {
      window.clearTimeout(slowId);
    };
  }, [isInFlight, batchId]);

  useEffect(() => {
    if (!isInFlight) return;
    const pollId = window.setInterval(() => {
      router.refresh();
    }, PARSE_POLL_MS);
    return () => {
      window.clearInterval(pollId);
    };
  }, [isInFlight, router]);

  // `parsing` shows the actively-running copy; `uploaded`/`enqueued` show the
  // pre-flight copy since the worker hasn't started yet in either case.
  const isParsing = status === 'parsing';

  return (
    <div
      className={cn(
        'mt-8 flex min-h-[14rem] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-12 text-center sm:min-h-[16rem]',
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full bg-primary/10',
          isParsing && 'motion-safe:animate-pulse',
        )}
      >
        <Loader2
          className={cn('h-7 w-7 text-primary', isParsing && 'motion-safe:animate-spin')}
          aria-hidden
        />
      </div>
      <div className="max-w-md space-y-2">
        {isParsing ? (
          <>
            <p className="text-base font-medium text-foreground">
              Parsiram izvod… (to traje 10–30 sekundi)
            </p>
            <p className="text-sm text-muted-foreground">
              Stranica se sama osvježava dok obrada traje.
            </p>
          </>
        ) : (
          <>
            <p className="text-base font-medium text-foreground">Priprema obrade…</p>
            <p className="text-sm text-muted-foreground">Pokrećem čitanje PDF-a.</p>
          </>
        )}
        {slowNotice && isParsing ? (
          <p className="border-t border-border/60 pt-3 text-sm font-medium text-amber-700 dark:text-amber-400">
            Parsiranje traje duže od očekivanog. Osvježi stranicu za par minuta.
          </p>
        ) : null}
      </div>
    </div>
  );
}
