import type { ReactNode } from 'react';
import { AuthFrame } from '../../../auth/auth-frame';

/** Écrans de compte (lot 1.7ca, refonte 1.5cbb) : coquille « sport » avec accroche (D1). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthFrame aside>{children}</AuthFrame>;
}
