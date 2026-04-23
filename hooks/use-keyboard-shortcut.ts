'use client';

import { useEffect, useRef } from 'react';

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

/** Exported for unit tests — matches “don’t fire shortcuts while typing” behavior. */
export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return false;
}

interface ParsedCombo {
  wantsMod: boolean;
  wantsCtrl: boolean;
  wantsMeta: boolean;
  wantsShift: boolean;
  wantsAlt: boolean;
  key: string;
}

function parseCombo(combo: string): ParsedCombo | null {
  const parts = combo
    .trim()
    .toLowerCase()
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean);

  let wantsMod = false;
  let wantsCtrl = false;
  let wantsMeta = false;
  let wantsShift = false;
  let wantsAlt = false;
  const keys: string[] = [];

  for (const p of parts) {
    if (p === 'mod') wantsMod = true;
    else if (p === 'ctrl') wantsCtrl = true;
    else if (p === 'meta') wantsMeta = true;
    else if (p === 'shift') wantsShift = true;
    else if (p === 'alt') wantsAlt = true;
    else keys.push(p);
  }

  if (keys.length !== 1) return null;
  let key = keys[0];
  if (key === 'esc') key = 'escape';

  return { wantsMod, wantsCtrl, wantsMeta, wantsShift, wantsAlt, key };
}

function normalizedEventKey(event: KeyboardEvent): string {
  if (event.key === 'Escape') return 'escape';
  if (event.key.length === 1) return event.key.toLowerCase();
  return event.key.toLowerCase();
}

function matchesParsedCombo(parsed: ParsedCombo, event: KeyboardEvent): boolean {
  const nk = normalizedEventKey(event);
  if (nk !== parsed.key) return false;

  const isMac = isMacPlatform();

  if (parsed.wantsMod) {
    const modOk = isMac ? event.metaKey : event.ctrlKey;
    if (!modOk) return false;
  }
  if (parsed.wantsCtrl && !event.ctrlKey) return false;
  if (parsed.wantsMeta && !event.metaKey) return false;
  if (parsed.wantsShift !== event.shiftKey) return false;
  if (parsed.wantsAlt !== event.altKey) return false;

  return true;
}

function mainKeySkipsWhenTyping(parsed: ParsedCombo): boolean {
  return parsed.key.length === 1 && /[a-z0-9]/u.test(parsed.key);
}

export function useKeyboardShortcut(
  combo: string,
  handler: () => void,
  options?: { preventDefault?: boolean; enabled?: boolean },
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (options?.enabled === false) return;

    const parsed = parseCombo(combo);
    if (parsed === null) return;
    const spec: ParsedCombo = parsed;

    const preventDefault = options?.preventDefault !== false;

    function onKeyDown(event: KeyboardEvent) {
      if (!matchesParsedCombo(spec, event)) return;
      if (mainKeySkipsWhenTyping(spec) && isEditableShortcutTarget(event.target)) return;
      if (preventDefault) event.preventDefault();
      handlerRef.current();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [combo, options?.enabled, options?.preventDefault]);
}
