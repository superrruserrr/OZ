import type { ReactNode } from 'react';
import AuthLayout from '../(auth)/layout';

/** Écrans connectés (lot 1.7ca) : gardés par `proxy.ts` (ADR-010) ; coquille commune aux écrans de compte. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
