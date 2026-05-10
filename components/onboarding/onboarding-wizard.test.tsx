import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
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

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

afterEach(() => {
  // Reset the default-success mock implementation between tests so the
  // EH-3 failure tests can override per-test without leaking forward.
  markOnboardingStep.mockImplementation(() => Promise.resolve({ success: true }));
  completeOnboarding.mockImplementation(() => Promise.resolve({ success: true }));
  vi.clearAllMocks();
});

// Mute the inner forms so we don't need full deps; the tests focus on
// orchestration (phase transitions + skip + Server Action calls).
vi.mock('./wizard-step-account', () => ({
  WizardStepAccount: ({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) => (
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
  WizardStepBudget: ({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) => (
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
  WizardStepGoal: ({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) => (
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
    // EH-3: advance is now pessimistic — wait for the Server Action to
    // resolve before the next step is rendered.
    await waitFor(() => {
      expect(screen.getByTestId('step2-stub')).toBeInTheDocument();
    });
    expect(markOnboardingStep).toHaveBeenCalledWith(1);
  });

  it('advances step1 → step2 on skip and still marks the step', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard progress={FRESH} {...PROPS} />);
    await user.click(screen.getByText('Step 1 skip'));
    await waitFor(() => {
      expect(screen.getByTestId('step2-stub')).toBeInTheDocument();
    });
    expect(markOnboardingStep).toHaveBeenCalledWith(1);
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
    await waitFor(() => {
      expect(screen.getByTestId('done-stub')).toBeInTheDocument();
    });
    expect(markOnboardingStep).toHaveBeenCalledWith(4);
    await waitFor(() => {
      expect(completeOnboarding).toHaveBeenCalled();
    });
  });

  it('EH-3: stays on current step when markOnboardingStep fails', async () => {
    markOnboardingStep.mockImplementationOnce(() =>
      Promise.resolve({ success: false, error: 'DATABASE_ERROR' }),
    );
    const user = userEvent.setup();
    render(<OnboardingWizard progress={FRESH} {...PROPS} />);
    await user.click(screen.getByText('Step 1 done'));
    // Server Action fired and resolved — but the wizard MUST stay on step 1.
    await waitFor(() => {
      expect(markOnboardingStep).toHaveBeenCalledWith(1);
    });
    expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('step2-stub')).not.toBeInTheDocument();
    // User-visible error toast.
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Ne mogu spasiti'));
  });

  it('EH-3: completeOnboarding failure is non-blocking — still reaches Done', async () => {
    completeOnboarding.mockImplementationOnce(() =>
      Promise.resolve({ success: false, error: 'DATABASE_ERROR' }),
    );
    const user = userEvent.setup();
    render(
      <OnboardingWizard
        progress={{ step1: true, step2: true, step3: true, step4: false }}
        {...PROPS}
      />,
    );
    await user.click(screen.getByText('Step 4 done'));
    // Step marker succeeded, so Done is shown — completion timestamp can
    // be filled by a future retry. UI is not blocked.
    await waitFor(() => {
      expect(screen.getByTestId('done-stub')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Ne mogu označiti'));
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
