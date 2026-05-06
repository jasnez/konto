'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logSafe } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import { DASHBOARD_SECTION_KEYS, type DashboardSectionKey } from '@/lib/dashboard/sections';

export type UpdateDashboardOrderResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR' }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'DATABASE_ERROR' };

const UpdateDashboardOrderSchema = z.object({
  order: z.array(z.enum(DASHBOARD_SECTION_KEYS)).max(DASHBOARD_SECTION_KEYS.length),
});

/**
 * Persists the user's preferred dashboard widget order and visibility.
 *
 * The `order` array lists section keys in the order they should appear;
 * keys missing from the array are hidden. Empty array is allowed and
 * means "everything hidden" — the dashboard renders blank but the
 * "Preuredi" pill stays available so the user can recover.
 *
 * Server-side dedupe is defensive: a misbehaving client could submit
 * duplicates and the JSONB column would store them, but resolveSectionOrder
 * already filters duplicates on read, so this is just hygiene.
 */
export async function updateDashboardOrder(input: {
  order: DashboardSectionKey[];
}): Promise<UpdateDashboardOrderResult> {
  const parsed = UpdateDashboardOrderSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'VALIDATION_ERROR' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  const seen = new Set<DashboardSectionKey>();
  const cleaned = parsed.data.order.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // RPC instead of supabase.from('profiles').update() — direct PATCH was
  // hitting a PostgREST schema-cache lag for the new jsonb column on
  // production (silent 0-rows-affected). The RPC's function discovery
  // is independent of the column cache and gives explicit raise-on-not-
  // found semantics. See migration #00065 for the full rationale.
  const { error } = await supabase.rpc('set_dashboard_section_order', {
    p_order: cleaned,
  });

  if (error) {
    logSafe('update_dashboard_order_error', { userId: user.id, error: error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/pocetna');
  return { success: true };
}
