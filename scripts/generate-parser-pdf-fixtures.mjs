/**
 * Jednokratno generiše male PDF fixture za lib/parser testove.
 * Pokretanje: node scripts/generate-parser-pdf-fixtures.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'tests', 'fixtures', 'pdfs');

// 1×1 PNG (crvena piksel) — samo slika, bez tekstualnog sloja.
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwI/6W6Q2QAAAABJRU5ErkJggg==';

function decodeBase64(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

async function writeTextStatement() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const boiler = [
    'Raiffeisen BANK d.d. - test bank statement (anon)',
    'Korisnik: Test Korisnik',
    'Adresa: Test ulica 1, 71000 Sarajevo',
    'IBAN: BA39 1234 5678 9012 3456  Valuta: BAM',
    'Datum izvoda: 24.04.2026.',
    '---',
    'Uplata 125,00 BAM  Isplata -45,50 BAM',
    'Stanje: 1.234,56 BAM',
  ];

  const pageCount = 3;
  for (let p = 0; p < pageCount; p++) {
    const page = doc.addPage([595, 842]);
    let y = 800;
    for (const line of boiler) {
      page.drawText(`${line} [str. ${String(p + 1)}]`, {
        x: 50,
        y,
        size: 11,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= 22;
    }
    const block =
      'Opis: Placanje karticom  Iznos -12,99 BAM  ' +
      'Opis: Gotovinska uplata  Iznos 500,00 BAM  '.repeat(3);
    page.drawText(block, { x: 50, y: 420, size: 10, font, maxWidth: 500 });
  }

  const bytes = await doc.save();
  await writeFile(path.join(outDir, 'raiffeisen-sample.pdf'), bytes);
  console.log('Wrote raiffeisen-sample.pdf', bytes.byteLength, 'bytes');
}

async function writeImageOnly() {
  const doc = await PDFDocument.create();
  const png = decodeBase64(PNG_1X1_BASE64);
  const img = await doc.embedPng(png);
  const page = doc.addPage([595, 842]);
  page.drawImage(img, { x: 120, y: 400, width: 220, height: 120 });

  const bytes = await doc.save();
  await writeFile(path.join(outDir, 'image-only.pdf'), bytes);
  console.log('Wrote image-only.pdf', bytes.byteLength, 'bytes');
}

async function writeFivePage() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const line = 'Test stranica performanse  Test Korisnik  100,00 BAM  '.repeat(2);
  for (let p = 0; p < 5; p++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${line} [${String(p + 1)}/5]`, { x: 40, y: 780, size: 12, font });
  }
  const bytes = await doc.save();
  await writeFile(path.join(outDir, 'five-page-text.pdf'), bytes);
  console.log('Wrote five-page-text.pdf', bytes.byteLength, 'bytes');
}

await mkdir(outDir, { recursive: true });
await writeTextStatement();
await writeImageOnly();
await writeFivePage();
