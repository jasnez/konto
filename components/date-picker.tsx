'use client';

import { format } from 'date-fns';
import { bs } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  /**
   * ISO date `YYYY-MM-DD`, or the empty string when no date is selected.
   * The empty-string branch exists for filter use-cases (`/transakcije`)
   * where "no `from`/`to` set" is a valid state — falling through to
   * `format()` with an Invalid Date would throw.
   */
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  /**
   * Trigger label shown when `value` is empty. Defaults to "Odaberi datum".
   * Pass context-specific copy (e.g. "Od datuma", "Do datuma") so users
   * know which side of a range each picker controls.
   */
  placeholder?: string;
}

function toDate(value: string): Date {
  // Local midnight, NOT UTC — pairing with toIsoDate avoids timezone-shift bugs
  // where clicking April 15 was stored as April 14 (Date.UTC + toISOString combo).
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Date(year, month - 1, day);
}

function toIsoDate(value: Date): string {
  // Format using local timezone components, not toISOString() (which converts to UTC).
  return format(value, 'yyyy-MM-dd');
}

/**
 * `EEEEEE` (narrow) for `bs` would still emit short names; we want exactly
 * one capital letter per weekday header to keep the calendar readable on
 * small screens. Falls back to ASCII first char for unsupported locales.
 */
export function formatWeekdayInitial(date: Date): string {
  const narrow = format(date, 'EEEEEE', { locale: bs });
  return narrow.charAt(0).toUpperCase();
}

export function DatePicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Odaberi datum',
}: DatePickerProps) {
  // Two-step narrowing so TypeScript can carry the non-null + valid-Date
  // refinement through both the trigger label and the Calendar's `selected`.
  // `toDate('')` builds an Invalid Date that would throw inside `format()`.
  const candidate = value.length > 0 ? toDate(value) : null;
  const validDate = candidate !== null && !Number.isNaN(candidate.getTime()) ? candidate : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-11 w-full justify-start text-left font-normal',
            validDate === null && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" aria-hidden />
          {validDate !== null ? format(validDate, 'd. MMM yyyy.', { locale: bs }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={validDate ?? undefined}
          onSelect={(nextDate) => {
            if (!nextDate) return;
            onChange(toIsoDate(nextDate));
          }}
          locale={bs}
          weekStartsOn={1}
          formatters={{ formatWeekdayName: formatWeekdayInitial }}
        />
      </PopoverContent>
    </Popover>
  );
}
