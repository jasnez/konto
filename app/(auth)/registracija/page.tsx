import type { Metadata } from 'next';
import { EmailOtpForm } from '@/components/auth/email-otp-form';
import { invitesEnabled } from '@/lib/auth/invite-config';

export const metadata: Metadata = {
  title: 'Registracija — Konto',
};

export default async function RegistracijaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackErrored = params.error === 'true';

  return (
    <EmailOtpForm
      variant="signup"
      callbackErrored={callbackErrored}
      // /registracija is the dedicated new-user path — when invites are
      // enabled it always demands a code.
      requireInvite={invitesEnabled()}
    />
  );
}
