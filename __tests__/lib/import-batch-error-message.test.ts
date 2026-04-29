import { describe, expect, it } from 'vitest';
import { importBatchErrorMessageForUser } from '@/lib/import/import-batch-error-message';

describe('importBatchErrorMessageForUser', () => {
  it('maps known codes to Bosnian copy', () => {
    expect(importBatchErrorMessageForUser('parse_failed')).toContain('PDF iz banke');
    expect(importBatchErrorMessageForUser('ocr_failed')).toContain('skeniran');
    expect(importBatchErrorMessageForUser('duplicate_batch')).toContain('već uvezao');
    expect(importBatchErrorMessageForUser('fx_unavailable')).toContain('valutne tečajeve');
  });

  it('maps no_text_extracted to OCR-style message', () => {
    expect(importBatchErrorMessageForUser('no_text_extracted')).toContain('skeniran');
  });

  it('falls back for null or unknown', () => {
    expect(importBatchErrorMessageForUser(null)).toContain('Uvoz nije uspio');
    expect(importBatchErrorMessageForUser('gemini_timeout')).toContain('Uvoz nije uspio');
  });
});
