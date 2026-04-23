const DEFAULT_TZ = 'Europe/Sarajevo';

/**
 * Prazan string, null ili nevažeća IANA zona bi pukao u `Intl.DateTimeFormat`
 * (npr. profil korisnika s ručno unesenom greškom).
 */
export function safeIanaTimeZone(value: string | null | undefined): string {
  if (value == null) return DEFAULT_TZ;
  const t = value.trim();
  if (t.length === 0) return DEFAULT_TZ;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: t });
    return t;
  } catch {
    return DEFAULT_TZ;
  }
}
