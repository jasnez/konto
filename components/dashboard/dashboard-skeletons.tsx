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
    <div className="space-y-4">
      <DashboardGreetingSkeleton />
      <Card>
        <CardHeader className="space-y-3 p-4 sm:p-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-12 w-72 sm:h-14" />
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
          <Skeleton className="h-5 w-44" />
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardMetricsSkeleton() {
  return (
    <section aria-hidden className="grid grid-cols-2 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={String(index)}>
          <CardHeader className="space-y-2 p-4">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <Skeleton className="h-7 w-28 sm:h-8" />
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

/**
 * Skeleton for the Forecast dashboard widget. Header chrome + chart
 * area placeholder + runway stripe placeholder.
 */
export function DashboardForecastSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-9 w-44 rounded-md" />
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        <Skeleton className="h-48 w-full rounded-md sm:h-60" />
        <Skeleton className="h-9 w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton for the Budgets dashboard widget. Mirrors the 3-row layout the
 * widget will resolve to (each row = title line + slim progress bar).
 * Slightly different from the recent-transactions skeleton so the eye
 * doesn't read both as the same loading block.
 */
export function DashboardBudgetsSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-4 sm:p-6">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={String(index)} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton for the Insights dashboard widget. Mirrors the 3-row layout
 * (severity dot + title line + 2-line body preview).
 */
export function DashboardInsightsSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-4 sm:p-6">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={String(index)} className="flex items-start gap-3">
            <Skeleton className="mt-1.5 h-2 w-2 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <DashboardHeroSkeleton />
      <DashboardMetricsSkeleton />
      <DashboardBudgetsSkeleton />
      <DashboardForecastSkeleton />
      <DashboardRecentTransactionsSkeleton />
      <DashboardTrendSkeleton />
    </div>
  );
}
