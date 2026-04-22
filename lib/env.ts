/**
 * Runtime-asserts that an environment variable is set and returns it as a
 * narrowed `string`. Use this instead of `process.env.FOO!` (non-null
 * assertions are forbidden) or duplicated inline checks.
 *
 * IMPORTANT: For Next.js to inline `NEXT_PUBLIC_*` vars into the client
 * bundle, the `process.env.NEXT_PUBLIC_X` read must be a literal in the
 * calling module. Always call this as:
 *
 *   mustExist('NEXT_PUBLIC_FOO', process.env.NEXT_PUBLIC_FOO)
 */
export function mustExist(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Check .env.local.`);
  }
  return value;
}
