import { Callout, SplitHeading } from '@oz/ui';
import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../auth/auth-metadata';
import { LogoutButton } from '../../../../auth/logout-button';
import { ChildrenList } from '../../../../guardian/children-list';
import { readChildren } from '../../../../guardian/guardian-api';
import { toLogin } from '../../../../onboarding/load-draft';
import { GUARDIAN_SPACE_PATH } from '../../../../session/protected-routes';

export const generateMetadata = () => authMetadata('guardian');

/** Espace du tuteur (lot 1.7bc) : enfants rattachés relus sur l'API à chaque rendu. */
export default async function GuardianSpacePage() {
  const locale = await rootLocale();
  const t = await getTranslations({ locale, namespace: 'guardian.space' });
  const read = await readChildren();
  if (read.kind === 'unauthenticated') toLogin(GUARDIAN_SPACE_PATH, locale);
  return (
    <section className="flex flex-col gap-6" data-testid="guardian-space">
      <div>
        <SplitHeading as="h1" lead={t('title')} />
        <p className="mt-3 text-oz-text-muted">{t('lead')}</p>
      </div>
      {read.kind === 'ok' ? (
        <ChildrenList locale={locale} items={read.children} />
      ) : (
        <Callout testId="guardian-space-unavailable">{t('unavailable')}</Callout>
      )}
      <LogoutButton />
    </section>
  );
}
