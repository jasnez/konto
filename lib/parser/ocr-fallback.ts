const OCR_ENDPOINT = 'https://api.mistral.ai/v1/ocr';
const OCR_MODEL = 'mistral-ocr-latest';
const TIMEOUT_MS = 60_000;

interface MistralOcrPage {
  markdown: string;
}

interface MistralOcrResponse {
  pages: MistralOcrPage[];
}

function isMistralOcrResponse(data: unknown): data is MistralOcrResponse {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.pages)) return false;
  return d.pages.every(
    (p) =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Record<string, unknown>).markdown === 'string',
  );
}

/**
 * Sends a scanned (image-only) PDF to Mistral OCR and returns the extracted text.
 *
 * Intended to be called only when `extractPdfText` returns `hasText === false`.
 * Throws on missing API key, network failure, HTTP error, or unexpected response shape.
 */
export async function ocrFallback(pdfBuffer: ArrayBuffer): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY nije konfigurisan.');
  }

  const base64 = Buffer.from(pdfBuffer).toString('base64');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OCR_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        document: { type: 'document_base64', document_base64: base64 },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === 'AbortError') || controller.signal.aborted;
    throw new Error(
      aborted
        ? `Mistral OCR predugo ne odgovara (timeout ${String(TIMEOUT_MS / 1000)}s).`
        : err instanceof Error
          ? err.message
          : 'Mrežna greška pri OCR pozivu.',
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Mistral OCR greška (HTTP ${String(response.status)}): ${body}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Mistral OCR odgovor nije validan JSON.');
  }

  if (!isMistralOcrResponse(data)) {
    throw new Error('Mistral OCR odgovor ne odgovara očekivanoj shemi.');
  }

  return data.pages.map((p) => p.markdown).join('\n\n');
}
