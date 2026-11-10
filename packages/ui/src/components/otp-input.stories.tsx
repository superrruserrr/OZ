import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { OtpInput } from './otp-input.js';

const meta = {
  title: 'Composants/Code à 6 chiffres',
  component: OtpInput,
  args: {
    id: 'otp',
    testId: 'auth-otp',
    label: 'Code reçu par SMS',
    digitLabel: (n: number, total: number) => `Chiffre ${String(n)} sur ${String(total)}`,
    onComplete: () => undefined,
    resendLabel: 'Renvoyer dans 42 s',
    resendDisabled: true,
    onResend: () => undefined,
  },
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
          'Écran 04 : chiffres seuls, case suivante automatique, collage, `one-time-code`. E8 : case active en vert ; erreur = contour rouge et secousse (contour seul avec mouvement réduit). Le décompte du renvoi est piloté par l’écran.',
      },
    },
  },
} satisfies Meta<typeof OtpInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Repos: Story = {};
export const Saisie: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('auth-otp-digit-1'));
    await userEvent.keyboard('123');
    await expect(canvas.getByTestId('auth-otp-digit-4')).toHaveFocus();
  },
};
export const Erreur: Story = { args: { error: 'Code incorrect. Vérifiez le SMS.' } };
export const RenvoiDisponible: Story = {
  name: 'Renvoi disponible',
  args: { resendLabel: 'Renvoyer le code', resendDisabled: false },
};
export const Desactive: Story = { name: 'Désactivé', args: { disabled: true } };
