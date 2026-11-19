import type { ReactNode } from 'react';
import { AuthFrame } from '../../../auth/auth-frame';

/**
 * Écrans connectés (lot 1.7ca, refonte 1.5cbb) : gardés par `proxy.ts` (ADR-010) ; même coquille
 * que les écrans de compte, sans accroche (D4), jusqu'aux tableaux de bord à rail (1.13c, 1.7d).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AuthFrame homeHref="/espace">{children}</AuthFrame>;
}
