import { getRequestConfig } from 'next-intl/server';

/** Back-office en français ; `messages/en.json` est tenu à jour pour une bascule ultérieure. */
export const ADMIN_LOCALE = 'fr';

export default getRequestConfig(async () => {
  const messages = (await import(`../../messages/${ADMIN_LOCALE}.json`)) as {
    default: Record<string, unknown>;
  };
  return { locale: ADMIN_LOCALE, messages: messages.default };
});
