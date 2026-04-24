import {
  ExtractedReceiptSchema,
  emptyExtractedReceipt,
  type ExtractedReceipt,
} from '@/lib/schemas/receipt';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_TIMEOUT_MS = 25_000;

const PROMPT = `Ti si asistent za ekstrakciju podataka sa fiskalnih računa.
Primarni region je Bosna i Hercegovina (BiH), Hrvatska i Srbija, ali podrži i račune iz EU i Skandinavije (Švedska, Norveška, Danska) i drugih zemalja.
Analiziraj priloženu sliku računa i vrati ISKLJUČIVO JSON objekat — bez markdown code blockova, bez komentara, bez objašnjenja.

JSON shema:
{
  "total_amount": number | null,           // ukupan iznos sa uključenim PDV-om/PDV (npr. 45.89)
  "currency":     string | null,           // ISO kod valute (3 slova velika)
  "date":         string | null,           // ISO datum "YYYY-MM-DD"
  "merchant_name": string | null,          // ime prodavca (npr. "Konzum d.o.o.", "Bingo", "ICA")
  "items":        Array<{ name: string, quantity?: number, unit_price?: number, total?: number }>,
  "tax_amount":   number | null,           // iznos PDV-a ako je eksplicitno naveden
  "confidence":   number                   // 0..1 koliko si siguran u ekstrakciju
}

Podržane valute (ISO 4217, ne ograničavaj se samo na ovu listu):
- BAM (KM, konvertibilna marka), EUR, USD, GBP, CHF
- HRK (kuna, istorijski), RSD (srpski dinar)
- SEK (švedska kruna, "kr"), NOK (norveška kruna), DKK (danska kruna)
- PLN (poljski zlot), CZK (češka kruna), HUF (mađarska forinta), TRY (turska lira)

Pravila:
- Ako slika NIJE račun ili je nečitljiva, vrati sva polja kao null, items=[], confidence=0.
- "total_amount" mora biti POZITIVAN broj sa UKUPNO PLAĆENO (sa PDV-om). Nemoj koristiti subtotal.
- Ako račun koristi oznaku "KM", mapiraj currency na "BAM".
- Ako račun koristi oznaku "kr" bez jasne države, pokušaj prepoznati jezik/lokaciju (švedski jezik → SEK, norveški → NOK, danski → DKK).
- Datumi su često "DD.MM.YYYY.", "DD/MM/YYYY", "YYYY-MM-DD" — konvertuj u "YYYY-MM-DD".
- Ako datum fali, vrati null (NE današnji datum).
- "merchant_name" je ime prodavnice/firme, NE adresa niti JIB/PDV broj.
- Decimalni zarez i tačka su ekvivalentni — vrati broj sa decimalnom tačkom.
- Vraćaj samo JSON. Bez ikakvog drugog teksta.
`;

export interface GeminiExtractionResult {
  extracted: ExtractedReceipt;
  rawResponse: string;
  ok: boolean;
  error?: string;
}

/**
 * Extracts structured receipt data from an image using Gemini 2.5 Flash-Lite
 * with native vision support. Single-shot call, no OCR step needed.
 *
 * Returns a safe fallback (empty extracted + ok=false) on any failure so the
 * UI can still render the manual-correction form.
 */
export async function extractReceiptFields(
  imageBytes: Uint8Array | ArrayBuffer | Buffer,
  mimeType: string,
): Promise<GeminiExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      extracted: emptyExtractedReceipt(),
      rawResponse: '',
      ok: false,
      error: 'GEMINI_API_KEY nije konfigurisan.',
    };
  }

  let base64Image: string;
  try {
    const buf = Buffer.isBuffer(imageBytes)
      ? imageBytes
      : Buffer.from(imageBytes instanceof ArrayBuffer ? new Uint8Array(imageBytes) : imageBytes);
    base64Image = buf.toString('base64');
  } catch {
    return {
      extracted: emptyExtractedReceipt(),
      rawResponse: '',
      ok: false,
      error: 'Nevalidan slikovni sadržaj.',
    };
  }

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  // Hard 25 s timeout so the UI never hangs. Vercel function has
  // `maxDuration = 60` which is a safety net on top of this.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, GEMINI_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === 'AbortError') || controller.signal.aborted;
    return {
      extracted: emptyExtractedReceipt(),
      rawResponse: '',
      ok: false,
      error: aborted
        ? 'Gemini predugo ne odgovara. Pokušaj ponovo sa manjom slikom.'
        : err instanceof Error
          ? err.message
          : 'Mrežna greška.',
    };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    return {
      extracted: emptyExtractedReceipt(),
      rawResponse: errText,
      ok: false,
      error: `Gemini API greška (HTTP ${String(response.status)}).`,
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return {
      extracted: emptyExtractedReceipt(),
      rawResponse: '',
      ok: false,
      error: 'Gemini odgovor nije validan JSON.',
    };
  }

  const textContent = extractTextFromGeminiResponse(json);
  if (!textContent) {
    return {
      extracted: emptyExtractedReceipt(),
      rawResponse: '',
      ok: false,
      error: 'Gemini odgovor ne sadrži tekst.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(textContent));
  } catch {
    return {
      extracted: emptyExtractedReceipt(),
      rawResponse: textContent,
      ok: false,
      error: 'Gemini nije vratio validan JSON.',
    };
  }

  const validated = ExtractedReceiptSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      extracted: coerceExtractedReceipt(parsed),
      rawResponse: textContent,
      ok: false,
      error: 'Gemini JSON ne odgovara shemi.',
    };
  }

  return {
    extracted: validated.data,
    rawResponse: textContent,
    ok: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractTextFromGeminiResponse(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const candidates = (json as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const first: unknown = candidates[0];
  if (!first || typeof first !== 'object') return null;
  const content = (first as { content?: unknown }).content;
  if (!content || typeof content !== 'object') return null;
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const textParts = parts
    .map((p) => (p && typeof p === 'object' ? (p as { text?: unknown }).text : null))
    .filter((t): t is string => typeof t === 'string');
  return textParts.length > 0 ? textParts.join('\n') : null;
}

function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json|JSON)?\s*/u, '')
      .replace(/```\s*$/u, '')
      .trim();
  }
  return trimmed;
}

/**
 * When Zod validation fails, try to salvage whatever partial data Gemini
 * returned so the user still sees a useful pre-fill.
 */
function coerceExtractedReceipt(raw: unknown): ExtractedReceipt {
  const base = emptyExtractedReceipt();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;

  if (typeof r.total_amount === 'number' && Number.isFinite(r.total_amount)) {
    base.total_amount = r.total_amount;
  }
  if (typeof r.currency === 'string' && r.currency.length === 3) {
    base.currency = r.currency.toUpperCase();
  }
  if (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(r.date)) {
    base.date = r.date;
  }
  if (typeof r.merchant_name === 'string') {
    base.merchant_name = r.merchant_name.slice(0, 200);
  }
  if (typeof r.tax_amount === 'number' && Number.isFinite(r.tax_amount)) {
    base.tax_amount = r.tax_amount;
  }
  if (typeof r.confidence === 'number') {
    base.confidence = Math.max(0, Math.min(1, r.confidence));
  }
  return base;
}
