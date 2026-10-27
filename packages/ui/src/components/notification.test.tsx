import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Notification, NotificationProvider, type NotificationTone } from './notification.js';

function show(tone: NotificationTone, onOpenChange = vi.fn()) {
  render(
    <NotificationProvider label="Notifications">
      <Notification
        open
        onOpenChange={onOpenChange}
        tone={tone}
        title="Profil enregistré"
        description="Vos modifications sont visibles."
        closeLabel="Fermer la notification"
      />
    </NotificationProvider>,
  );
  return onOpenChange;
}

describe('Notification', () => {
  it('ton et data-testid exposés, région nommée', () => {
    show('success');
    expect(screen.getByTestId('notification-success').dataset.tone).toBe('success');
    expect(screen.getByRole('region', { name: /Notifications/ })).toBeTruthy();
  });

  it.each([
    ['error', 'assertive'],
    ['info', 'polite'],
    ['success', 'polite'],
  ] as const)('ton %s annoncé en %s', async (tone, politeness) => {
    show(tone);
    await waitFor(() => {
      const live = document.querySelector(`[aria-live="${politeness}"]`);
      expect(live?.textContent).toContain('Profil enregistré');
    });
  });

  it('bouton de fermeture nommé, ferme la notification', async () => {
    const onOpenChange = show('info');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer la notification' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
