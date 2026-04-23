'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { AccountOption } from '@/components/account-select';
import type { CategoryOption } from '@/components/category-select';
import { QuickAddTransaction } from '@/components/quick-add-transaction';
import { Button, type buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { VariantProps } from 'class-variance-authority';

/** Provides quick-add dialog + data for FAB, sidebar, and global shortcuts. */
export function QuickAddProvider({
  children,
  accounts,
  categories,
}: {
  children: ReactNode;
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const quickAddOpen = useUiStore((s) => s.quickAddOpen);
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);
  const closeQuickAdd = useUiStore((s) => s.closeQuickAdd);

  return (
    <>
      {children}
      <QuickAddTransaction
        open={quickAddOpen}
        onOpenChange={(open) => {
          if (open) openQuickAdd();
          else closeQuickAdd();
        }}
        accounts={accounts}
        categories={categories}
      />
    </>
  );
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
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={openQuickAdd}
    >
      {children}
    </Button>
  );
}

function shortcutTitleSuffix(): string {
  if (typeof navigator === 'undefined') return 'Ctrl+K';
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K';
}

/**
 * Floating Action Button used by the mobile bottom nav. Centered over the
 * bottom nav bar, always visible on mobile. Hidden on md+ because the
 * sidebar already has a "Dodaj" button.
 */
export function MobileFab() {
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);
  const [titleSuffix, setTitleSuffix] = useState('Ctrl+K');

  useEffect(() => {
    setTitleSuffix(shortcutTitleSuffix());
  }, []);

  return (
    <button
      type="button"
      data-testid="fab-brzi-unos"
      onClick={openQuickAdd}
      title={`Dodaj transakciju (${titleSuffix})`}
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
