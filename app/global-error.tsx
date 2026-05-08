'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: 'global' },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="bs">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          padding: '1.5rem',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
          textAlign: 'center',
          background: '#fff',
          color: '#111',
        }}
      >
        <div>
          <p style={{ fontSize: '0.875rem', opacity: 0.6, margin: 0 }}>Greška</p>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0.5rem 0' }}>
            Nešto nije u redu
          </h1>
          <p style={{ opacity: 0.7, maxWidth: '24rem', margin: 0 }}>
            Naš tim je obaviješten o problemu. Pokušaj ponovo za trenutak.
          </p>
        </div>

        <button
          onClick={reset}
          style={{
            minHeight: '44px',
            padding: '0.5rem 1.25rem',
            border: '1px solid currentColor',
            borderRadius: '0.5rem',
            background: '#111',
            color: '#fff',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Pokušaj ponovo
        </button>

        {error.digest && (
          <p style={{ fontSize: '0.75rem', opacity: 0.5, fontFamily: 'monospace' }}>
            ID: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
