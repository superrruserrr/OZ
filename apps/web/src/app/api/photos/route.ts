import { documentReadOutputSchema } from '@oz/contracts';
import { signupFetch } from '../../../onboarding/signup-api';

/*
 * Relais des photos du joueur (lot 1.19cd) : l'image est lue au nom de l'utilisateur (cookie
 * `HttpOnly`, ADR-010), l'API décide et audite, puis le serveur du site va chercher le fichier par
 * l'URL signée de 5 minutes et le rend depuis la même origine : la CSP (`img-src 'self'`) ne change
 * pas, l'URL signée ne quitte jamais le serveur.
 */

const OZ_ID = /^OZ-[A-Z]{2}-[0-9]{2}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const notFound = () =>
  new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const player = params.get('joueur') ?? '';
  const id = params.get('id') ?? '';
  if (!UUID.test(id) || (player !== 'me' && !OZ_ID.test(player))) return notFound();
  const granted = await signupFetch(`/players/${player}/photos/${id}/url`, { method: 'GET' });
  if (granted === null || !granted.ok) return notFound();
  const target = documentReadOutputSchema.safeParse(granted.data);
  if (!target.success) return notFound();
  try {
    const file = await fetch(target.data.url, {
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    const type = file.headers.get('content-type')?.split(';')[0] ?? '';
    if (!file.ok || !IMAGES.has(type) || file.body === null) return notFound();
    return new Response(file.body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    });
  } catch {
    return notFound();
  }
}
