import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Modal, type ModalProps } from './modal.js';

const labels = { cancelLabel: 'Annuler', closeLabel: 'Fermer' };
const submit = { submitLabel: 'Envoyer', submitErrorMessage: "L'envoi a échoué. Réessayez." };

function Harness(props: Pick<ModalProps, 'onSubmit'>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Inviter
      </button>
      <Modal
        name="guardian-invite"
        title="Inviter un gardien"
        description="Il recevra un lien valable 72 heures."
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        {...labels}
        {...(props.onSubmit ? { ...submit, onSubmit: props.onSubmit } : {})}
      >
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" defaultValue="gardien@example.test" />
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('titre et description reliés, data-testid transmis', async () => {
    render(<Harness onSubmit={() => Promise.resolve()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Inviter' }));
    const dialog = screen.getByRole('dialog', { name: 'Inviter un gardien' });
    expect(dialog.dataset.testid).toBe('modal-guardian-invite');
    expect(screen.getByText('Il recevra un lien valable 72 heures.').id).toBe(
      dialog.getAttribute('aria-describedby'),
    );
    expect(screen.getByTestId('modal-guardian-invite-submit').textContent).toContain('Envoyer');
  });

  it("sans onSubmit : modale informative, pas de bouton d'envoi", () => {
    render(<Modal name="x" title="T" open onClose={vi.fn()} {...labels} />);
    expect(screen.queryByTestId('modal-x-submit')).toBeNull();
  });

  it('Échap ferme la modale et rend le focus au déclencheur', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal name="x" title="T" open onClose={onClose} {...labels} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Inviter' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('bouton Annuler et croix de fermeture appellent onClose', async () => {
    const onClose = vi.fn();
    render(<Modal name="x" title="T" open onClose={onClose} {...labels} />);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('soumission : valeurs du formulaire transmises, bouton en chargement, fermeture au succès', async () => {
    let resolve: () => void = () => undefined;
    const onSubmit = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Inviter' }));
    await userEvent.click(screen.getByTestId('modal-guardian-invite-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ email: 'gardien@example.test' });
    expect(screen.getByTestId('modal-guardian-invite-submit').getAttribute('aria-busy')).toBe(
      'true',
    );
    resolve();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('soumission rejetée : reste ouverte, erreur affichée, bouton de nouveau actif', async () => {
    const onSubmit = vi.fn(() => Promise.reject(new Error('détail technique')));
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Inviter' }));
    await userEvent.click(screen.getByTestId('modal-guardian-invite-submit'));
    expect((await screen.findByRole('alert')).textContent).toBe("L'envoi a échoué. Réessayez.");
    expect(screen.queryByText('détail technique')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
    const submit = screen.getByTestId<HTMLButtonElement>('modal-guardian-invite-submit');
    expect(submit.disabled).toBe(false);
    expect(submit.dataset.state).toBe('active');
  });

  it('erreur fournie par le parent : affichée en alerte', () => {
    render(<Modal name="x" title="T" open onClose={vi.fn()} error="Lien expiré." {...labels} />);
    expect(screen.getByRole('alert').textContent).toBe('Lien expiré.');
  });
});
