import { zodResolver } from '@hookform/resolvers/zod';
import {
  ORGANISATION_TYPES,
  sendContactMessageSchema,
  type SendContactMessageInput,
} from '@oz/contracts';
import type { ReactElement } from 'react';
import { useForm, type FieldError } from 'react-hook-form';

export interface ContactFormProps {
  /** Envoi des valeurs validées (C1) ; le client HTTP est branché par la page Next.js (lots 0.4, 1.6). */
  readonly onSubmit: (values: SendContactMessageInput) => Promise<void>;
  /** Traduction des clés i18n ; par défaut la clé elle-même (l'i18n arrive au lot 0.4). */
  readonly t?: (key: string) => string;
}

const identity = (key: string): string => key;

/**
 * Formulaire de contact : validé dans le navigateur par le schéma partagé (C1, pour guider),
 * puis par l'API avec le même schéma (C2, pour décider) — §7.1.
 */
export function ContactForm({ onSubmit, t = identity }: ContactFormProps): ReactElement {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(sendContactMessageSchema), mode: 'onSubmit' });

  const errorFor = (id: string, error: FieldError | undefined): ReactElement | null =>
    error?.message ? (
      <p id={`${id}-error`} data-testid={`${id}-error`} role="alert">
        {t(error.message)}
      </p>
    ) : null;

  return (
    <form
      data-testid="contact-form"
      noValidate
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <label htmlFor="contact-form-name">{t('contact.form.name')}</label>
      <input
        id="contact-form-name"
        data-testid="contact-form-name"
        autoComplete="name"
        aria-invalid={errors.name ? true : undefined}
        aria-describedby={errors.name ? 'contact-form-name-error' : undefined}
        {...register('name')}
      />
      {errorFor('contact-form-name', errors.name)}

      <label htmlFor="contact-form-email">{t('contact.form.email')}</label>
      <input
        id="contact-form-email"
        data-testid="contact-form-email"
        type="email"
        autoComplete="email"
        aria-invalid={errors.email ? true : undefined}
        aria-describedby={errors.email ? 'contact-form-email-error' : undefined}
        {...register('email')}
      />
      {errorFor('contact-form-email', errors.email)}

      <label htmlFor="contact-form-organisation-type">{t('contact.form.organisationType')}</label>
      <select
        id="contact-form-organisation-type"
        data-testid="contact-form-organisation-type"
        defaultValue=""
        aria-invalid={errors.organisationType ? true : undefined}
        aria-describedby={
          errors.organisationType ? 'contact-form-organisation-type-error' : undefined
        }
        {...register('organisationType')}
      >
        <option value="" disabled>
          {t('contact.form.choose')}
        </option>
        {ORGANISATION_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(
              `contact.organisationType.${type.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`,
            )}
          </option>
        ))}
      </select>
      {errorFor('contact-form-organisation-type', errors.organisationType)}

      <label htmlFor="contact-form-message">{t('contact.form.message')}</label>
      <textarea
        id="contact-form-message"
        data-testid="contact-form-message"
        rows={6}
        aria-invalid={errors.message ? true : undefined}
        aria-describedby={errors.message ? 'contact-form-message-error' : undefined}
        {...register('message')}
      />
      {errorFor('contact-form-message', errors.message)}

      <input
        id="contact-form-consent"
        data-testid="contact-form-consent"
        type="checkbox"
        aria-invalid={errors.consent ? true : undefined}
        aria-describedby={errors.consent ? 'contact-form-consent-error' : undefined}
        {...register('consent')}
      />
      <label htmlFor="contact-form-consent">{t('contact.form.consent')}</label>
      {errorFor('contact-form-consent', errors.consent)}

      <button type="submit" data-testid="contact-form-submit" disabled={isSubmitting}>
        {t('contact.form.submit')}
      </button>
    </form>
  );
}
