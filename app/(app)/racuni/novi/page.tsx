import { AccountForm } from '@/components/accounts/account-form';

/**
 * Forma za novi račun (DS §4.3 D — back + sekcije + sticky CTA u client formi)
 */
export default function NoviRacunPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight">Novi račun</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Dodaj račun da bi mogao bilježiti transakcije i pratiti stanje.
      </p>
      <AccountForm mode="create" />
    </div>
  );
}
