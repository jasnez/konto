import type { Metadata } from 'next';
import { SignupForm } from '@/components/auth/signup-form';
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

  return <SignupForm callbackErrored={callbackErrored} requireInvite={invitesEnabled()} />;
}
