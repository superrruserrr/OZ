import { locale as rootLocale } from 'next/root-params';
import { authMetadata } from '../../../../../auth/auth-metadata';
import { loadOwn } from '../../../../../espace/load-own';
import { UpcomingFeature } from '../../../../../espace/upcoming-feature';

export const generateMetadata = () => authMetadata('dashboard');

/** Entrée du rail (maquette v2) : fonction à venir, page réelle et gardée comme le reste de l'espace. */
export default async function Page() {
  await loadOwn('/espace/videos', await rootLocale());
  return <UpcomingFeature feature="videos" />;
}
