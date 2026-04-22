import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/shell/bottom-nav';
import { QuickAddProvider } from '@/components/shell/fab';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { createClient } from '@/lib/supabase/server';

/**
 * App shell for authenticated routes. Middleware already gates the same
 * paths, but we still `getUser()` here so a misconfigured matcher cannot
 * leak a server-rendered shell to anon users (defense-in-depth per
 * .cursor/rules/security.mdc).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/prijava');
  }

  return (
    <QuickAddProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 pb-24 md:pb-0">{children}</main>
        </div>
      </div>
      <BottomNav />
    </QuickAddProvider>
  );
}
