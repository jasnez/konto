'use client';

import { Camera, CheckCircle2, FileImage, Loader2, RefreshCw, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type ChangeEvent, type DragEvent } from 'react';
import { toast } from 'sonner';
import { AccountSelect, type AccountOption } from '@/components/account-select';
import { CategorySelect, type CategoryOption } from '@/components/category-select';
import { MoneyInput } from '@/components/money-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getTodayIsoDate, readLastUsed } from '@/components/quick-add-transaction-draft';
import { resizeForUpload } from '@/lib/image/resize-for-upload';
import { assessReceiptDate, describePlausibility } from '@/lib/receipt/date-plausibility';
import type { ExtractedReceipt } from '@/lib/schemas/receipt';
import { analyzeReceipt, createTransactionFromReceipt, uploadReceipt } from './actions';

type Phase =
  | { name: 'upload' }
  | { name: 'uploading' }
  | { name: 'analyzing'; scanId: string; previewUrl: string }
  | {
      name: 'review';
      scanId: string;
      previewUrl: string;
      extracted: ExtractedReceipt;
    }
  | { name: 'done' };

interface ReceiptScanClientProps {
  accounts: AccountOption[];
  categories: CategoryOption[];
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function majorToCents(amount: number | null): bigint {
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return 0n;
  return BigInt(Math.round(Math.abs(amount) * 100));
}

function defaultAccountId(accounts: AccountOption[]): string {
  const lastUsed = readLastUsed();
  if (lastUsed?.account_id && accounts.some((a) => a.id === lastUsed.account_id)) {
    return lastUsed.account_id;
  }
  return accounts.at(0)?.id ?? '';
}

/** Bosnian-style display date `DD.MM.YYYY.` for the warning banner copy.
 * Inline because it's the only place this format is used and pulling
 * date-fns just for `format(d, 'dd.MM.yyyy.')` would be overkill. */
function formatBosnianDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}.`;
}

// Audit N18: first-use guidance. Visible only in the upload phase — see
// the conditional render below. Tips were chosen for highest expected
// impact on Gemini extraction quality (camera angle, framing, lighting),
// with two long-tail cases (creased receipts, multi-page receipts) that
// show up in support tickets.
const SCAN_TIPS = [
  'Slikaj iznad računa, ravno — ne pod oštrim uglom.',
  'Cijeli račun u kadru: vidljivi datum, iznos i naziv prodavca.',
  'Dovoljno svjetla; izbjegavaj sjenu od ruke ili telefona.',
  'Ako je račun zgužvan, izravnaj ga na ravnu površinu.',
  'Više od jedne stranice? Skeniraj svaku posebno.',
];

function ScanTips() {
  return (
    <aside
      aria-label="Savjeti za skeniranje"
      className="rounded-2xl border bg-muted/30 p-4 text-sm"
    >
      <p className="mb-2 font-medium text-foreground">Za najbolje prepoznavanje:</p>
      <ul className="space-y-1.5 text-muted-foreground">
        {SCAN_TIPS.map((tip) => (
          <li key={tip} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function translateError(code: string): string {
  switch (code) {
    case 'RATE_LIMIT_EXCEEDED':
      return 'Prekoračen je dnevni limit (20 skenova / dan).';
    case 'FILE_TOO_LARGE':
      return 'Slika je prevelika (max 10 MB).';
    case 'UNSUPPORTED_MIME':
      return 'Podržani su samo JPEG, PNG, WEBP i HEIC.';
    case 'STORAGE_ERROR':
      return 'Greška pri uploadu slike. Pokušaj ponovo.';
    case 'UNAUTHORIZED':
      return 'Morate biti prijavljeni.';
    case 'FORBIDDEN':
      return 'Nemate pristup ovom resursu.';
    case 'NOT_FOUND':
      return 'Skeniranje nije pronađeno.';
    case 'VALIDATION_ERROR':
      return 'Podaci nisu validni.';
    case 'EXTERNAL_SERVICE_ERROR':
      return 'FX konverzija nije uspjela. Pokušaj ponovo za par minuta.';
    case 'LLM_ERROR':
      return 'AI ekstrakcija nije uspjela. Unesi podatke ručno.';
    default:
      return 'Dogodila se greška.';
  }
}

export function ReceiptScanClient({ accounts, categories }: ReceiptScanClientProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: 'upload' });
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  // Review-state form (only meaningful while phase.name === 'review').
  const [amountCents, setAmountCents] = useState<bigint>(0n);
  const [currency, setCurrency] = useState<string>('BAM');
  const [transactionDate, setTransactionDate] = useState<string>(getTodayIsoDate());
  const [merchantRaw, setMerchantRaw] = useState<string>('');
  const [accountId, setAccountId] = useState<string>(defaultAccountId(accounts));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  // Ref identity = current in-flight run. `cancelScan` clears it; handlers
  // then bail by comparing `runStateRef.current !== state`.
  const runStateRef = useRef<{ previewUrl: string | null } | null>(null);

  function reset() {
    setPhase({ name: 'upload' });
    setAmountCents(0n);
    setCurrency('BAM');
    setTransactionDate(getTodayIsoDate());
    setMerchantRaw('');
    setCategoryId(null);
    setNotes('');
  }

  function cancelScan() {
    const state = runStateRef.current;
    if (!state) return;
    runStateRef.current = null;
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
    }
    setPhase({ name: 'upload' });
    toast.info('Skeniranje otkazano.');
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }
  function openCamera() {
    cameraInputRef.current?.click();
  }

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error('Slika je prevelika (max 10 MB).');
      return;
    }
    const mime = (file.type || '').toLowerCase();
    if (!ACCEPT_MIME.has(mime)) {
      toast.error('Podržani su samo JPEG, PNG, WEBP i HEIC.');
      return;
    }

    const state: { previewUrl: string | null } = { previewUrl: null };
    runStateRef.current = state;

    setPhase({ name: 'uploading' });

    // Client-side downscale + JPEG re-encode. Gracefully falls back to the
    // original file if the browser can't decode it (e.g. HEIC in Chrome).
    const { file: compressed } = await resizeForUpload(file);
    if (runStateRef.current !== state) return;

    const previewUrl = URL.createObjectURL(compressed);
    state.previewUrl = previewUrl;

    const formData = new FormData();
    formData.append('file', compressed);
    const upResult = await uploadReceipt(formData);
    if (runStateRef.current !== state) return;
    if (!upResult.success) {
      URL.revokeObjectURL(previewUrl);
      state.previewUrl = null;
      runStateRef.current = null;
      toast.error(translateError(upResult.error));
      setPhase({ name: 'upload' });
      return;
    }

    setPhase({ name: 'analyzing', scanId: upResult.data.scanId, previewUrl });

    const anResult = await analyzeReceipt(upResult.data.scanId);
    if (runStateRef.current !== state) return;

    runStateRef.current = null;

    if (!anResult.success) {
      toast.error(
        anResult.error === 'LLM_ERROR' && 'message' in anResult
          ? `${translateError('LLM_ERROR')} (${anResult.message})`
          : translateError(anResult.error),
      );
      // Still move to review with empty pre-fill so user can enter manually.
      setPhase({
        name: 'review',
        scanId: upResult.data.scanId,
        previewUrl,
        extracted: {
          total_amount: null,
          currency: null,
          date: null,
          merchant_name: null,
          items: [],
          tax_amount: null,
          confidence: 0,
        },
      });
      prefillForm(null);
      return;
    }

    setPhase({
      name: 'review',
      scanId: upResult.data.scanId,
      previewUrl,
      extracted: anResult.data.extracted,
    });
    prefillForm(anResult.data.extracted);
  }

  function prefillForm(extracted: ExtractedReceipt | null) {
    const lastUsed = readLastUsed();
    const fallbackAccountId = defaultAccountId(accounts);
    const firstAccount = accounts.find((a) => a.id === fallbackAccountId);
    const fallbackCurrency = firstAccount?.currency ?? 'BAM';

    setAmountCents(majorToCents(extracted?.total_amount ?? null));
    setCurrency((extracted?.currency ?? fallbackCurrency).toUpperCase());
    setTransactionDate(extracted?.date ?? getTodayIsoDate());
    setMerchantRaw(extracted?.merchant_name ?? lastUsed?.merchant_raw ?? '');
    setAccountId(fallbackAccountId);
    setCategoryId(null);
    setNotes('');
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files.item(0);
    if (file) void handleFile(file);
  }

  function handleSubmit() {
    if (phase.name !== 'review') return;
    if (amountCents <= 0n) {
      toast.error('Iznos mora biti veći od 0.');
      return;
    }
    if (!accountId) {
      toast.error('Odaberi račun.');
      return;
    }

    startTransition(async () => {
      const result = await createTransactionFromReceipt({
        scan_id: phase.scanId,
        account_id: accountId,
        amount_cents: amountCents,
        currency,
        transaction_date: transactionDate,
        merchant_raw: merchantRaw.trim() || null,
        category_id: categoryId,
        notes: notes.trim() || null,
      });

      if (!result.success) {
        const message =
          result.error === 'VALIDATION_ERROR'
            ? (result.details._root[0] ?? 'Validacija nije uspjela.')
            : translateError(result.error);
        toast.error(message);
        return;
      }

      if (result.data.merchantCreated) {
        const displayName = merchantRaw.trim();
        toast.success(`Transakcija sačuvana. Dodan novi prodavac: ${displayName}`);
      } else {
        toast.success('Transakcija sačuvana.');
      }
      URL.revokeObjectURL(phase.previewUrl);
      setPhase({ name: 'done' });
      router.push(`/transakcije/${result.data.transactionId}`);
    });
  }

  // ───────────────────────────── UI per phase ─────────────────────────────

  if (phase.name === 'upload' || phase.name === 'uploading') {
    return (
      <div className="space-y-4">
        {/* Tips show only in the idle 'upload' state — once the actual
         * upload starts (`uploading`), the spinner has the user's full
         * attention and the tips would just be noise. */}
        {phase.name === 'upload' ? <ScanTips /> : null}
        <div
          className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => {
            setDragging(false);
          }}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            onChange={onInputChange}
            disabled={phase.name === 'uploading'}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={onInputChange}
            disabled={phase.name === 'uploading'}
          />

          <div className="flex flex-col items-center gap-4 py-6">
            {phase.name === 'uploading' ? (
              <>
                <Loader2 className="size-12 animate-spin text-primary" aria-hidden />
                <p className="text-sm font-medium">Korak 1/2: Slanje slike…</p>
                <p className="text-xs text-muted-foreground">
                  Slika se optimizuje i prosljeđuje na server.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11"
                  onClick={cancelScan}
                >
                  <X className="mr-2 size-4" aria-hidden />
                  Otkaži
                </Button>
              </>
            ) : (
              <>
                <FileImage className="size-12 text-muted-foreground" aria-hidden />
                <div className="space-y-1">
                  <p className="font-medium">Povuci sliku ovdje ili odaberi</p>
                  <p className="text-xs text-muted-foreground">JPEG, PNG, WEBP, HEIC · max 10 MB</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" size="lg" className="h-11" onClick={openCamera}>
                    <Camera className="mr-2 size-4" aria-hidden />
                    Uslikaj
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="h-11"
                    onClick={openFilePicker}
                  >
                    <Upload className="mr-2 size-4" aria-hidden />
                    Odaberi fajl
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase.name === 'analyzing') {
    return (
      <div className="space-y-4 rounded-xl border p-6 text-center">
        {/* Preview */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={phase.previewUrl}
          alt="Slika računa"
          className="mx-auto max-h-72 rounded-md object-contain"
        />
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Korak 2/2: AI čita račun…
          </div>
          <p className="text-xs">Obično 3–10 s, maksimalno 25 s.</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-11" onClick={cancelScan}>
          <X className="mr-2 size-4" aria-hidden />
          Otkaži
        </Button>
      </div>
    );
  }

  if (phase.name === 'review') {
    const confidence = phase.extracted.confidence ?? null;

    // Re-evaluated on every render so the banner clears the moment the
    // user fixes the date in the input. The threshold logic + Bosnian
    // copy live in `lib/receipt/date-plausibility` so they're testable
    // without React (audit 2026-05-08 — OCR misread receipt year as
    // 2008/2020 and the user had no visual cue before saving).
    const datePlausibility = assessReceiptDate(transactionDate, getTodayIsoDate());
    const dateWarningCopy = describePlausibility(
      datePlausibility,
      formatBosnianDate(transactionDate),
    );

    return (
      <div className="space-y-4">
        <div className="rounded-xl border p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={phase.previewUrl}
            alt="Slika računa"
            className="mx-auto max-h-56 rounded-md object-contain"
          />
          {confidence !== null && confidence > 0 ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              AI sigurnost: {(confidence * 100).toFixed(0)}%
              {confidence < 0.6 ? ' · provjeri podatke prije spašavanja' : null}
            </p>
          ) : (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Provjeri i dopuni podatke prije spašavanja.
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-xl border p-4">
          <div className="grid gap-2">
            <Label htmlFor="skeniraj-amount">Iznos</Label>
            <MoneyInput
              id="skeniraj-amount"
              value={amountCents}
              onChange={setAmountCents}
              currency={currency}
              onCurrencyChange={setCurrency}
              size="lg"
              aria-label="Ukupan iznos računa"
            />
            <p className="text-xs text-muted-foreground">
              Bit će zabilježen kao trošak (negativna transakcija).
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="skeniraj-date">Datum</Label>
            <Input
              id="skeniraj-date"
              type="date"
              value={transactionDate}
              onChange={(e) => {
                setTransactionDate(e.target.value);
              }}
              className="h-11"
              aria-describedby={dateWarningCopy ? 'skeniraj-date-warning' : undefined}
              aria-invalid={dateWarningCopy ? true : undefined}
            />
            {dateWarningCopy ? (
              <p
                id="skeniraj-date-warning"
                role="alert"
                className={`rounded-md border px-3 py-2 text-sm ${
                  datePlausibility.kind === 'future'
                    ? 'border-destructive/50 bg-destructive/10 text-destructive'
                    : 'border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                }`}
              >
                {dateWarningCopy}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="skeniraj-merchant">Prodavac</Label>
            <Input
              id="skeniraj-merchant"
              value={merchantRaw}
              onChange={(e) => {
                setMerchantRaw(e.target.value);
              }}
              placeholder="npr. Konzum"
              className="h-11"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="skeniraj-account">Račun</Label>
            <AccountSelect
              id="skeniraj-account"
              value={accountId}
              onValueChange={setAccountId}
              accounts={accounts}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="skeniraj-category">Kategorija (opciono)</Label>
            <CategorySelect
              id="skeniraj-category"
              value={categoryId}
              onValueChange={setCategoryId}
              categories={categories}
              kind="expense"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="skeniraj-notes">Napomena (opciono)</Label>
            <Textarea
              id="skeniraj-notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              placeholder="Dodatni podaci o transakciji…"
              rows={3}
            />
          </div>

          {phase.extracted.items.length > 0 ? (
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Stavke računa ({phase.extracted.items.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {phase.extracted.items.map((item, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">{item.name}</span>
                    {typeof item.total === 'number' ? (
                      <span className="shrink-0 font-mono">{item.total.toFixed(2)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1"
            onClick={reset}
            disabled={pending}
          >
            <RefreshCw className="mr-2 size-4" aria-hidden />
            Nova slika
          </Button>
          <Button type="button" className="h-11 flex-[2]" onClick={handleSubmit} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Spašavam…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 size-4" aria-hidden />
                Sačuvaj transakciju
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
