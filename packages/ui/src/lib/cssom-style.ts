import type { CSSProperties } from 'react';

/**
 * Style calculé posé par le CSSOM après montage, et non par un attribut `style` dans le HTML du
 * serveur : la CSP des applications (nonce, sans `'unsafe-inline'`) bloque ces attributs, pas les
 * modifications de `element.style` (lot 1.6). À réserver aux valeurs continues (largeur, délai) ;
 * le rendu serveur montre l'état de repli défini par les classes.
 */
export function cssomStyle(style: CSSProperties): (element: HTMLElement | null) => void {
  return (element) => {
    if (element) Object.assign(element.style, style);
  };
}
