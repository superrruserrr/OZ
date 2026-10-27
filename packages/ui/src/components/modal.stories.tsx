import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from './button.js';
import { Field } from './field.js';
import { Modal, type ModalProps } from './modal.js';

const labels = { cancelLabel: 'Annuler', closeLabel: 'Fermer' };

function Demo(
  props: Partial<Pick<ModalProps, 'onSubmit' | 'error'>> & { initiallyOpen?: boolean },
) {
  const [open, setOpen] = useState(props.initiallyOpen ?? true);
  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        Inviter un tuteur
      </Button>
      <Modal
        name="guardian-invite"
        title="Inviter un tuteur"
        description="Il recevra un lien d'autorisation valable 72 heures."
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        {...labels}
        {...(props.error === undefined ? {} : { error: props.error })}
        {...(props.onSubmit
          ? {
              onSubmit: props.onSubmit,
              submitLabel: 'Envoyer',
              submitErrorMessage: "L'envoi a échoué. Réessayez dans un instant.",
            }
          : {})}
      >
        <Field
          id="guardian-email"
          name="email"
          type="email"
          label="E-mail du tuteur"
          defaultValue="tuteur@example.test"
        />
      </Modal>
    </>
  );
}

const meta = {
  title: 'Composants/Modale',
  component: Modal,
  parameters: {
    docs: {
      description: {
        component:
          'Radix Dialog avec les props imposées (`open`, `onClose`, `onSubmit`, `title`) : piège du focus, Échap et clic extérieur ferment, le focus revient au déclencheur. Un rejet de `onSubmit` garde la modale ouverte avec un message.',
      },
      story: { inline: false, height: '420px' },
    },
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

// Les props passent par le composant de démonstration, qui gère l'état `open`.
const demoArgs = {
  open: true,
  onClose: fn(),
  title: 'Inviter un tuteur',
  name: 'guardian-invite',
  ...labels,
};

export const Ouverte: Story = {
  args: demoArgs,
  render: () => <Demo onSubmit={() => new Promise((resolve) => setTimeout(resolve, 800))} />,
};

export const Chargement: Story = {
  args: demoArgs,
  render: () => <Demo onSubmit={() => new Promise<void>(() => undefined)} />,
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByTestId('modal-guardian-invite-submit'));
    await expect(body.getByTestId('modal-guardian-invite-submit')).toHaveAttribute(
      'aria-busy',
      'true',
    );
  },
};

export const Erreur: Story = {
  args: demoArgs,
  render: () => <Demo onSubmit={() => Promise.reject(new Error('demo'))} />,
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByTestId('modal-guardian-invite-submit'));
    await expect(await body.findByRole('alert')).toHaveTextContent("L'envoi a échoué");
    await expect(body.getByTestId('modal-guardian-invite-submit')).toBeEnabled();
  },
};

export const EchapEtRetourDuFocus: Story = {
  name: 'Échap et retour du focus',
  args: demoArgs,
  render: () => <Demo initiallyOpen={false} />,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Inviter un tuteur' });
    await userEvent.click(trigger);
    await within(document.body).findByRole('dialog', { name: 'Inviter un tuteur' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await expect(trigger).toHaveFocus();
  },
};
