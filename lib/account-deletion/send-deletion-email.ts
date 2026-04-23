const DELETION_EMAIL_SUBJECT = 'Potvrda brisanja naloga — Konto';

function buildDeletionEmailBody(cancelUrl: string): { text: string; html: string } {
  const text = `Zdravo,

Zatražio si brisanje tvog Konto naloga. Za 30 dana će se podaci trajno obrisati.

Ako si se predomislio, klikni ovdje da otkažeš brisanje (link važi 24 sata):

${cancelUrl}

Ako nisi ti zatražio, odmah klikni gore i javi nam.

Konto tim`;

  const html = `<p>Zdravo,</p>
<p>Zatražio si brisanje tvog Konto naloga. Za 30 dana će se podaci trajno obrisati.</p>
<p>Ako si se predomislio, klikni ovdje da otkažeš brisanje (link važi 24 sata):</p>
<p><a href="${escapeHtml(cancelUrl)}">Otkaži brisanje</a></p>
<p>Ako nisi ti zatražio, odmah klikni gore i javi nam.</p>
<p>Konto tim</p>`;

  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export type SendDeletionEmailResult = { ok: true } | { ok: false; error: 'NOT_CONFIGURED' | 'SEND_FAILED' };

/**
 * Transactional email via Resend. Requires RESEND_API_KEY and RESEND_FROM_EMAIL (verified domain).
 */
export async function sendAccountDeletionEmail(to: string, cancelUrl: string): Promise<SendDeletionEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error('account_deletion_email_not_configured');
    return { ok: false, error: 'NOT_CONFIGURED' };
  }

  const { text, html } = buildDeletionEmailBody(cancelUrl);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: DELETION_EMAIL_SUBJECT,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('account_deletion_email_send_failed', { status: res.status, body: body.slice(0, 200) });
    return { ok: false, error: 'SEND_FAILED' };
  }

  return { ok: true };
}
