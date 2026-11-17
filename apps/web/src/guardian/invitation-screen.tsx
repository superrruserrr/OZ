'use client';

import type { GuardianInvitationPreviewOutput } from '@oz/contracts';
import { Button, Callout } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '../i18n/navigation';
import { GUARDIAN_INVITATION_PATH, GUARDIAN_SPACE_PATH } from '../session/protected-routes';
import {
  acceptInvitation,
  openInvitation,
  readKeptInvitation,
  type GuardianFailure,
} from './actions';
import { call, GuardianError } from './guardian-error';
import { messageKey } from '../onboarding/field-message';

type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'preview'; readonly preview: GuardianInvitationPreviewOutput }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed'; readonly failure: GuardianFailure }
  | { readonly kind: 'accepted' };

/**
 * Lien `…/tuteur/invitation#token=…` (lot 1.7bc). Le jeton est lu dans le fragment, effacé aussitôt
 * de l'adresse, puis gardé par le serveur du site dans un cookie httpOnly (B4) : jamais dans une
 * URL envoyée, un journal ou un `Referer`. Aperçu : prénom de l'enfant et lien déclaré seulement.
 */
export function InvitationScreen({ signedIn }: { readonly signedIn: boolean }) {
  const t = useTranslations('guardian.invitation');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [failure, setFailure] = useState<GuardianFailure | null>(null);
  const [pending, setPending] = useState(false);
  const started = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    const read = token ? () => openInvitation(token) : readKeptInvitation;
    void call(read).then((result) => {
      if (result.ok) setState({ kind: 'preview', preview: result.preview });
      else if (result.error === 'invitationInvalid')
        setState({ kind: token ? 'invalid' : 'missing' });
      else setState({ kind: 'failed', failure: result });
    });
  }, []);

  const accept = (): void => {
    if (pending) return;
    setPending(true);
    void call(acceptInvitation).then((result) => {
      setPending(false);
      if (result.ok) {
        setState({ kind: 'accepted' });
        router.replace(GUARDIAN_SPACE_PATH);
      } else if (result.error === 'session') {
        window.location.reload();
      } else if (result.error === 'invitationInvalid') {
        setState({ kind: 'invalid' });
      } else {
        setFailure(result);
      }
    });
  };

  if (state.kind === 'loading') {
    return (
      <p aria-live="polite" data-testid="guardian-invitation-loading">
        {t('loading')}
      </p>
    );
  }
  if (state.kind === 'invalid' || state.kind === 'missing') {
    return (
      <Callout testId={`guardian-invitation-${state.kind}`}>
        {state.kind === 'invalid' ? t('invalid') : t('missing')}
      </Callout>
    );
  }
  if (state.kind === 'failed') return <GuardianError failure={state.failure} />;
  if (state.kind === 'accepted') {
    return (
      <p aria-live="polite" data-testid="guardian-invitation-accepted">
        {t('accepted')}
      </p>
    );
  }

  const { childFirstName, relationship } = state.preview;
  return (
    <div className="flex flex-col gap-5" data-testid="guardian-invitation-preview">
      <p className="text-lg">
        {t('lead', {
          firstName: childFirstName,
          relationship: t(`relationships.${messageKey(relationship)}`),
        })}
      </p>
      <Callout tone="legal">{t('explain')}</Callout>
      <GuardianError failure={failure} />
      {signedIn ? (
        <Button
          type="button"
          loading={pending}
          disabled={pending}
          data-testid="guardian-invitation-accept"
          onClick={accept}
        >
          {t('accept')}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-oz-text-muted">{t('signedOutLead')}</p>
          <Button asChild>
            <Link href="/auth/signup/guardian" data-testid="guardian-invitation-signup">
              {t('signup')}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link
              href={{ pathname: '/auth/login', query: { next: GUARDIAN_INVITATION_PATH } }}
              data-testid="guardian-invitation-login"
            >
              {t('login')}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
