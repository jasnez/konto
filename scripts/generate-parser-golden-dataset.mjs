/**
 * Generates synthetic anonymized golden bank statements for parser benchmarks.
 *
 * Output:
 *   tests/parser/golden/*.pdf
 *   tests/parser/golden/*.expected.json
 *
 * Run:
 *   node scripts/generate-parser-golden-dataset.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'tests', 'parser', 'golden');

const BANKS = [
  { key: 'raiffeisen-bih', label: 'Raiffeisen Bank BH', currency: 'BAM' },
  { key: 'unicredit-bih', label: 'UniCredit Bank BiH', currency: 'BAM' },
  { key: 'asa-bih', label: 'ASA Banka d.d. Sarajevo', currency: 'BAM' },
  { key: 'revolut', label: 'Revolut Europe UAB', currency: 'EUR' },
  { key: 'wise', label: 'Wise Europe SA', currency: 'EUR' },
];

const PERIODS = [
  { start: '2026-01-01', end: '2026-01-31' },
  { start: '2026-02-01', end: '2026-02-28' },
  { start: '2026-03-01', end: '2026-03-31' },
  { start: '2026-04-01', end: '2026-04-30' },
  { start: '2026-05-01', end: '2026-05-31' },
];

const DESCRIPTIONS = [
  'BINGO MARKET SARAJEVO',
  'DM DROGERIE MARKT',
  'BH TELECOM PRETPLATA',
  'WOLT DOSTAVA',
  'ALTA BENZINSKA STANICA',
  'MCDONALDS SARAJEVO',
  'NETFLIX.COM',
  'SPARKASSE ATM ISPLATA',
  'POS UPLATA KAFIC BAJKA',
  'PAYROLL UPLATA',
  'TRANSFER SA DRUGOG RACUNA',
  'JYSK SARAJEVO',
  'DELHAIZE IDEA',
  'BOOKING.COM',
  'AIRBNB * RESERVATION',
  'UBER TRIP',
  'AMAZON EU SARL',
  'APPLE.COM/BILL',
  'GLS SHIPPING',
  'BOSNA OSIGURANJE',
];

function formatMinorToDisplay(amountMinor, currency) {
  const sign = amountMinor < 0 ? '-' : '+';
  const absolute = Math.abs(amountMinor);
  const major = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${sign}${String(major)},${fraction} ${currency}`;
}

function pickDescription(bankIdx, statementIdx, txIdx) {
  const index = (bankIdx * 17 + statementIdx * 13 + txIdx * 7) % DESCRIPTIONS.length;
  return DESCRIPTIONS[index];
}

function buildTransactions(bankIdx, statementIdx, period, currency) {
  const volumeByStatement = [8, 12, 16, 21, 27];
  const txCount = volumeByStatement[statementIdx] ?? 10;
  const transactions = [];
  const month = Number(period.start.slice(5, 7));

  for (let i = 0; i < txCount; i++) {
    const day = ((i * 3 + bankIdx * 2 + statementIdx) % 27) + 1;
    const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const base = 1000 + ((bankIdx + 1) * 137 + i * 41 + statementIdx * 53);
    const amountMinor = i % 5 === 0 ? base * 3 : -base;
    const description = pickDescription(bankIdx, statementIdx, i);
    const reference = i % 3 === 0 ? `REF-${bankIdx + 1}${statementIdx + 1}${String(i + 1).padStart(2, '0')}` : null;
    transactions.push({
      date,
      amountMinor,
      currency,
      description,
      reference,
    });
  }

  return transactions;
}

async function writeStatementPdf({
  pdfPath,
  bankLabel,
  statementName,
  period,
  currency,
  transactions,
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const lines = [
    `${bankLabel} - Izvod racuna (ANONIMIZIRAN DATASET)`,
    `Statement: ${statementName}`,
    `Period: ${period.start} do ${period.end}`,
    `Valuta: ${currency}`,
    '---',
    'Datum | Opis | Iznos | Referenca',
    ...transactions.map((tx) => {
      const ref = tx.reference ?? '-';
      return `${tx.date} | ${tx.description} | ${formatMinorToDisplay(tx.amountMinor, tx.currency)} | ${ref}`;
    }),
    '---',
    'Napomena: Ovo je sintetski testni izvod bez PII podataka.',
  ];

  let page = pdf.addPage([595, 842]);
  let y = 800;

  for (const line of lines) {
    if (y < 60) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    page.drawText(line, {
      x: 40,
      y,
      size: 10,
      font: line.startsWith('Datum |') || line.includes('ANONIMIZIRAN') ? bold : regular,
      color: rgb(0.12, 0.12, 0.12),
      maxWidth: 510,
    });
    y -= 18;
  }

  const bytes = await pdf.save();
  await writeFile(pdfPath, bytes);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  let generated = 0;
  for (let bankIdx = 0; bankIdx < BANKS.length; bankIdx++) {
    const bank = BANKS[bankIdx];
    for (let statementIdx = 0; statementIdx < PERIODS.length; statementIdx++) {
      const sequence = String(statementIdx + 1).padStart(2, '0');
      const baseName = `${bank.key}-${sequence}`;
      const pdfPath = path.join(outDir, `${baseName}.pdf`);
      const expectedPath = path.join(outDir, `${baseName}.expected.json`);
      const period = PERIODS[statementIdx];
      const transactions = buildTransactions(bankIdx, statementIdx, period, bank.currency);

      await writeStatementPdf({
        pdfPath,
        bankLabel: bank.label,
        statementName: baseName,
        period,
        currency: bank.currency,
        transactions,
      });

      const expected = {
        statementId: baseName,
        bank: bank.key,
        periodStart: period.start,
        periodEnd: period.end,
        currency: bank.currency,
        transactions,
      };
      await writeFile(expectedPath, `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
      generated++;
    }
  }

  console.log(`Generated ${String(generated)} golden statements in ${outDir}`);
}

main().catch((error) => {
  console.error('Failed to generate parser golden dataset:', error);
  process.exitCode = 1;
});
