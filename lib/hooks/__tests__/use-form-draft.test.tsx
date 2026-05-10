// @vitest-environment jsdom

/**
 * useFormDraft (OB-1) tests.
 *
 * Covers:
 *   - No-op when `draftKey` is undefined.
 *   - Save-on-change with debounce.
 *   - Hydration from localStorage on mount.
 *   - Stale/corrupt draft is ignored (no crash).
 *   - clearDraft removes the key.
 *   - Hydration is idempotent — re-render doesn't re-hydrate over user edits.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { useFormDraft } from '../use-form-draft';

interface FormValues {
  name: string;
  amount: string;
}

const STORAGE_KEY = 'konto:form-draft:test-key';

function setupForm(initial: FormValues = { name: '', amount: '' }) {
  return renderHook(() => {
    const form = useForm<FormValues>({ defaultValues: initial });
    const draft = useFormDraft<FormValues>('test-key', form);
    return { form, draft };
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFormDraft', () => {
  it('is a no-op when draftKey is undefined', () => {
    const { result } = renderHook(() => {
      const form = useForm<FormValues>({ defaultValues: { name: '', amount: '' } });
      const draft = useFormDraft<FormValues>(undefined, form);
      return { form, draft };
    });

    act(() => {
      result.current.form.setValue('name', 'Tekući');
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('saves form values to localStorage with 500ms debounce', () => {
    const { result } = setupForm();

    act(() => {
      result.current.form.setValue('name', 'Tekući');
    });

    // Before debounce window — nothing written.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    // After debounce — value persisted.
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? '{}') as FormValues;
    expect(parsed.name).toBe('Tekući');
  });

  it('debounce coalesces rapid changes into a single write', () => {
    const { result } = setupForm();

    act(() => {
      result.current.form.setValue('name', 'T');
      vi.advanceTimersByTime(100);
      result.current.form.setValue('name', 'Te');
      vi.advanceTimersByTime(100);
      result.current.form.setValue('name', 'Tek');
      vi.advanceTimersByTime(100);
    });
    // No write yet — debounce keeps resetting.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as FormValues;
    expect(parsed.name).toBe('Tek');
  });

  it('hydrates form from localStorage on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 'Stedni', amount: '5000' }));

    const { result } = setupForm({ name: '', amount: '' });

    // Synchronous after first render — hydration runs in useEffect, which
    // RTL flushes inside `renderHook`.
    expect(result.current.form.getValues()).toEqual({ name: 'Stedni', amount: '5000' });
  });

  it('ignores corrupt JSON in localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not-json');

    const { result } = setupForm({ name: 'fallback', amount: '' });

    // Form keeps its defaults — no crash, no hydration.
    expect(result.current.form.getValues('name')).toBe('fallback');
  });

  it('ignores non-object JSON in localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, '"just a string"');

    const { result } = setupForm({ name: 'fallback', amount: '' });

    expect(result.current.form.getValues('name')).toBe('fallback');
  });

  it('clearDraft removes the key', () => {
    const { result } = setupForm();

    act(() => {
      result.current.form.setValue('name', 'Tekući');
      vi.advanceTimersByTime(600);
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    act(() => {
      result.current.draft.clearDraft();
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('hydration runs only once — re-render does not overwrite user edits', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 'Stedni', amount: '5000' }));

    const { result, rerender } = setupForm({ name: '', amount: '' });

    // After first render, hydrated.
    expect(result.current.form.getValues('name')).toBe('Stedni');

    // User edits then we force a re-render of the parent (mimic prop change).
    act(() => {
      result.current.form.setValue('name', 'User overwrite');
    });
    rerender();

    // The user's edit must survive the re-render — hydration must NOT run again.
    expect(result.current.form.getValues('name')).toBe('User overwrite');
  });
});
