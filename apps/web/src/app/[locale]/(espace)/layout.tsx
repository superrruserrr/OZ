import type { ReactNode } from 'react';
import { EspaceShell } from '../../../espace/espace-ui';

/**
 * Espace du joueur (lot 1.19b) : coquille à rail, gardée par `proxy.ts` (ADR-010) ; l'API refait
 * ses contrôles à chaque appel. Jamais indexé.
 */
export default function EspaceLayout({ children }: { children: ReactNode }) {
  return <EspaceShell>{children}</EspaceShell>;
}
