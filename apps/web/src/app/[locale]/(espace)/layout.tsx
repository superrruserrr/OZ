import type { ReactNode } from 'react';
import { EspaceShell } from '../../../espace/espace-shell';
import { listOwnPhotos } from '../../../espace/photo-actions';
import { readOwnPlayer } from '../../../players/players-api';

/** Initiales de l'avatar ; rien si la fiche n'est pas lisible (chaque page refait sa garde). */
async function ownInitials(): Promise<string | null> {
  const own = await readOwnPlayer();
  if (own.kind !== 'ok') return null;
  const letters = [own.data.firstName, own.data.lastName]
    .map((part) => part?.trim().charAt(0).toUpperCase() ?? '')
    .join('');
  return letters || null;
}

/**
 * Espace du joueur (lot 1.19b, maquette v2) : coquille à rail, gardée par `proxy.ts` (ADR-010) ;
 * l'API refait ses contrôles à chaque appel. Jamais indexé.
 */
export default async function EspaceLayout({ children }: { children: ReactNode }) {
  const [initials, photos] = await Promise.all([ownInitials(), listOwnPhotos()]);
  // Photo de profil saine (lot 1.19cd) ; sans galerie lisible, les initiales.
  const photoId = photos.ok
    ? (photos.gallery.items.find((photo) => photo.isProfile && photo.status === 'clean')?.id ??
      null)
    : null;
  return (
    <EspaceShell initials={initials} photoId={photoId}>
      {children}
    </EspaceShell>
  );
}
