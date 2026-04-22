'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, isActive } from './nav-items';
import { QuickAddTrigger } from './fab';

const STORAGE_KEY = 'konto:sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === '1') setCollapsed(true);
    } catch {
      // localStorage may be disabled (private mode, embedded WebView) — no-op.
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // no-op
      }
      return next;
    });
  }

  return (
    <aside
      aria-label="Glavna navigacija"
      data-collapsed={collapsed}
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-background transition-[width] md:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center border-b px-4',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <Link href="/pocetna" className="text-lg font-semibold tracking-tight">
          {collapsed ? 'K' : 'Konto'}
        </Link>
      </div>

      <div className="p-2">
        <QuickAddTrigger className={cn('h-11 w-full gap-2', collapsed && 'px-0')} variant="default">
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          {collapsed ? <span className="sr-only">Dodaj</span> : <span>Dodaj</span>}
        </QuickAddTrigger>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                active
                  ? 'bg-accent font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                collapsed && 'justify-center px-0',
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggle}
          aria-label={collapsed ? 'Proširi sidebar' : 'Skupi sidebar'}
          className={cn(
            'h-9 w-full text-muted-foreground',
            collapsed ? 'justify-center px-0' : 'justify-start',
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden />
          ) : (
            <>
              <ChevronLeft className="mr-2 h-4 w-4" aria-hidden />
              Skupi
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
