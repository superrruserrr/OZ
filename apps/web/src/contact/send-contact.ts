'use server';

import { sendContactMessageSchema } from '@oz/contracts';

export type SendContactResult = { ok: true } | { ok: false };

/*
 * Action serveur du formulaire de contact (lot 1.6, D4) : revalide avec le schéma partagé (C2) et
 * transmet à l'API (`API_URL/contact`) côté serveur, ce qui garde `connect-src 'self'`. Aucun détail
 * d'erreur n'est renvoyé au navigateur.
 */
export async function sendContact(input: unknown): Promise<SendContactResult> {
  const parsed = sendContactMessageSchema.safeParse(input);
  const base = process.env.API_URL;
  if (!parsed.success || !base) return { ok: false };
  try {
    const response = await fetch(new URL('/contact', base), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    return response.ok ? { ok: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}
