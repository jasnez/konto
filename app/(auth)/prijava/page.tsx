import type { Metadata } from 'next';
import { EmailOtpForm } from '@/components/auth/email-otp-form';

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
    />
  );
}
