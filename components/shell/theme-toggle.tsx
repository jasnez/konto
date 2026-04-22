'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Light/dark/system selector. Renders a skeleton on first paint to avoid
 * hydration mismatch — next-themes only resolves the concrete theme on the
 * client.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="space-y-2">
      <Label htmlFor="konto-theme-select">Tema</Label>
      {mounted ? (
        <Select value={theme ?? 'system'} onValueChange={setTheme}>
          <SelectTrigger id="konto-theme-select" className="h-11 w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">
              <span className="flex items-center gap-2">
                <Monitor className="h-4 w-4" aria-hidden />
                Po sistemu
              </span>
            </SelectItem>
            <SelectItem value="light">
              <span className="flex items-center gap-2">
                <Sun className="h-4 w-4" aria-hidden />
                Svijetla
              </span>
            </SelectItem>
            <SelectItem value="dark">
              <span className="flex items-center gap-2">
                <Moon className="h-4 w-4" aria-hidden />
                Tamna
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Skeleton className="h-11 w-full sm:w-64" />
      )}
      <p className="text-sm text-muted-foreground">
        &bdquo;Po sistemu&ldquo; prati postavku operativnog sistema.
      </p>
    </div>
  );
}
