'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { isEditableShortcutTarget, useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut';

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['Ctrl', 'K'], description: 'Brzi unos transakcije' },
  { keys: ['?'], description: 'Prikaži prečice' },
];

function Key({ label }: { label: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground">
      {label}
    </kbd>
  );
}

/** Renders keyboard shortcut hint — ⌘K on Mac, Ctrl+K elsewhere. */
function MacAdaptedKeys({ keys }: { keys: string[] }) {
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);

  const adapted = keys.map((k) => (isMac && k === 'Ctrl' ? '⌘' : k));
  return (
    <span className="flex items-center gap-1">
      {adapted.map((k, i) => (
        <Key key={i} label={k} />
      ))}
    </span>
  );
}

/**
 * Registers the `?` global shortcut and renders a cheat-sheet dialog.
 * Mount once from the app layout — renders nothing until `?` is pressed.
 */
export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useKeyboardShortcut('?', () => {
    if (isEditableShortcutTarget(document.activeElement)) return;
    setOpen((v) => !v);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Prečice na tastaturi</DialogTitle>
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.description} className="border-b border-border last:border-0">
                <td className="py-2.5 pr-4 text-muted-foreground">{s.description}</td>
                <td className="py-2.5 text-right">
                  <MacAdaptedKeys keys={s.keys} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
