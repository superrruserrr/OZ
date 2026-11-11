import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClubCrest } from './club-crest.js';
import { SPORTS, SportIcon, SportTag } from './sport-icon.js';
import { SportLoader } from './sport-loader.js';

/* Kit « sport » (lot 1.5da) : icônes de sports, écussons génériques, chargement animé. */
const meta = {
  title: 'Workspace/Kit sport',
  component: SportLoader,
  args: { label: 'Chargement de la page', variant: 'inline' },
} satisfies Meta<typeof SportLoader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Chargement: Story = {};
export const ChargementBasket: Story = { name: 'Chargement basket', args: { sport: 'basketball' } };
export const Sports: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4 text-oz-text">
        {SPORTS.map((sport) => (
          <SportIcon key={sport} sport={sport} title={sport} className="size-8" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <SportTag sport="football" label="Football" />
        <SportTag sport="basketball" label="Basket" />
        <SportTag sport="tennis" label="Tennis" />
        <SportTag sport="athletics" label="Athlétisme" />
      </div>
    </div>
  ),
};
export const Ecussons: Story = {
  name: 'Écussons',
  render: () => (
    <div className="flex flex-wrap gap-4">
      {['[Académie A]', '[Club B]', '[Centre C]', '[Union D]', '[Étoile E]', '[Racing F]'].map(
        (name) => (
          <ClubCrest key={name} name={name} className="h-14" />
        ),
      )}
    </div>
  ),
};
