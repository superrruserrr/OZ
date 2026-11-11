import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdSlot, MediaFrame } from './media-frame.js';

describe('MediaFrame', () => {
  it.each([
    ['4:5', 'aspect-[4/5]'],
    ['16:9', 'aspect-video'],
    ['1:1', 'aspect-square'],
    ['9:16', 'aspect-[9/16]'],
  ] as const)('ratio %s', (ratio, className) => {
    render(<MediaFrame ratio={ratio} />);
    expect(screen.getByTestId('media-frame').className).toContain(className);
  });

  it('repli hachuré sans image, image fournie sinon (alt de l’appelant)', () => {
    const { rerender } = render(<MediaFrame ratio="1:1" />);
    expect(screen.getByTestId('media-frame').className).toContain('repeating-linear-gradient');
    rerender(
      <MediaFrame ratio="1:1">
        <img src="/photo.jpg" alt="Portrait du joueur" />
      </MediaFrame>,
    );
    expect(screen.getByRole('img', { name: 'Portrait du joueur' })).toBeTruthy();
    expect(screen.getByTestId('media-frame').className).not.toContain('repeating-linear-gradient');
  });

  it('texte superposé et pastille affichés', () => {
    render(<MediaFrame ratio="4:5" tag="N° 4" overlay={<p>Prénom Nom</p>} />);
    expect(screen.getByTestId('media-frame').textContent).toContain('N° 4');
    expect(screen.getByText('Prénom Nom')).toBeTruthy();
  });
});

describe('AdSlot', () => {
  it.each(['leaderboard', 'mpu', 'mobile'] as const)(
    'format %s toujours marqué « Sponsorisé »',
    (format) => {
      render(<AdSlot format={format} sponsoredLabel="Sponsorisé" />);
      const slot = screen.getByRole('complementary', { name: 'Sponsorisé' });
      expect(slot.textContent).toContain('Sponsorisé');
      expect(slot.dataset.format).toBe(format);
    },
  );

  it('n’exécute aucun script et ne pose aucun style', () => {
    const { container } = render(<AdSlot format="mpu" sponsoredLabel="Sponsorisé" />);
    expect(container.querySelector('script, iframe, [style]')).toBeNull();
  });
});
