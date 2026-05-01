import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for /kategorije while the categories list is loading.
 * Matches the post-Phase-F2 layout: title + "Dodaj kategoriju" CTA,
 * three-tab segmented control, and a stacked list of category rows
 * (icon · name · trailing menu).
 */
export default function KategorijeLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-11 w-full sm:w-44" />
      </div>

      {/* Tab list (Troškovi / Prihodi / Transferi) */}
      <Skeleton className="h-11 w-full rounded-md" />

      {/* Eight category rows is enough to fill the visible viewport */}
      <ul className="mt-4 list-none divide-y rounded-xl border bg-card">
        {Array.from({ length: 8 }).map((_, idx) => (
          <li key={String(idx)} className="flex h-16 items-center gap-3 px-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
            <Skeleton className="h-4 flex-1 max-w-40" />
            <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
          </li>
        ))}
      </ul>
    </div>
  );
}
