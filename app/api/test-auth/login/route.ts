/**
 * E2E auth-bypass endpoint. Implementation lives in lib/e2e/auth-login-handler.ts.
 *
 * In production Vercel deployments, next.config.ts swaps that import for
 * lib/e2e/auth-login-handler-stub.ts at webpack build time, so none of the
 * auth-bypass logic reaches the production bundle.
 *
 * Runtime guards (NODE_ENV, VERCEL_ENV, shared secret, custom header) remain
 * in the real handler as defence-in-depth for non-Vercel environments.
 */
export { POST } from '@/lib/e2e/auth-login-handler';
