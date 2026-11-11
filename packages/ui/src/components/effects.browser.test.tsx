import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import '../../.storybook/storybook.css';
import { AppShell } from './app-shell.js';
import { Button } from './button.js';
import { LivePanel } from './live-panel.js';
import { RoleCard } from './role-card.js';
import { SiteTopbar } from './site-topbar.js';
import { Kicker, SplitHeading } from './sport.js';
import { StadiumHero } from './stadium-hero.js';
import { ValueCard } from './value-card.js';
import { Badge } from './badge.js';
import { FloatingChip, GlassPanel, Halo, OzIdReveal, PitchCircles } from './emotion.js';
import { Callout } from './callout.js';
import { ChoiceCardGroup } from './choice-card.js';
import { DotPagination } from './dot-pagination.js';
import { FilterChip } from './filter-chip.js';
import { MeasureBar } from './measure-bar.js';
import { OtpInput } from './otp-input.js';
import { OzIdCard } from './oz-id-card.js';
import { Skeleton, SkeletonGroup } from './skeleton.js';
import { StepProgress } from './step-progress.js';
import { TabBar } from './tab-bar.js';

// Lot 1.5ba : replis des effets E6 à E9 et E12 à E15 sous `prefers-reduced-motion: reduce`
// (projet `motion`, Chromium), et rendu à 320 px sans défilement horizontal (EX-T22.2).

const MAX_SECONDS = 0.00001;

function seconds(value: string): number[] {
  return value
    .split(',')
    .map((part) => Number.parseFloat(part) * (part.trim().endsWith('ms') ? 0.001 : 1));
}

/** Aucune transition ni animation perceptible sur l'élément et ses pseudo-éléments. */
function expectStill(element: Element) {
  for (const pseudo of [undefined, '::before', '::after']) {
    const style = getComputedStyle(element, pseudo);
    for (const value of [
      ...seconds(style.transitionDuration),
      ...seconds(style.animationDuration),
    ]) {
      expect(value, `${element.tagName} ${pseudo ?? ''}`).toBeLessThanOrEqual(MAX_SECONDS);
    }
  }
}

function allElements(root: Element): Element[] {
  return [root, ...root.querySelectorAll('*')];
}

const SAMPLES: [string, ReactNode][] = [
  [
    'progression (E7)',
    <StepProgress
      key="p"
      step={2}
      total={5}
      label="Étape 2 sur 5"
      backLabel="Retour"
      onBack={() => undefined}
    />,
  ],
  [
    'code (E8)',
    <OtpInput
      key="o"
      id="o"
      label="Code"
      digitLabel={(n) => String(n)}
      onComplete={() => undefined}
      error="Code incorrect"
      resendLabel="Renvoyer dans 42 s"
      resendDisabled
      onResend={() => undefined}
    />,
  ],
  [
    'cartes de choix (E9)',
    <ChoiceCardGroup
      key="c"
      label="Type"
      testId="role-card"
      value="player"
      onValueChange={() => undefined}
      options={[
        { value: 'player', title: 'Joueur', description: 'Je crée mon OZ ID' },
        { value: 'guardian', title: 'Tuteur légal' },
      ]}
    />,
  ],
  [
    'encadré (E6)',
    <Callout key="e" tone="legal" live title="Joueur mineur">
      Un tuteur légal vérifié doit valider.
    </Callout>,
  ],
  [
    'puces',
    <div key="f" className="flex flex-wrap gap-2">
      <FilterChip testId="f1" pressed onRemove={() => undefined} removeLabel="Retirer">
        Milieu offensif
      </FilterChip>
      <FilterChip testId="f2" pressed={false}>
        Gardien
      </FilterChip>
    </div>,
  ],
  [
    'onglets',
    <TabBar
      key="t"
      label="Navigation"
      activeId="a"
      items={['a', 'b', 'c', 'd', 'e'].map((id) => ({
        id,
        label: `Recherche ${id}`,
        href: `#${id}`,
        count: id === 'c' ? 120 : undefined,
      }))}
      countLabel={(n) => `${String(n)} non lus`}
    />,
  ],
  [
    'points (E15)',
    <DotPagination
      key="d"
      count={4}
      index={1}
      label={(n) => String(n)}
      onSelect={() => undefined}
    />,
  ],
  [
    'squelettes (E14)',
    <SkeletonGroup key="s" label="Chargement">
      <Skeleton className="h-4 w-full" />
    </SkeletonGroup>,
  ],
  [
    'mesures (E12)',
    <MeasureBar key="m" label="Sprint 30 m" value={4.3} max={6} unit="s" index={2} />,
  ],
  [
    'badge tampon (E13)',
    <Badge key="b" tone="verified" confirmed animate>
      Profil vérifié
    </Badge>,
  ],
  [
    'carte OZ ID',
    <OzIdCard
      key="z"
      name="Jean-Baptiste Mbarga Essomba"
      ozId="OZ-CM-26-7K4M9Q-3"
      ozIdLabel="OZ ID"
      details={['Milieu offensif', '19 ans', 'Cameroun', 'Pied droit']}
      qr={<span>QR</span>}
      badge={<Badge tone="verified">Profil vérifié</Badge>}
    />,
  ],
  [
    'halo et révélation (E1, E2)',
    <Halo key="h">
      <OzIdCard
        name="Junior"
        ozId="OZ-CM-26-7K4M9Q-3"
        ozIdLabel="OZ ID"
        qr={<span>QR</span>}
        reveal
      />
    </Halo>,
  ],
  ['cercles du terrain (E16)', <PitchCircles key="pc" className="size-40" />],
  ['verre dépoli (E18)', <GlassPanel key="g">Pourquoi OZ</GlassPanel>],
  [
    'puces pays (E20)',
    <div key="fc" className="flex flex-wrap gap-2">
      <FloatingChip index={1}>Cameroun</FloatingChip>
      <FloatingChip index={2}>Sénégal</FloatingChip>
    </div>,
  ],
  [
    'coquille',
    <AppShell
      key="as"
      skipLabel="Aller au contenu"
      header={<span>OZ</span>}
      nav={{
        label: 'Navigation',
        activeId: 'a',
        items: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
          id,
          label: `Onglet ${id}`,
          href: `#${id}`,
        })),
      }}
    >
      <p>Contenu</p>
    </AppShell>,
  ],
  [
    'héros de stade (1.5ca)',
    <StadiumHero
      key="hero"
      copy={
        <>
          <Kicker>Identité football vérifiée</Kicker>
          <SplitHeading as="h1" size="hero" lead="Ton talent," highlight="notre mission." />
          <Button glow>Créer mon compte</Button>
        </>
      }
      aside={
        <LivePanel
          status="Inscriptions bientôt ouvertes"
          title="Chaque profil,"
          highlight="plus de preuves."
          facts={[
            { label: 'Identité', value: 'Vérifiée' },
            { label: 'Mineurs', value: 'Protégés' },
          ]}
        />
      }
    />,
  ],
  [
    'cartes valeur et rôle (1.5ca)',
    <div key="cards" className="grid gap-3">
      <ValueCard href="#" title="Identité vérifiée" cta="Découvrir">
        Un OZ ID unique par joueur.
      </ValueCard>
      <RoleCard href="#" title="Je suis joueur" subtitle="Créer mon OZ ID vérifié" />
    </div>,
  ],
  [
    'barres au défilement (1.5ca)',
    <MeasureBar key="mv" label="Identité" value={3} max={3} valueText="3 niveaux" animateOnView />,
  ],
  [
    'coquille v2 (1.5ca)',
    <AppShell
      key="as2"
      skipLabel="Aller au contenu"
      header={<span>OZ</span>}
      breadcrumb={<span>Espace › Accueil</span>}
      railFooter={<p>Profil</p>}
      nav={{
        label: 'Navigation',
        sectionLabel: 'Pilotage',
        activeId: 'a',
        items: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
          id,
          label: `Onglet ${id}`,
          href: `#${id}`,
        })),
        secondary: { label: 'Réseau', items: [{ id: 'f', label: 'Aide', href: '#f' }] },
      }}
    >
      <p>Contenu</p>
    </AppShell>,
  ],
  [
    'en-tête du site (1.5ca)',
    <SiteTopbar
      key="top"
      brand={<a href="#">OZ Football ID</a>}
      navLabel="Navigation du site"
      links={[{ id: 'pricing', href: '#', label: 'Tarifs' }]}
      actions={<a href="#">Créer un compte</a>}
      menuLabel="Menu"
      closeLabel="Fermer"
    />,
  ],
];

afterEach(() => {
  cleanup();
});

describe('effets du lot 1.5ba avec mouvement réduit', () => {
  it.each(SAMPLES)('%s : aucune animation ni transition perceptible', (_, node) => {
    const { container } = render(<div>{node}</div>);
    for (const element of allElements(container)) expectStill(element);
  });

  it('la pastille cochée et le balayage décoratif sont coupés', async () => {
    render(
      <>
        <ChoiceCardGroup
          label="Type"
          testId="rc"
          value={undefined}
          onValueChange={() => undefined}
          options={[{ value: 'a', title: 'A' }]}
        />
        <Skeleton className="h-4 w-10" />
      </>,
    );
    await userEvent.click(screen.getByTestId('rc-a'));
    const shimmer = document.querySelector('[aria-hidden="true"].relative') as Element;
    expect(getComputedStyle(shimmer, '::after').display).toBe('none');
  });
});

describe('émotion avec mouvement réduit (lot 1.5bb)', () => {
  it('révélation : OZ ID affiché d’emblée ; verre dépoli opaque sans flou', () => {
    render(
      <>
        <OzIdReveal ozId="OZ-CM-26-7K4M9Q-3" />
        <GlassPanel testId="glass">x</GlassPanel>
      </>,
    );
    expect(screen.getByTestId('oz-id-reveal-typed').textContent).toBe('OZ-CM-26-7K4M9Q-3');
    expect(getComputedStyle(screen.getByTestId('glass')).backdropFilter).toBe('none');
  });
});

describe('direction sport avec mouvement réduit (lot 1.5ca)', () => {
  it('barre au défilement : pleine sans attendre ; bouton à halo sans ombre', () => {
    render(
      <>
        <MeasureBar label="Identité" value={1} max={1} animateOnView />
        <Button glow>Créer</Button>
      </>,
    );
    const fill = screen.getByTestId('measure-bar-fill');
    expect(getComputedStyle(fill).animationPlayState).toBe('running');
    expect(getComputedStyle(screen.getByRole('button')).boxShadow).toBe('none');
  });

  it('pastille en direct immobile, panneau sans flou', () => {
    render(<LivePanel status="En direct" title="Titre" />);
    expect(getComputedStyle(screen.getByTestId('live-dot')).animationName).toBe('none');
    expect(getComputedStyle(screen.getByTestId('live-panel')).backdropFilter).toBe('none');
  });
});

describe('largeur minimale 320 px (EX-T22.2)', () => {
  it.each(SAMPLES)('%s : aucun débordement horizontal', (_, node) => {
    render(
      <div
        data-testid="frame"
        style={{ width: '320px', padding: '0 16px', boxSizing: 'border-box', overflow: 'auto' }}
      >
        {node}
      </div>,
    );
    const frame = screen.getByTestId('frame');
    expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
  });
});
