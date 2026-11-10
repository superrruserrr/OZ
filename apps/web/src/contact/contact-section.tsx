'use client';

import { Callout } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ContactForm } from './contact-form';
import { sendContact } from './send-contact';

/** Formulaire de contact et son résultat (lot 1.6) : message de réussite ou d'échec annoncé. */
export function ContactSection() {
  const t = useTranslations();
  const [status, setStatus] = useState<'idle' | 'sent' | 'failed'>('idle');
  if (status === 'sent') {
    return (
      <div aria-live="polite">
        <Callout testId="contact-sent">{t('contactPage.sent')}</Callout>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite">
        {status === 'failed' ? (
          <Callout testId="contact-failed">{t('contactPage.failed')}</Callout>
        ) : null}
      </div>
      <ContactForm
        t={(key) => t(key)}
        onSubmit={async (values) => {
          const result = await sendContact(values);
          setStatus(result.ok ? 'sent' : 'failed');
        }}
      />
    </div>
  );
}
