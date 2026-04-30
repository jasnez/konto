import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardGreetingSkeleton() {
  return (
    <section className="space-y-2">
      <Skeleton className="h-8 w-56 sm:h-9 sm:w-72" />
      <Skeleton className="h-5 w-72 sm:w-96" />
    </section>
  );
}

export function DashboardHeroSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-3 p-4 sm:p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-64" />
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        <Skeleton className="h-6 w-44" />
      </CardContent>
    </Card>
  );
}

export function DashboardMetricsSkeleton() {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={String(index)}>
          <CardHeader className="space-y-2 p-4">
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <Skeleton className="h-8 w-36" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function DashboardRecentTransactionsSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-3 p-4 sm:p-6">
        <Skeleton className="h-6 w-44" />
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={String(index)} className="h-16 w-full rounded-xl" />
        ))}
      </CardContent>
    </Card>
  );
}

export function DashboardTrendSkeleton() {
  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <Skeleton className="h-6 w-20" />
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        <Skeleton className="h-24 w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <DashboardGreetingSkeleton />
      <DashboardHeroSkeleton />
      <DashboardMetricsSkeleton />
      <DashboardRecentTransactionsSkeleton />
      <DashboardTrendSkeleton />
    </div>
  );
}
