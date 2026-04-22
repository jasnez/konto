import type { Metadata } from 'next';
import { EmailOtpForm } from '@/components/auth/email-otp-form';

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

  return <EmailOtpForm variant="signup" callbackErrored={callbackErrored} />;
}
