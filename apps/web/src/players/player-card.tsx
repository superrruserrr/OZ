import { Badge, SportTag } from '@oz/ui';
import type { PlayerProfileOutput } from '@oz/contracts';
import { Link } from '../i18n/navigation';
import { CountryFlag } from './country';
import { PlayerAvatar } from './player-avatar';

export interface PlayerCardLabels {
  readonly sport: string;
  readonly open: string;
  readonly born: string | null;
  readonly position: string | null;
  readonly country: string | null;
  readonly level: string | null;
}

/**
 * Ligne d'annuaire (lot 1.5dc) : avatar en initiales, nom, sport, poste, pays avec drapeau, niveau de
 * vérification. Lien étiré : le nom est le lien. Aucune note ni classement (Q18) ; les champs que
 * l'API ne rend pas à ce lecteur ne sont pas affichés.
 */
export function PlayerCard({
  player,
  labels,
}: {
  player: PlayerProfileOutput;
  labels: PlayerCardLabels;
}) {
  if (!player.ozId) return null;
  const name = [player.firstName, player.lastName].filter(Boolean).join(' ');
  return (
    <article
      data-testid="player-card"
      className="group relative flex min-w-0 items-center gap-4 rounded-2xl border border-oz-border bg-oz-surface-1 p-4 transition-[border-color,background-color] duration-200 hover:border-oz-primary/40 hover:bg-oz-surface-2 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-oz-primary-bright"
    >
      <PlayerAvatar firstName={player.firstName} lastName={player.lastName} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-base font-medium text-oz-text">
          <Link
            href={`/joueur/${player.ozId}`}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          >
            {name || player.ozId}
          </Link>
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-oz-text-muted">
          {labels.position ? <span>{labels.position}</span> : null}
          {labels.born ? <span>{labels.born}</span> : null}
          {player.country && labels.country ? (
            <span className="inline-flex items-center gap-1.5">
              <CountryFlag code={player.country} />
              {labels.country}
            </span>
          ) : null}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SportTag sport="football" label={labels.sport} />
          {labels.level ? (
            <Badge tone={player.verificationLevel === 2 ? 'verified' : 'neutral'} filled>
              {labels.level}
            </Badge>
          ) : null}
        </div>
      </div>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        className="size-4 shrink-0 text-oz-text-muted transition-transform duration-200 group-hover:text-oz-primary motion-safe:group-hover:translate-x-0.5"
      >
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    </article>
  );
}
