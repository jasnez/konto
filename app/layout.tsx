import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { NetworkStatusToast } from '@/components/app/network-status-toast';
import { ServiceWorkerRegister } from '@/components/app/service-worker-register';
import { HashSessionHandler } from '@/components/auth/hash-session-handler';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

// Audit B7: with `next/font/google` defaults the browser falls back to
// generic `serif`/`monospace` (Times New Roman, Courier New) before the
// real font loads — and Courier in particular has very different metrics
// than JetBrains Mono, so the amount input visibly shifts when the real
// font swaps in. Spelling out a `fallback` chain of system UI fonts keeps
// the pre-load layout close to the final rendering. `preload` and
// `adjustFontFallback` are documented `true` defaults; we set them
// explicitly so a future Next.js default flip can't silently regress
// font behavior on tabular numbers.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
  fallback: [
    'system-ui',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Arial',
    'sans-serif',
  ],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-mono',
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
  fallback: [
    'ui-monospace',
    'SFMono-Regular',
    'Menlo',
    'Consolas',
    'Liberation Mono',
    'Courier New',
    'monospace',
  ],
});

export const metadata: Metadata = {
  title: 'Konto',
  description: 'Lične finansije, lokalno i privatno.',
  applicationName: 'Konto',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Konto',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0B' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bs" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <HashSessionHandler />
          <NetworkStatusToast />
          <ServiceWorkerRegister />
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
