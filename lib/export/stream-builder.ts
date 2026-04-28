import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { bigintJsonReplacer } from './bigint-json-replacer';
import { streamExportTransactions, type ExportHeader } from './build-user-export-json';

const TAIL = '],"categorization_rules":[],"budgets":[],"goals":[],"recurring_transactions":[]}';

export function buildExportStream(
  supabase: SupabaseClient<Database>,
  userId: string,
  header: ExportHeader,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const headerObj = {
          exported_at: new Date().toISOString(),
          export_version: 1,
          profile: header.profile,
          accounts: header.accounts,
          categories: header.categories,
          merchants: header.merchants,
          merchant_aliases: header.merchant_aliases,
        };
        const headerJson = JSON.stringify(headerObj, bigintJsonReplacer);
        // Strip closing brace and open the transactions array
        controller.enqueue(encoder.encode(headerJson.slice(0, -1) + ',"transactions":['));

        let isFirst = true;
        for await (const chunk of streamExportTransactions(supabase, userId)) {
          for (const tx of chunk) {
            const prefix = isFirst ? '' : ',';
            controller.enqueue(encoder.encode(prefix + JSON.stringify(tx, bigintJsonReplacer)));
            isFirst = false;
          }
        }

        controller.enqueue(encoder.encode(TAIL));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
