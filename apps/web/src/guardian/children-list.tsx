import { Badge, Callout, Card } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '../i18n/navigation';
import type { GuardianChild } from './guardian-api';
import { messageKey } from '../onboarding/field-message';

const TONE = {
  awaiting_documents: 'neutral',
  submitted: 'kyc',
  rejected: 'danger',
  approved: 'legal',
} as const;

/**
 * Enfants du compte (EX-108 n° 4) et étape suivante de chacun. Aucune photo, aucune mise en avant
 * d'un mineur ; nom et OZ ID seulement après le lien validé par OZ (lot 1.7bb).
 */
export async function ChildrenList({
  items,
  locale,
}: {
  readonly items: readonly GuardianChild[];
  readonly locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'guardian.space' });
  if (items.length === 0) {
    return <Callout testId="guardian-children-empty">{t('empty')}</Callout>;
  }
  return (
    <ul className="flex flex-col gap-4" data-testid="guardian-children">
      {items.map((child) => {
        const name =
          child.lastName === null ? child.firstName : `${child.firstName} ${child.lastName}`;
        const canDeposit =
          child.linkStatus === 'awaiting_documents' || child.linkStatus === 'rejected';
        return (
          <li key={child.guardianId}>
            <Card className="flex flex-col gap-3 p-4" data-testid="guardian-child">
              <h2 className="text-xl font-medium break-words">{name}</h2>
              {child.ozId === null ? null : (
                <p className="font-mono text-sm" data-testid="guardian-child-ozid">
                  {t('ozId', { ozId: child.ozId })}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge tone={TONE[child.linkStatus]} status={`link-${child.linkStatus}`}>
                  {t(`status.${messageKey(child.linkStatus)}`)}
                </Badge>
                <Badge tone="neutral" status={child.published ? 'published' : 'unpublished'}>
                  {child.published ? t('published') : t('unpublished')}
                </Badge>
              </div>
              {child.linkStatus === 'approved' ? (
                <p className="text-sm text-oz-text-muted" data-testid="guardian-child-consents">
                  {t('consents', { count: child.consents.length })}
                </p>
              ) : null}
              {child.guardianVerified ? null : (
                <p className="text-sm text-oz-text-muted">{t('kycNotice')}</p>
              )}
              {canDeposit ? (
                <Link
                  href={`/tuteur/justificatif/${child.guardianId}`}
                  data-testid="guardian-child-deposit"
                  className="inline-flex min-h-11 items-center font-medium underline"
                >
                  {t('deposit')}
                </Link>
              ) : null}
              {child.linkStatus === 'approved' && child.ozId !== null ? (
                <Link
                  href={`/tuteur/accords/${child.ozId}`}
                  data-testid="guardian-child-consent"
                  className="inline-flex min-h-11 items-center font-medium underline"
                >
                  {t('consent')}
                </Link>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
