/** Configuration typée et chargement d'environnement (lot 0.3). */
export const PACKAGE_NAME = '@oz/config' as const;
export { ConfigError, loadApiConfig } from './api-config.js';
export type { ApiConfig } from './api-config.js';
