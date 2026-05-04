import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingWizard } from './onboarding-wizard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const { markOnboardingStep, completeOnboarding } = vi.hoisted(() => ({
  markOnboardingStep: vi.fn(() => Promise.resolve({ success: true })),
  completeOnboarding: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@/app/(app)/pocetna/onboarding-actions', () => ({
  markOnboardingStep,
  completeOnboarding,
}));

// Mute the inner forms so we don't need full deps; the tests focus on
// orchestration (phase transitions + skip + Server Action calls).
vi.mock('./wizard-step-account', () => ({
  WizardStepAccount: ({
    onComplete,
    onSkip,
  }: {
    onComplete: () => void;
    onSkip: () => void;
  }) => (
    <div data-testid="step1-stub">
      <button type="button" onClick={onComplete}>
        Step 1 done
      </button>
      <button type="button" onClick={onSkip}>
        Step 1 skip
      </button>
    </div>
  ),
}));

vi.mock('./wizard-step-import', () => ({
  WizardStepImport: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="step2-stub">
      <button type="button" onClick={onComplete}>
        Step 2 done
      </button>
    </div>
  ),
}));

vi.mock('./wizard-step-budget', () => ({
  WizardStepBudget: ({
    onComplete,
    onSkip,
  }: {
    onComplete: () => void;
    onSkip: () => void;
  }) => (
    <div data-testid="step3-stub">
      <button type="button" onClick={onComplete}>
        Step 3 done
      </button>
      <button type="button" onClick={onSkip}>
        Step 3 skip
      </button>
    </div>
  ),
}));

vi.mock('./wizard-step-goal', () => ({
  WizardStepGoal: ({
    onComplete,
    onSkip,
  }: {
    onComplete: () => void;
    onSkip: () => void;
  }) => (
    <div data-testid="step4-stub">
      <button type="button" onClick={onComplete}>
        Step 4 done
      </button>
      <button type="button" onClick={onSkip}>
        Step 4 skip
      </button>
    </div>
  ),
}));

vi.mock('./wizard-done', () => ({
  WizardDone: () => <div data-testid="done-stub">Done</div>,
}));

const FRESH = { step1: false, step2: false, step3: false, step4: false };

const PROPS = {
  categories: [],
  accounts: [],
  baseCurrency: 'BAM',
};

describe('OnboardingWizard', () => {
  it('starts on step 1 for fresh user', () => {
    render(<OnboardingWizard progress={FRESH} {...PROPS} />);
    expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
  });

  it('resumes at first incomplete step (step 3 in this case)', () => {
    render(
      <OnboardingWizard
        progress={{ step1: true, step2: true, step3: false, step4: false }}
        {...PROPS}
      />,
    );
    expect(screen.getByTestId('step3-stub')).toBeInTheDocument();
  });

  it('shows Done immediately when all steps already true', () => {
    render(
      <OnboardingWizard
        progress={{ step1: true, step2: true, step3: true, step4: true }}
        {...PROPS}
      />,
    );
    expect(screen.getByTestId('done-stub')).toBeInTheDocument();
  });

  it('advances step1 → step2 on complete and calls markOnboardingStep(1)', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard progress={FRESH} {...PROPS} />);
    await user.click(screen.getByText('Step 1 done'));
    expect(screen.getByTestId('step2-stub')).toBeInTheDocument();
    await waitFor(() => {
      expect(markOnboardingStep).toHaveBeenCalledWith(1);
    });
  });

  it('advances step1 → step2 on skip and still marks the step', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard progress={FRESH} {...PROPS} />);
    await user.click(screen.getByText('Step 1 skip'));
    expect(screen.getByTestId('step2-stub')).toBeInTheDocument();
    await waitFor(() => {
      expect(markOnboardingStep).toHaveBeenCalledWith(1);
    });
  });

  it('reaches Done after step 4 and calls completeOnboarding', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingWizard
        progress={{ step1: true, step2: true, step3: true, step4: false }}
        {...PROPS}
      />,
    );
    await user.click(screen.getByText('Step 4 done'));
    expect(screen.getByTestId('done-stub')).toBeInTheDocument();
    await waitFor(() => {
      expect(markOnboardingStep).toHaveBeenCalledWith(4);
      expect(completeOnboarding).toHaveBeenCalled();
    });
  });

  it('global Preskoči bails to dashboard via completeOnboarding({ markRemainingTrue: true })', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard progress={FRESH} {...PROPS} />);
    // Top-right header skip
    await user.click(screen.getByLabelText('Preskoči ostatak onboardinga'));
    await waitFor(() => {
      expect(completeOnboarding).toHaveBeenCalledWith({ markRemainingTrue: true });
    });
  });

  it('renders progress indicator with current step number', () => {
    render(
      <OnboardingWizard
        progress={{ step1: true, step2: false, step3: false, step4: false }}
        {...PROPS}
      />,
    );
    expect(screen.getByText(/Korak 2 od 4/)).toBeInTheDocument();
  });

  it('hides progress header on Done', () => {
    render(
      <OnboardingWizard
        progress={{ step1: true, step2: true, step3: true, step4: true }}
        {...PROPS}
      />,
    );
    expect(screen.queryByText(/Korak \d+ od 4/)).toBeNull();
    expect(screen.queryByLabelText('Preskoči ostatak onboardinga')).toBeNull();
  });
});
