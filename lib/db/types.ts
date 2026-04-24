/**
 * Shared types for the lib/db/* repository layer.
 *
 * Each module in this directory is a thin, typed wrapper over Supabase for
 * one table. Action files (Server Actions) call these helpers instead of
 * building Supabase queries inline, keeping actions focused on validation,
 * auth checks, and orchestration.
 *
 * db/* modules do NOT check auth — callers are responsible for verifying
 * the user is authenticated before passing userId to any function here.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

/** Typed Supabase client used across all db/* modules. */
export type DbClient = SupabaseClient<Database>;

export type AccountRow = Database['public']['Tables']['accounts']['Row'];
export type AccountInsert = Database['public']['Tables']['accounts']['Insert'];
export type AccountUpdate = Database['public']['Tables']['accounts']['Update'];

export type CategoryRow = Database['public']['Tables']['categories']['Row'];
export type CategoryInsert = Database['public']['Tables']['categories']['Insert'];

export type MerchantRow = Database['public']['Tables']['merchants']['Row'];
export type MerchantInsert = Database['public']['Tables']['merchants']['Insert'];

export type TransactionRow = Database['public']['Tables']['transactions']['Row'];
export type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];
