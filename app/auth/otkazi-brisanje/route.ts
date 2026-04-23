import { NextResponse, type NextRequest } from 'next/server';
import { runCancelDeletion } from '@/lib/account-deletion/run-cancel-deletion';

function errorRedirect(origin: string, code: string): NextResponse {
  return NextResponse.redirect(`${origin}/prijava?deletion_cancel=${encodeURIComponent(code)}`);
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return errorRedirect(origin, 'missing_token');
  }

  const result = await runCancelDeletion(token);
  if (!result.ok) {
    const code =
      result.error === 'INVALID_TOKEN'
        ? 'invalid'
        : result.error === 'NOT_SCHEDULED'
          ? 'not_scheduled'
          : 'failed';
    return errorRedirect(origin, code);
  }

  return NextResponse.redirect(result.magicLinkUrl);
}
