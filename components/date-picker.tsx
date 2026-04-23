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
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
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
          className={cn('h-11 min-h-[44px] w-full justify-start text-left font-normal')}
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
        />
      </PopoverContent>
    </Popover>
  );
}
