import Image from 'next/image';

/**
 * Avatar d'un joueur (lot 1.5dc) : sa propre photo de profil quand l'API la rend au lecteur (lot
 * 1.19ch), sinon ses initiales ; un profil ne reçoit jamais le visage d'une autre personne.
 */
export function PlayerAvatar({
  firstName,
  lastName,
  size = 'md',
  photoSrc = null,
}: {
  firstName?: string | undefined;
  lastName?: string | undefined;
  size?: 'md' | 'lg';
  /** Photo de profil du joueur lui-même (lot 1.19ch), relayée par le site ; sinon les initiales. */
  photoSrc?: string | null;
}) {
  if (photoSrc && size === 'lg') {
    return (
      <Image
        src={photoSrc}
        alt=""
        width={96}
        height={96}
        unoptimized
        data-testid="player-avatar"
        className="size-24 shrink-0 rounded-3xl border border-oz-primary/35 object-cover"
      />
    );
  }
  const initials = `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase();
  return (
    <span
      aria-hidden="true"
      data-testid="player-avatar"
      className={
        size === 'lg'
          ? 'grid size-24 shrink-0 place-items-center rounded-3xl border border-oz-primary/35 bg-oz-primary/8 font-display text-3xl font-medium text-oz-primary'
          : 'grid size-12 shrink-0 place-items-center rounded-2xl border border-oz-border bg-oz-surface-2 font-display text-base font-medium text-oz-primary'
      }
    >
      {initials}
    </span>
  );
}
