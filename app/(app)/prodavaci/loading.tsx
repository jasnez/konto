import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for /merchants (Prodavači) while the merchants list is loading.
 * Matches the post-Phase-F layout: title + "Dodaj prodavača" CTA, then a
 * stacked list of merchant rows (icon · display name · category subtitle ·
 * tx count · trailing menu).
 */
export default function MerchantsLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-11 w-full sm:w-44" />
      </div>

      <ul className="list-none rounded-xl border bg-card">
        {Array.from({ length: 6 }).map((_, idx) => (
          <li
            key={String(idx)}
            className="flex h-16 items-center gap-3 border-b border-border px-3 last:border-b-0"
          >
            <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-3 w-12 shrink-0" />
            <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
          </li>
        ))}
      </ul>
    </div>
  );
}
