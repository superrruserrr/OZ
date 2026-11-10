import localFont from 'next/font/local';

/*
 * Back-office : Prompt 400 et 700 seule (charte OZ Football ID, design.md §8.5, ADR-009),
 * sous-ensembles latin et latin-ext auto-hébergés. Le code et les OZ ID retombent sur Prompt
 * (voir @oz/ui/base.css). next/font exige des littéraux.
 */
export const promptLatin = localFont({
  src: [
    {
      path: '../../node_modules/@fontsource/prompt/files/prompt-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../node_modules/@fontsource/prompt/files/prompt-latin-700-normal.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
  variable: '--oz-font-prompt-latin',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    },
  ],
});

export const promptLatinExt = localFont({
  src: [
    {
      path: '../../node_modules/@fontsource/prompt/files/prompt-latin-ext-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../node_modules/@fontsource/prompt/files/prompt-latin-ext-700-normal.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Arial',
  variable: '--oz-font-prompt-latin-ext',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    },
  ],
});

export const fontVariables = `${promptLatin.variable} ${promptLatinExt.variable}`;
