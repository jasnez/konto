/**
 * Canonical list of all valid import_batches.status values.
 * Must stay in sync with the CHECK constraint in the database schema.
 * UX-2: single source of truth — eliminates drift between code and DB docs.
 */
export const IMPORT_BATCH_STATUSES = [
  'uploaded',
  'enqueued',
  'parsing',
  'ready',
  'imported',
  'failed',
  'rejected',
] as const;

export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];

// Alias kept for backward compatibility — prefer ImportBatchStatus.
// (The Supabase-generated types resolve this column to `string`; the canonical
// app type is the union above.)
export type ImportStatus = ImportBatchStatus;

export interface ImportListRow {
  id: string;
  createdAt: string;
  bankLabel: string;
  status: ImportBatchStatus;
  transactionCount: number;
}
