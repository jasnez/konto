import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="h-9 w-72 rounded-md" />
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
          <Skeleton className="mx-auto h-56 w-56 rounded-full" />
          <ul className="mt-4 space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <li key={String(index)} className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <div className="flex-1" />
                <Skeleton className="h-4 w-12 shrink-0" />
                <Skeleton className="h-4 w-20 shrink-0" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
