import type { PitchSpot } from '@oz/ui';
import type { SearchPosition } from './players-api';

/** Clé i18n d'un poste (`onboarding.positions.*`, en camelCase). */
export function positionKey(position: SearchPosition): string {
  return position.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Point du terrain qui illustre un poste (côté droit par convention pour latéral et ailier). */
export const POSITION_SPOTS: Readonly<Record<SearchPosition, PitchSpot>> = {
  goalkeeper: 'GK',
  centre_back: 'CB',
  full_back: 'RB',
  defensive_midfielder: 'DM',
  central_midfielder: 'CM',
  attacking_midfielder: 'AM',
  winger: 'RW',
  striker: 'ST',
};
