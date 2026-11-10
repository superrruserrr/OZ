'use client';

import { Button, ChoiceCardGroup } from '@oz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { saveSignupStep } from './actions';
import { callAction, StepError, useStepResult } from './step-shell';

/**
 * Étape 3 : rattachement. Seul « sans club » est ouvert ; le parrainage par une organisation arrive
 * au lot 1.8 (EX-119, partiel).
 */
export function AffiliationStep() {
  const t = useTranslations('onboarding.affiliation');
  const tStep = useTranslations('onboarding');
  const { failure, settle, clear } = useStepResult();
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-col gap-5" data-testid="onboarding-affiliation-form">
      <StepError failure={failure} />
      <ChoiceCardGroup
        label={t('label')}
        testId="onboarding-affiliation"
        value="none"
        onValueChange={() => undefined}
        options={[
          { value: 'none', title: t('none'), description: t('noneDescription') },
          { value: 'club', title: t('club'), description: t('clubDescription'), disabled: true },
        ]}
      />
      <Button
        type="button"
        loading={saving}
        data-testid="onboarding-submit"
        onClick={() => {
          setSaving(true);
          clear();
          void callAction(() => saveSignupStep('affiliation', { mode: 'none' })).then((result) => {
            setSaving(false);
            settle(result);
          });
        }}
      >
        {tStep('continue')}
      </Button>
    </div>
  );
}
