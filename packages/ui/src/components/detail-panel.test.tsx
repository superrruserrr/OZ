import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DetailPanel } from './detail-panel.js';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Ouvrir
      </button>
      <DetailPanel
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Profil sportif"
        closeLabel="Fermer"
      >
        <p>Défenseur central</p>
      </DetailPanel>
    </>
  );
}

describe('DetailPanel (lot 1.5dc)', () => {
  it('s’ouvre au clic, dialogue nommé par son titre', async () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(screen.getByRole('dialog', { name: 'Profil sportif' }).textContent).toContain(
      'Défenseur central',
    );
  });

  it('Échap ferme et rend le focus au déclencheur', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Ouvrir' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('la croix ferme aussi', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
