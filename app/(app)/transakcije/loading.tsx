import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for /transakcije while the list is loading. Mirrors the actual
 * layout: title row, full-width "+ Dodaj" CTA on mobile, sticky search +
 * Filteri trigger, then date-section header followed by transaction rows.
 */
export default function TransakcijeLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 space-y-3 sm:flex sm:items-center sm:justify-between sm:space-y-0">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-11 w-full sm:w-28" />
      </div>

      {/* Search + Filteri trigger row (sticky) */}
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-11 flex-1 rounded-md" />
        <Skeleton className="h-11 w-24 rounded-md" />
      </div>

      {/* Two date sections, each with 4 transaction rows. */}
      {Array.from({ length: 2 }).map((_, sectionIdx) => (
        <div key={String(sectionIdx)} className="mt-4 first:mt-0">
          <Skeleton className="mb-2 h-3 w-20" />
          <ul className="list-none space-y-2">
            {Array.from({ length: 4 }).map((_, rowIdx) => (
              <li key={String(rowIdx)}>
                <Skeleton className="h-14 w-full rounded-xl" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
