import localFont from 'next/font/local';

/*
 * Texte et titres : pile système type Helvetica (ADR-012), aucun fichier servi. Seule JetBrains Mono
 * (OZ ID, codes) est auto-hébergée (design.md §8.5, R12), fichiers Fontsource, latin et latin-ext.
 * Une famille par sous-ensemble, chacune limitée par `unicode-range` : le navigateur ne télécharge
 * latin-ext que si la page contient un caractère hors latin. `--oz-font-*` (base.css) enchaîne latin
 * puis latin-ext ; le repli ajusté (moins de décalage au chargement) vient en dernier. next/font exige
 * des littéraux : les plages sont répétées volontairement.
 */

export const jetbrainsMonoLatin = localFont({
  src: '../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--oz-font-jetbrains-mono-latin',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    },
  ],
});

export const jetbrainsMonoLatinExt = localFont({
  src: '../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Arial',
  variable: '--oz-font-jetbrains-mono-latin-ext',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    },
  ],
});

/** Classes à poser sur `<html>` : déclarent les variables `--oz-font-*-latin(-ext)`. */
export const fontVariables = [jetbrainsMonoLatin.variable, jetbrainsMonoLatinExt.variable].join(
  ' ',
);
