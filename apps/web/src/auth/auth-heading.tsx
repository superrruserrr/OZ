import { Kicker, SplitHeading } from '@oz/ui';
import type { ReactNode } from 'react';

export interface AuthHeadingProps {
  readonly kicker: string;
  readonly title: string;
  /** Fin du titre mise en valeur (grand texte seulement). */
  readonly highlight?: string | undefined;
  readonly lead?: ReactNode;
  readonly tone?: 'primary' | 'highlight' | 'accent' | undefined;
}

/** En-tête des écrans de compte (lot 1.5cbb) : libellé à puce, titre scindé `h1`, accroche. */
export function AuthHeading({ kicker, title, highlight, lead, tone }: AuthHeadingProps) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Kicker tone={tone}>{kicker}</Kicker>
      <SplitHeading as="h1" size="section" lead={title} highlight={highlight} />
      {lead ? <p className="text-oz-text-muted">{lead}</p> : null}
    </div>
  );
}
