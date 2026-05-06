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
  // DEBUG: `detail` is temporary diagnostic info while we track down why the
  // RPC sometimes returns an error in production. Remove after the root cause
  // is identified and fixed.
  | { success: false; error: 'DATABASE_ERROR'; detail?: string };

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
    // DEBUG: bubble the full error envelope up to the client so the toast can
    // show it. Helps narrow down why the RPC is returning an error in prod.
    // Remove once the root cause is fixed.
    const detail = `code=${error.code} | msg=${error.message} | hint=${error.hint} | details=${error.details}`;
    return { success: false, error: 'DATABASE_ERROR', detail };
  }

  revalidatePath('/pocetna');
  return { success: true };
}
