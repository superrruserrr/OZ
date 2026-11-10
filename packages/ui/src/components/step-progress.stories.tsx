import type { Meta, StoryObj } from '@storybook/react-vite';
import { StepProgress } from './step-progress.js';

const meta = {
  title: 'Composants/Progression d’étape',
  component: StepProgress,
  args: { step: 2, total: 5, label: 'Étape 2 sur 5', backLabel: 'Retour', onBack: () => undefined },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Retour à gauche, compteur à droite, piste de 3 px. E7 : remplissage animé en 300 ms (transform), saut avec mouvement réduit.',
      },
    },
  },
} satisfies Meta<typeof StepProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnCours: Story = { name: 'En cours' };
export const Debut: Story = {
  name: 'Début, sans retour',
  args: { step: 1, label: 'Étape 1 sur 5', backLabel: undefined },
};
export const Termine: Story = { name: 'Terminé', args: { step: 5, label: 'Étape 5 sur 5' } };
