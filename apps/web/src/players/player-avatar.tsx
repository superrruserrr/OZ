/**
 * Avatar d'un joueur (lot 1.5dc) : initiales sur une pastille, jamais une photo — le dépôt de photos
 * n'existe pas encore (D-131) et un profil ne reçoit jamais le visage d'une autre personne.
 */
export function PlayerAvatar({
  firstName,
  lastName,
  size = 'md',
}: {
  firstName?: string | undefined;
  lastName?: string | undefined;
  size?: 'md' | 'lg';
}) {
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
