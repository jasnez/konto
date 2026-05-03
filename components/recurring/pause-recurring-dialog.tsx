'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, addMonths, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/date-picker';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { pauseRecurring, type PauseRecurringResult } from '@/app/(app)/pretplate/actions';

const ERROR_COPY: Record<string, string> = {
  NOT_FOUND: 'Pretplata više ne postoji. Osvježi stranicu.',
  UNAUTHORIZED: 'Sesija je istekla. Prijavi se ponovo.',
  DATABASE_ERROR: 'Greška u bazi.',
};

interface Preset {
  label: string;
  compute: (now: Date) => Date;
}

const PRESETS: Preset[] = [
  { label: '+30 dana', compute: (now) => addDays(now, 30) },
  { label: '+60 dana', compute: (now) => addDays(now, 60) },
  { label: '+3 mjeseca', compute: (now) => addMonths(now, 3) },
];

export interface PauseRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurringId: string;
}

export function PauseRecurringDialog({
  open,
  onOpenChange,
  recurringId,
}: PauseRecurringDialogProps) {
  const router = useRouter();
  const [until, setUntil] = useState<string>(() => format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function applyPreset(preset: Preset): void {
    setUntil(format(preset.compute(new Date()), 'yyyy-MM-dd'));
  }

  async function handleSubmit(): Promise<void> {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result: PauseRecurringResult = await pauseRecurring(recurringId, { until });
      if (result.success) {
        toast.success('Pretplata pauzirana.');
        onOpenChange(false);
        router.refresh();
        return;
      }
      if (result.error === 'VALIDATION_ERROR') {
        setSubmitError('Provjeri datum.');
        return;
      }
      setSubmitError(ERROR_COPY[result.error] ?? 'Nepoznata greška.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pauziraj pretplatu</DialogTitle>
          <DialogDescription>
            Do datuma ispod pretplata neće biti aktivna. Automatski se nastavlja kad datum prođe.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Brzo</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-9',
                    until === format(p.compute(new Date()), 'yyyy-MM-dd') && 'border-primary',
                  )}
                  onClick={() => {
                    applyPreset(p);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pause-until">Pauziraj do</Label>
            <DatePicker
              value={until}
              onChange={setUntil}
              placeholder="Odaberi datum"
              disabled={submitting}
            />
          </div>
          {submitError && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={submitting}
          >
            Odustani
          </Button>
          <Button
            onClick={() => {
              void handleSubmit();
            }}
            disabled={submitting || until === ''}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Pauziraj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
