'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

interface ImportBatchLifecycleProps {
  batchId: string;
  status: 'uploaded' | 'parsing' | 'ready' | 'imported' | 'failed' | 'rejected';
}

/**
 * After upload, automatically POST /parse once; while parsing, poll refresh.
 */
export function ImportBatchLifecycle({ batchId, status }: ImportBatchLifecycleProps) {
  const router = useRouter();
  const parseStarted = useRef(false);

  useEffect(() => {
    if (status !== 'uploaded' || parseStarted.current) return;
    parseStarted.current = true;
    void (async () => {
      const res = await fetch(`/api/imports/${batchId}/parse`, { method: 'POST' });
      if (res.status === 401) {
        parseStarted.current = false;
        return;
      }
      router.refresh();
    })();
  }, [batchId, status, router]);

  useEffect(() => {
    if (status !== 'parsing') return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 2000);
    return () => {
      window.clearInterval(id);
    };
  }, [status, router]);

  return null;
}
