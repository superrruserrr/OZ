import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdSlot, MediaFrame } from './media-frame.js';

/* Kit de cadres (lot 1.5cc, ADR-012) : photo, vidéo, publicité ; aucun script tiers. */
const meta = {
  title: 'Workspace/Cadres',
  component: MediaFrame,
  args: { ratio: '4:5' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MediaFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Portrait: Story = {
  args: { tag: 'N° [n]', overlay: <p className="font-medium">[Prénom Nom]</p> },
};
export const Formats: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3">
      <MediaFrame ratio="1:1" />
      <MediaFrame ratio="4:5" />
      <MediaFrame ratio="9:16" />
      <MediaFrame ratio="16:9" />
    </div>
  ),
};
export const Publicites: Story = {
  name: 'Publicités',
  render: () => (
    <div className="flex flex-col gap-3">
      <AdSlot format="mpu" sponsoredLabel="Sponsorisé" placeholder="Espace partenaire" />
      <AdSlot format="mobile" sponsoredLabel="Sponsorisé" />
    </div>
  ),
};
