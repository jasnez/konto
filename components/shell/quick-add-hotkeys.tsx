'use client';

import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';
import { useUiStore } from '@/stores/ui';

/** Registers global quick-add shortcuts (mounted from the app layout). */
export function QuickAddHotkeys() {
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);

  useKeyboardShortcut('mod+k', openQuickAdd, { preventDefault: true });

  return null;
}
