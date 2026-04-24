/**
 * Maps stored `import_batches.error_message` codes to user-facing Bosnian copy.
 * Never surface raw stack traces or internal keys in the UI.
 */
export function importBatchErrorMessageForUser(raw: string | null): string {
  const code = raw?.trim() ?? '';
  if (code.length === 0) {
    return 'Uvoz nije uspio. Možeš pokušati ponovo ili unijeti transakcije ručno.';
  }

  switch (code) {
    case 'parse_failed':
      return 'Nismo uspjeli pročitati izvod. Da li je PDF iz banke?';
    case 'ocr_failed':
      return 'PDF je skeniran i ne možemo ga pročitati automatski.';
    case 'duplicate_batch':
      return 'Ovaj izvod si već uvezao.';
    case 'no_text_extracted':
      return 'PDF je skeniran i ne možemo ga pročitati automatski.';
    case 'pdf_not_found':
      return 'Nismo pronašli fajl izvoda. Pokušaj otpremiti PDF ponovo.';
    default:
      return 'Uvoz nije uspio. Možeš pokušati ponovo ili unijeti transakcije ručno.';
  }
}
