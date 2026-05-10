/**
 * Invite-only sign-up feature flag.
 *
 * Controlled by the `ENABLE_INVITES` env var. Stays off by default so dev /
 * test environments don't have to ship invite codes around. In production
 * staging the founder flips it on once the first batch of codes has been
 * generated via `scripts/generate-invite-codes.mjs`.
 *
 * This is a server-side flag — the value is interpolated at request time,
 * never shipped to the client bundle. Components that need to know about it
 * receive the boolean via a Server Component prop.
 */
export function invitesEnabled(): boolean {
  return process.env.ENABLE_INVITES === 'true';
}

/**
 * Hardcoded admin email from env (used by /admin/invites UI).
 *
 * The /admin/invites page checks `user.email === adminEmail()` and 404s
 * if it doesn't match. Returns null when unset → admin UI is disabled.
 */
export function adminEmail(): string | null {
  const v = process.env.ADMIN_EMAIL;
  return v && v.length > 0 ? v.toLowerCase() : null;
}
