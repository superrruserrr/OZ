/** Schémas Zod partagés client / serveur (lot 0.5) : un schéma, deux exécutions (§7.1). */
export const PACKAGE_NAME = '@oz/contracts' as const;

export { consent, email, longText, personName } from './common/fields.js';
export {
  ORGANISATION_TYPES,
  sendContactMessageSchema,
  type SendContactMessageInput,
} from './contact/send-contact-message.schema.js';
