import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { z } from 'zod';
import { guardCircuit, onFailure, onSuccess } from './gemini-circuit-breaker';
import { validatePlausibility } from './validate-plausibility';
import { withRetry } from './with-retry';
export { CircuitOpenError } from './gemini-circuit-breaker';

const SYSTEM_PROMPT = `
Ti si asistent koji ekstraktuje transakcije iz bankarskih izvoda.

Pravila:
1. Svaka transakcija MORA imati: datum (YYYY-MM-DD), iznos (negativan za odliv, pozitivan za priliv), valutu (ISO 4217), opis (raw text).
2. Koristi valutu navedenu u zaglavlju izvoda; ako nije eksplicitno, pretpostavi BAM za Bosnu i Hercegovinu.
3. Ignorisi: saldo linije, provizije zasebno (ako su u transakciji, ne izdvajaj), pregled stanja.
4. Iznose vrati kao cijeli broj u osnovnim jedinicama valute (pfenig, cent). Primjer: 125,50 BAM -> 12550.
5. Ako nisi siguran za transakciju, preskoci je (bolje manje nego pogresno).
6. Vracaj SAMO JSON, bez markdown oznaka.

Format odgovora:
{
  "transactions": [
    {
      "date": "2026-04-15",
      "amountMinor": -12550,
      "currency": "BAM",
      "description": "BINGO MARKET SARAJEVO",
      "reference": "optional string"
    }
  ],
  "statementPeriodStart": "2026-04-01",
  "statementPeriodEnd": "2026-04-30",
  "confidence": "high" | "medium" | "low",
  "warnings": ["..."]
}
`.trim();

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;
const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;

export const ParsedTransactionSchema = z.object({
  date: z.string().regex(ISO_DATE_REGEX),
  amountMinor: z.number().int(),
  currency: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase()),
  description: z.string().min(1).max(500),
  reference: z.string().max(200).nullable().optional(),
});

export const ParseResultSchema = z.object({
  transactions: z.array(ParsedTransactionSchema),
  statementPeriodStart: z.string().regex(ISO_DATE_REGEX).nullable().optional(),
  statementPeriodEnd: z.string().regex(ISO_DATE_REGEX).nullable().optional(),
  confidence: z.enum(CONFIDENCE_VALUES),
  warnings: z.array(z.string()).default([]),
});

export type ParsedTransaction = z.infer<typeof ParsedTransactionSchema>;
export type ParseResult = z.infer<typeof ParseResultSchema>;

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
// Per-call Gemini timeout. Sized for the AV-2 async path (Inngest worker has
// no Vercel 60s cap), where larger statements with many transactions can
// legitimately take 30-60s to complete. Worst-case retry budget across 3
// attempts: 90s + 1s + 90s + 2s + 90s = ~273s (4.5 min), well under any
// Inngest function timeout. The synchronous fallback path is implicitly
// limited to whatever Vercel's 60s `maxDuration` allows — that path is
// expected to time out for big statements, which is exactly why AV-2 exists.
const GEMINI_TIMEOUT_MS = 90_000;
const MIN_NON_WHITESPACE_CHARS = 20;

/**
 * LLM-based parser for redacted statement text.
 *
 * Call `redactPII` from `./redact-pii.ts` on the input text before passing it
 * here — this function assumes no IBAN / PAN / JMBG remains in the payload.
 *
 * Throws on missing API key, network failure, invalid JSON, or payload that
 * does not match the expected schema. Callers should surface a user-friendly
 * error message and keep the original PDF untouched.
 */
export async function parseStatementWithLLM(
  redactedText: string,
  bankHint?: string,
): Promise<ParseResult> {
  if (redactedText.replace(/\s/g, '').length < MIN_NON_WHITESPACE_CHARS) {
    return {
      transactions: [],
      confidence: 'low',
      warnings: ['Izvod je prazan ili nema dovoljno teksta za ekstrakciju.'],
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY nije konfigurisan.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          transactions: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                date: { type: SchemaType.STRING },
                amountMinor: { type: SchemaType.INTEGER },
                currency: { type: SchemaType.STRING },
                description: { type: SchemaType.STRING },
                reference: { type: SchemaType.STRING, nullable: true },
              },
              required: ['date', 'amountMinor', 'currency', 'description'],
            },
          },
          statementPeriodStart: { type: SchemaType.STRING, nullable: true },
          statementPeriodEnd: { type: SchemaType.STRING, nullable: true },
          confidence: { type: SchemaType.STRING },
          warnings: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ['transactions', 'confidence', 'warnings'],
      },
    },
  });

  const userMessage = bankHint
    ? `Banka: ${bankHint}\n\nIzvod:\n${redactedText}`
    : `Izvod:\n${redactedText}`;

  // Guard: throws CircuitOpenError if the breaker is OPEN and the recovery
  // timeout has not elapsed yet.
  guardCircuit();

  let result: Awaited<ReturnType<typeof model.generateContent>>;
  try {
    result = await withRetry(() =>
      model.generateContent(userMessage, { timeout: GEMINI_TIMEOUT_MS }),
    );
  } catch (err) {
    onFailure();
    throw err;
  }
  onSuccess();

  const raw = result.response.text();
  const parsed: unknown = JSON.parse(raw);
  const validated = ParseResultSchema.parse(parsed);

  const { transactions, warnings, filteredCount } = validatePlausibility(validated);
  return {
    ...validated,
    transactions,
    warnings,
    ...(filteredCount > 0 && {
      confidence: validated.confidence === 'high' ? 'medium' : validated.confidence,
    }),
  };
}
