import type { Metadata } from 'next';
import { PrijavaForm } from './form';

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

  return <PrijavaForm callbackErrored={callbackErrored} />;
}
