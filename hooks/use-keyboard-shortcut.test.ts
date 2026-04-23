import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isEditableShortcutTarget, useKeyboardShortcut } from './use-keyboard-shortcut';

describe('isEditableShortcutTarget', () => {
  it('returns true for input, textarea, select', () => {
    expect(isEditableShortcutTarget(document.createElement('input'))).toBe(true);
    expect(isEditableShortcutTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableShortcutTarget(document.createElement('select'))).toBe(true);
  });

  it('returns true for contenteditable', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    expect(isEditableShortcutTarget(el)).toBe(true);
  });

  it('returns false for button', () => {
    expect(isEditableShortcutTarget(document.createElement('button'))).toBe(false);
  });
});

describe('useKeyboardShortcut', () => {
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('invokes handler on Ctrl+K when not on Apple UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 Windows NT 10.0',
      configurable: true,
    });
    const handler = vi.fn();
    renderHook(() => {
      useKeyboardShortcut('mod+k', handler);
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('invokes handler on Meta+K on Apple UA', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 Macintosh',
      configurable: true,
    });
    const handler = vi.fn();
    renderHook(() => {
      useKeyboardShortcut('mod+k', handler);
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not invoke when focus is in an input', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 Windows NT 10.0',
      configurable: true,
    });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    const handler = vi.fn();
    renderHook(() => {
      useKeyboardShortcut('mod+k', handler);
    });

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not attach when enabled is false', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 Windows NT 10.0',
      configurable: true,
    });
    const handler = vi.fn();
    renderHook(() => {
      useKeyboardShortcut('mod+k', handler, { enabled: false });
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
