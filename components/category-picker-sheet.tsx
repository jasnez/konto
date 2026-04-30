'use client';

import type { CategoryOption } from '@/components/category-select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type TransactionCategoryKind = 'income' | 'expense';

interface CategoryPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  /** Drives which categories are listed (income transactions get income categories, etc.). */
  kind: TransactionCategoryKind;
  currentCategoryId: string | null;
  /** Fires with `null` when the user picks "Bez kategorije", otherwise the category id. */
  onSelect: (categoryId: string | null) => void;
  /** Optional context for screen readers — e.g. the merchant or amount being categorised. */
  transactionLabel?: string;
}

function filterCategoriesByKind(
  categories: CategoryOption[],
  kind: TransactionCategoryKind,
): CategoryOption[] {
  return categories.filter((category) => category.kind === kind);
}

/**
 * Bottom-sheet category picker for the swipe-to-categorize flow on the mobile
 * transaction row. Filters the supplied categories to ones matching the
 * transaction kind (income/expense) and lets the user pick one with a single
 * tap. Transfer rows don't open this sheet — their category is fixed.
 */
export function CategoryPickerSheet({
  open,
  onOpenChange,
  categories,
  kind,
  currentCategoryId,
  onSelect,
  transactionLabel,
}: CategoryPickerSheetProps) {
  const filtered = filterCategoriesByKind(categories, kind);

  function handlePick(categoryId: string | null): void {
    onSelect(categoryId);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[80vh] sm:rounded-t-2xl"
      >
        <SheetHeader className="border-b p-4 text-left sm:text-left">
          <SheetTitle>Promijeni kategoriju</SheetTitle>
          {transactionLabel ? (
            <SheetDescription className="truncate">{transactionLabel}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div
          role="radiogroup"
          aria-label="Kategorije"
          className="flex-1 space-y-1.5 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <CategoryButton
            active={currentCategoryId === null}
            icon="❔"
            label="Bez kategorije"
            onClick={() => {
              handlePick(null);
            }}
          />
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nema kategorija ovog tipa. Dodaj ih u Kategorijama.
            </p>
          ) : (
            filtered.map((category) => (
              <CategoryButton
                key={category.id}
                active={currentCategoryId === category.id}
                icon={category.icon ?? '📦'}
                label={category.name}
                onClick={() => {
                  handlePick(category.id);
                }}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface CategoryButtonProps {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}

function CategoryButton({ active, icon, label, onClick }: CategoryButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'flex h-12 w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/10 font-semibold text-primary'
          : 'border-border bg-card hover:bg-accent active:bg-accent',
      )}
    >
      <span className="text-xl leading-none" aria-hidden>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {active ? (
        <span className="text-xs text-primary" aria-hidden>
          ✓
        </span>
      ) : null}
    </button>
  );
}
