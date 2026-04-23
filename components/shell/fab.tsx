'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { AccountOption } from '@/components/account-select';
import type { CategoryOption } from '@/components/category-select';
import { QuickAddTransaction } from '@/components/quick-add-transaction';
import { Button, type buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

interface QuickAddContextValue {
  open: () => void;
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

/** Provides a single quick-add entry point for FAB, sidebar button, and Cmd/Ctrl+K. */
export function QuickAddProvider({
  children,
  accounts,
  categories,
}: {
  children: ReactNode;
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k') return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      setIsOpen(true);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <QuickAddContext.Provider value={{ open }}>
      {children}
      <QuickAddTransaction
        open={isOpen}
        onOpenChange={setIsOpen}
        accounts={accounts}
        categories={categories}
      />
    </QuickAddContext.Provider>
  );
}

function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) {
    throw new Error('QuickAddTrigger mora biti renderovan unutar <QuickAddProvider />.');
  }
  return ctx;
}

export function QuickAddTrigger({
  children,
  className,
  variant = 'default',
  size,
}: {
  children: ReactNode;
  className?: string;
  variant?: VariantProps<typeof buttonVariants>['variant'];
  size?: VariantProps<typeof buttonVariants>['size'];
}) {
  const { open } = useQuickAdd();
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={open}>
      {children}
    </Button>
  );
}

/**
 * Floating Action Button used by the mobile bottom nav. Centered over the
 * bottom nav bar, always visible on mobile. Hidden on md+ because the
 * sidebar already has a "Dodaj" button.
 */
export function MobileFab() {
  const { open } = useQuickAdd();
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Brzi unos"
      className={cn(
        'pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full',
        'bg-primary text-primary-foreground shadow-lg',
        'transition-transform active:scale-95 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <Plus className="h-6 w-6" aria-hidden />
    </button>
  );
}
