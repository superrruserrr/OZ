import type { PlayerViewData } from '@oz/auth';
import type { PlayerProfileRecord } from '@oz/db';

// Données d'une fiche avant sérialisation par la vue du lecteur : partagées par la lecture par OZ ID
// (lot 1.13a) et la recherche (lot 1.14a). La vue retient ensuite ses seuls champs (EX-104).

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

export function profileViewData(found: PlayerProfileRecord, phone?: string | null): PlayerViewData {
  return {
    ...found.data,
    id: found.id,
    birthDate: isoDate(found.access.birthDate),
    birthYear: found.access.birthDate.getUTCFullYear(),
    verificationStatus: found.access.verificationStatus,
    verificationLevel: found.kycLevel,
    organizationId: found.access.organizationId,
    ...(phone === undefined ? {} : { phone }),
  };
}
