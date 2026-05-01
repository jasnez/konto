import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton shown by Next.js while /racuni is fetching the user's accounts
 * + summary on navigation. Matches the post-redesign layout from Phases
 * D2 + G:
 *   - title row + "Dodaj račun" CTA
 *   - "Stanje aktiva" hero line
 *   - search bar + Filteri trigger
 *   - two account groups, each with a header and a 2-column card grid
 *   - each card stub matches the AccountCard footprint (icon + 3 lines
 *     of metadata + the "Zadnja: ... · prije Xh" preview row)
 */
export default function RacuniLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-11 w-full sm:w-32" />
      </div>

      <div className="mb-6 flex flex-col gap-1 sm:mb-8">
        <Skeleton className="h-3 w-24" />
        <div className="flex items-baseline gap-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      {/* Search + filter trigger */}
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-11 flex-1 rounded-md" />
        <Skeleton className="h-11 w-24 rounded-md" />
      </div>

      {/* Two groups, two cards each — covers the typical layout. */}
      <ul className="list-none space-y-6">
        {Array.from({ length: 2 }).map((_, groupIdx) => (
          <li key={String(groupIdx)} className="space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-20" />
            </div>
            <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, cardIdx) => (
                <li key={String(cardIdx)}>
                  <Card>
                    <CardHeader className="flex-row items-start gap-3 p-0 pl-4 pr-14 pt-4 space-y-0">
                      <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-7 w-28" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </CardHeader>
                    <CardContent className="p-0 pb-4" aria-hidden />
                  </Card>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
