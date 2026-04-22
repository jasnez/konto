'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button, type buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

interface QuickAddContextValue {
  open: () => void;
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

/**
 * Wraps the app shell so any descendant <QuickAddTrigger /> can open the
 * single quick-add dialog. The dialog body is intentionally empty for
 * Faza 0 — wiring up manual entry is Epic 1.3.
 */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  return (
    <QuickAddContext.Provider value={{ open }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Brzi unos</DialogTitle>
            <DialogDescription>
              Ručni unos transakcija dolazi uskoro. Za sada ovaj dijalog samo potvrđuje da FAB radi.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
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
