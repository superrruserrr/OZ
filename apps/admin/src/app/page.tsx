import { useTranslations } from 'next-intl';

/** Accueil du back-office (squelette) : registre Pilotage, repère orange « Admin OZ ». */
export default function AdminHomePage() {
  const t = useTranslations('home');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-4 px-5">
      <p
        className="w-fit rounded-md border border-oz-border px-2 py-1 text-xs font-semibold tracking-[0.08em] text-oz-admin uppercase"
        data-testid="admin-badge"
      >
        {t('badge')}
      </p>
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-oz-text-muted">{t('lead')}</p>
    </main>
  );
}
