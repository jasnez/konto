import type { Database } from '@/supabase/types';

export type ImportStatus = Database['public']['Tables']['import_batches']['Row']['status'];

export interface ImportListRow {
  id: string;
  createdAt: string;
  bankLabel: string;
  status: ImportStatus;
  transactionCount: number;
}
