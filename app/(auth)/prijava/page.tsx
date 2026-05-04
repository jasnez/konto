import type { Metadata } from 'next';
import { EmailOtpForm } from '@/components/auth/email-otp-form';
import { invitesEnabled } from '@/lib/auth/invite-config';

export const metadata: Metadata = {
  title: 'Prijava — Konto',
};

export default async function PrijavaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackErrored = params.error === 'true';
  const sessionExpired = params.session === 'istekao';

  return (
    <EmailOtpForm
      variant="signin"
      callbackErrored={callbackErrored}
      sessionExpired={sessionExpired}
      // Sign-in only needs an invite for users who don't yet have an account.
      // The Server Action detects existing users via the auth admin API and
      // waives the gate for them — but we still render the field when invites
      // are enabled so a brand-new visitor on /prijava can complete the flow.
      requireInvite={invitesEnabled()}
    />
  );
}
