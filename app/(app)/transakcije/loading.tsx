import { Skeleton } from '@/components/ui/skeleton';

export default function TransakcijeLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-11 w-28" />
      </div>

      <div className="mb-4 rounded-xl border p-3">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={String(index)} className="h-11 w-full" />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={String(index)} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
