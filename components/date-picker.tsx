'use client';

import { format } from 'date-fns';
import { bs } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
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

export function DatePicker({ value, onChange, disabled = false }: DatePickerProps) {
  const date = toDate(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('h-11 w-full justify-start text-left font-normal')}
        >
          <CalendarIcon className="mr-2 h-4 w-4" aria-hidden />
          {format(date, 'd. MMM yyyy.', { locale: bs })}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
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
