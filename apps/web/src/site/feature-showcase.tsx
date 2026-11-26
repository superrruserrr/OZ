import { Kicker, SplitHeading } from '@oz/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/*
 * Vitrine des fonctionnalités de l'accueil (2026-11-18) : six « captures » dessinées avec les jetons
 * du site, chacune marquée « Exemple » (aucune donnée réelle ni chiffre présenté comme vrai, Q18).
 * Animations CSS seulement (`transform`, `opacity`, largeur de barre), en `motion-safe` ; aucun
 * script, aucune image téléchargée.
 */

const FEATURES = ['signup', 'ozId', 'dashboard', 'visibility', 'guardian', 'data'] as const;
const SOON = ['performances', 'videos', 'messages', 'directory'] as const;

function Capture({
  title,
  text,
  example,
  index,
  children,
}: {
  readonly title: string;
  readonly text: string;
  readonly example: string;
  readonly index: number;
  readonly children: ReactNode;
}) {
  return (
    <li
      className="group flex min-w-0 flex-col gap-4 motion-safe:animate-oz-rise"
      data-testid="home-feature"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border border-oz-border bg-oz-surface-1 shadow-[0_0_0_1px_transparent] transition-[border-color,transform] duration-300 group-hover:border-oz-primary/40 motion-safe:group-hover:-translate-y-1 ${DELAYS[index % DELAYS.length] ?? ''}`}
      >
        <div
          className="flex items-center gap-1.5 border-b border-oz-border px-4 py-2.5"
          aria-hidden="true"
        >
          <span className="size-2 rounded-full bg-oz-text-disabled" />
          <span className="size-2 rounded-full bg-oz-text-disabled" />
          <span className="size-2 rounded-full bg-oz-primary" />
          <span className="ml-auto rounded-full border border-oz-border px-2 py-0.5 text-[11px] text-oz-text-label">
            {example}
          </span>
        </div>
        <div className="flex h-44 flex-col justify-center gap-3 px-5" aria-hidden="true">
          {children}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-oz-text">{title}</h3>
        <p className="text-sm text-oz-text-muted">{text}</p>
      </div>
    </li>
  );
}

const DELAYS = [
  'motion-safe:[animation-delay:0ms]',
  'motion-safe:[animation-delay:80ms]',
  'motion-safe:[animation-delay:160ms]',
] as const;

const bar = 'h-2 overflow-hidden rounded-full bg-oz-surface-2';
const fill = 'h-full origin-left rounded-full bg-oz-primary motion-safe:animate-oz-grow';

function Mock({
  feature,
  t,
}: {
  readonly feature: (typeof FEATURES)[number];
  readonly t: (key: string) => string;
}) {
  switch (feature) {
    case 'signup':
      return (
        <>
          <div className="flex items-center gap-2">
            {[0, 1, 2, 3].map((step) => (
              <span
                key={step}
                className={`h-1.5 flex-1 rounded-full ${step < 3 ? 'bg-oz-primary' : 'bg-oz-surface-2'} motion-safe:animate-oz-grow`}
              />
            ))}
          </div>
          <div className="h-9 rounded-lg border border-oz-border bg-oz-surface-input" />
          <div className="h-9 rounded-lg border border-oz-border bg-oz-surface-input" />
          <div className="h-9 w-2/3 rounded-full bg-oz-primary/90" />
        </>
      );
    case 'ozId':
      return (
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-oz-text-label">{t('mock.ozIdLabel')}</span>
            <span className="font-mono text-sm text-oz-primary">{t('mock.ozIdSample')}</span>
            <span className="h-2 w-24 rounded-full bg-oz-surface-2" />
          </div>
          <svg
            viewBox="0 0 7 7"
            className="size-20 rounded-lg bg-white p-1.5 motion-safe:animate-oz-breathe"
          >
            {[
              [0, 0],
              [1, 0],
              [2, 0],
              [0, 1],
              [2, 1],
              [0, 2],
              [1, 2],
              [2, 2],
              [4, 0],
              [5, 0],
              [6, 0],
              [4, 1],
              [6, 1],
              [4, 2],
              [5, 2],
              [6, 2],
              [0, 4],
              [1, 4],
              [2, 4],
              [0, 5],
              [2, 5],
              [0, 6],
              [1, 6],
              [2, 6],
              [4, 4],
              [6, 4],
              [5, 5],
              [4, 6],
              [6, 6],
              [3, 3],
            ].map(([x, y]) => (
              <rect
                key={`${String(x)}-${String(y)}`}
                x={x}
                y={y}
                width="1"
                height="1"
                fill="var(--oz-bg)"
              />
            ))}
          </svg>
        </div>
      );
    case 'dashboard':
      return (
        <>
          <div className="flex items-center justify-between">
            <span className="h-3 w-28 rounded-full bg-oz-text/80" />
            <span className="h-3 w-10 rounded-full bg-oz-primary" />
          </div>
          <div className={bar}>
            <div className={`${fill} w-4/5`} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((cell) => (
              <span
                key={cell}
                className="h-12 rounded-lg border border-oz-border bg-oz-surface-2"
              />
            ))}
          </div>
        </>
      );
    case 'visibility':
      return (
        <>
          {[true, false, true].map((on, row) => (
            <div
              key={row}
              className="flex items-center justify-between rounded-lg border border-oz-border px-3 py-2"
            >
              <span className="h-2.5 w-24 rounded-full bg-oz-text/60" />
              <span
                className={`flex h-5 w-9 items-center rounded-full p-0.5 ${on ? 'justify-end bg-oz-primary' : 'bg-oz-surface-2'}`}
              >
                <span className="size-4 rounded-full bg-oz-bg motion-safe:animate-oz-breathe" />
              </span>
            </div>
          ))}
        </>
      );
    case 'guardian':
      return (
        <div className="flex flex-col gap-3 rounded-xl border border-oz-legal-border bg-oz-legal-bg p-4">
          <span className="text-sm font-medium text-oz-legal-text">{t('mock.consent')}</span>
          <span className="h-2 w-full rounded-full bg-oz-legal-border" />
          <span className="h-2 w-3/4 rounded-full bg-oz-legal-border" />
          <span className="flex items-center gap-2 text-sm text-oz-legal-text">
            <svg
              viewBox="0 0 20 20"
              className="size-5 rounded-full bg-oz-legal p-1 text-oz-bg motion-safe:animate-oz-rise"
              fill="none"
            >
              <path
                d="M5 10l3 3 7-7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            {t('mock.consentGiven')}
          </span>
        </div>
      );
    case 'data':
      return (
        <div className="grid grid-cols-2 gap-3">
          {[t('mock.export'), t('mock.delete')].map((label) => (
            <span
              key={label}
              className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-oz-border bg-oz-surface-2 text-sm text-oz-text-muted"
            >
              <span className="size-6 rounded-full border-2 border-oz-primary motion-safe:animate-oz-breathe" />
              {label}
            </span>
          ))}
        </div>
      );
  }
}

export function FeatureShowcase() {
  const t = useTranslations('home.features');
  return (
    <section
      aria-label={t('kicker')}
      className="mt-20 scroll-mt-24"
      id="fonctionnalites"
      data-testid="home-features"
    >
      <Kicker>{t('kicker')}</Kicker>
      <SplitHeading as="h2" lead={t('title')} highlight={t('titleHighlight')} className="mt-3" />
      <p className="mt-3 max-w-2xl text-oz-text-muted">{t('lead')}</p>
      <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Capture
            key={feature}
            index={index}
            title={t(`items.${feature}.title`)}
            text={t(`items.${feature}.text`)}
            example={t('example')}
          >
            <Mock feature={feature} t={(key) => t(key)} />
          </Capture>
        ))}
      </ul>
      <div
        className="mt-10 flex flex-col gap-3 rounded-2xl border border-dashed border-oz-border p-5"
        data-testid="home-soon"
      >
        <p className="text-sm font-medium text-oz-text">{t('soonTitle')}</p>
        <ul className="flex flex-wrap gap-2">
          {SOON.map((item) => (
            <li
              key={item}
              className="rounded-full border border-oz-border px-3 py-1.5 text-sm text-oz-text-muted"
            >
              {t(`soon.${item}`)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
