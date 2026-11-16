import 'server-only';
import { profileQrSvg } from '@oz/core';
import type { PlayerProfileOutput } from '@oz/contracts';
import { Badge, Halo, OzIdCard } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { Link } from '../i18n/navigation';
import { countryName } from '../players/country';
import { positionKey } from '../players/labels';
import { siteUrl } from '../site/metadata';

/**
 * QR du profil en image `data:` (D-133) : généré par le serveur du site avec la même fonction que
 * l'API (`@oz/core`), sans script ni appel du navigateur. L'URL ne porte que l'OZ ID. `null` sans
 * adresse publique utilisable (APP_URL absente ou refusée) : la carte s'affiche sans QR.
 */
export function ownQrDataUri(ozId: string): string | null {
  const base = siteUrl();
  if (base === undefined) return null;
  try {
    const svg = profileQrSvg(ozId, { baseUrl: `${base.origin}/joueur` });
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  } catch {
    return null;
  }
}

export interface OwnCardProps {
  readonly profile: PlayerProfileOutput;
  /** OZ ID rendu par l'API ; l'appelant n'affiche pas la carte sans lui. */
  readonly ozId: string;
  readonly locale: string;
}

/**
 * Carte OZ ID relue après la finalisation (D-133) : OZ ID, nom, badge et QR rendus à partir de
 * `GET /players/me`, donc présents après un rechargement ou une reconnexion. Sans animation de
 * révélation (E2 réservé à la fin de l'inscription).
 */
export async function OwnCard({ profile, ozId, locale }: OwnCardProps) {
  const [t, levels, positions] = await Promise.all([
    getTranslations({ locale, namespace: 'onboarding.ozId' }),
    getTranslations({ locale, namespace: 'players.levels' }),
    getTranslations({ locale, namespace: 'onboarding.positions' }),
  ]);
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const level = profile.verificationLevel;
  const qr = ownQrDataUri(ozId);
  return (
    <div className="flex flex-col items-center gap-6" data-testid="onboarding-own-card">
      <Halo className="w-full">
        <OzIdCard
          name={name}
          ozId={ozId}
          ozIdLabel={t('ozIdLabel')}
          details={[
            profile.primaryPosition ? positions(positionKey(profile.primaryPosition)) : null,
            profile.country ? countryName(profile.country, locale) : null,
          ]}
          qr={
            qr === null ? undefined : (
              <Image
                src={qr}
                alt={t('qrAlt')}
                width={96}
                height={96}
                unoptimized
                className="h-24 w-24 rounded bg-white p-1"
                data-testid="oz-id-qr"
              />
            )
          }
          badge={
            level === undefined ? undefined : (
              <Badge
                tone={level === 2 ? 'verified' : 'neutral'}
                status={level === 0 ? 'declared' : `level-${String(level)}`}
                confirmed
              >
                {level === 0 ? t('declared') : levels(`l${String(level) as '1' | '2'}`)}
              </Badge>
            )
          }
        />
      </Halo>
      {level === 0 ? <p className="text-sm text-oz-text-muted">{t('declaredHint')}</p> : null}
      <Link
        href={`/joueur/${ozId}`}
        data-testid="onboarding-own-profile"
        className="inline-flex min-h-11 items-center font-semibold underline"
      >
        {t('seeProfile')}
      </Link>
    </div>
  );
}
