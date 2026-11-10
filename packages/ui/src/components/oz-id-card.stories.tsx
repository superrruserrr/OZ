import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge.js';
import { OzIdCard } from './oz-id-card.js';

/** QR de démonstration : motif fixe, sans contenu réel. */
const qr = (
  <svg
    viewBox="0 0 7 7"
    className="size-full"
    shapeRendering="crispEdges"
    role="img"
    aria-label="QR de l’OZ ID"
  >
    {[
      [0, 0],
      [1, 0],
      [2, 0],
      [4, 0],
      [6, 0],
      [0, 1],
      [2, 1],
      [5, 1],
      [0, 2],
      [1, 2],
      [2, 2],
      [4, 2],
      [6, 2],
      [3, 3],
      [5, 3],
      [0, 4],
      [2, 4],
      [4, 4],
      [6, 4],
      [1, 5],
      [3, 5],
      [0, 6],
      [2, 6],
      [4, 6],
      [5, 6],
    ].map(([x = 0, y = 0]) => (
      <rect
        key={`${String(x)}-${String(y)}`}
        x={x}
        y={y}
        width="1"
        height="1"
        fill="currentColor"
      />
    ))}
  </svg>
);

const meta = {
  title: 'Composants/Carte OZ ID',
  component: OzIdCard,
  args: {
    name: 'Junior Mbarga',
    ozId: 'OZ-CM-26-7K4M9Q-3',
    ozIdLabel: 'OZ ID',
    details: ['Milieu offensif', '19 ans', 'Cameroun', 'Pied droit'],
    qr,
    badge: <Badge tone="verified">Profil vérifié</Badge>,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Écran 06 : avatar en initiales (sans photo, Q22), OZ ID en mono vert, QR et badge fournis par l’écran. Aucun effet lié à l’âge (EX-T16).',
      },
    },
  },
} satisfies Meta<typeof OzIdCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Verifiee: Story = { name: 'Vérifiée' };
export const EnAttente: Story = {
  name: 'KYC en attente, sans QR',
  args: {
    qr: undefined,
    badge: (
      <Badge tone="kyc" status="kyc-pending">
        KYC en attente
      </Badge>
    ),
  },
};
export const Minimale: Story = { args: { details: [], qr: undefined, badge: undefined } };
