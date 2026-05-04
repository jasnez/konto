import { redirect } from 'next/navigation';
import { AuthSessionListener } from '@/components/app/auth-session-listener';
import type { AccountOption } from '@/components/account-select';
import type { CategoryOption } from '@/components/category-select';
import { BottomNav } from '@/components/shell/bottom-nav';
import { QuickAddProvider } from '@/components/shell/fab';
import { KeyboardShortcutsDialog } from '@/components/shell/keyboard-shortcuts-dialog';
import { QuickAddHotkeys } from '@/components/shell/quick-add-hotkeys';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { NotificationBell } from '@/components/insights/notification-bell';
import { createClient } from '@/lib/supabase/server';

function isCategoryKind(value: string): value is CategoryOption['kind'] {
  return (
    value === 'expense' ||
    value === 'income' ||
    value === 'transfer' ||
    value === 'saving' ||
    value === 'investment'
  );
}

/**
 * App shell for authenticated routes. Middleware already gates the same
 * paths, but we still `getUser()` here so a misconfigured matcher cannot
 * leak a server-rendered shell to anon users (defense-in-depth per
 * .cursor/rules/security.mdc).
 *
 * The `modal` parallel slot (at `@modal/`) renders intercepted routes —
 * currently used to show the transaction edit form in a sheet over the
 * detail page on soft navigation, while preserving full-page rendering
 * on direct URL / refresh (audit N17).
 */
export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/prijava');
  }

  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id,name,currency,type')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select('id,name,icon,kind')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ]);

  const quickAddAccounts: AccountOption[] = (accounts ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    currency: account.currency,
    type: account.type,
  }));

  const quickAddCategories: CategoryOption[] = [];
  for (const category of categories ?? []) {
    if (!isCategoryKind(category.kind)) {
      continue;
    }
    quickAddCategories.push({
      id: category.id,
      name: category.name,
      icon: category.icon,
      kind: category.kind,
    });
  }

  return (
    <QuickAddProvider accounts={quickAddAccounts} categories={quickAddCategories}>
      <AuthSessionListener />
      <QuickAddHotkeys />
      <KeyboardShortcutsDialog />
      {/* Triggers Next.js font preload of JetBrains Mono for amount inputs */}
      <span className="sr-only font-mono" aria-hidden>
        0
      </span>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar rightSlot={<NotificationBell />} />
          {/*
           * Bottom padding reserves space for the mobile bottom nav (~64px tall)
           * + safe-area inset. The FAB now sits flush inside the nav (no float
           * above), so we don't reserve any extra overshoot.
           * `md:!pb-0` drops the reserve on desktop where the sidebar takes over.
           */}
          <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:!pb-0">
            {children}
          </main>
        </div>
      </div>
      <BottomNav />
      {modal}
    </QuickAddProvider>
  );
}
