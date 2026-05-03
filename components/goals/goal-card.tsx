'use client';

import { MoreVertical, PencilLine, PlusCircle, Trash2, CheckCircle2 } from 'lucide-react';
import { formatMoney } from '@/lib/format/format-money';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DEFAULT_GOAL_COLOR } from './goal-form';
import type { GoalItem } from '@/lib/queries/goals';

// ─── SVG Progress Circle ──────────────────────────────────────────────────────

const CIRCLE_SIZE = 120;
const STROKE_WIDTH = 10;

interface ProgressCircleProps {
  progress: number; // 0–1
  color: string;
  /** Displayed in the centre — typically "72%" or "✓" */
  label: string;
  size?: number;
}

function ProgressCircle({ progress, color, label, size = CIRCLE_SIZE }: ProgressCircleProps) {
  // Scale stroke and radius proportionally when size differs from default
  const scale = size / CIRCLE_SIZE;
  const sw = STROKE_WIDTH * scale;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${String(size)} ${String(size)}`}
        className="-rotate-90"
        aria-hidden
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={sw}
          className="text-muted/40"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${String(circ)} ${String(circ)}`}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      {/* Centre label — sits on top, rotated back to normal */}
      <span
        className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

export interface GoalCardProps {
  goal: GoalItem;
  onEdit: (id: string) => void;
  onAddContribution: (id: string) => void;
  onDelete: (id: string) => void;
}

export function GoalCard({ goal, onEdit, onAddContribution, onDelete }: GoalCardProps) {
  const color = goal.color ?? DEFAULT_GOAL_COLOR;
  const isAchieved = goal.achievedAt !== null;
  const percent = Math.round(goal.progress * 100);
  const progressLabel = isAchieved ? '✓' : `${String(percent)}%`;

  return (
    <Card
      className={cn('flex flex-col gap-4 p-4 transition-opacity', isAchieved && 'opacity-75')}
      data-testid="goal-card"
      data-goal-id={goal.id}
    >
      {/* Header: icon + name + menu */}
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-2xl leading-none" aria-hidden>
            {goal.icon ?? '📦'}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{goal.name}</h3>
            {isAchieved && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Postignuto
              </span>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Meni za cilj"
              className="h-11 w-11 shrink-0"
            >
              <MoreVertical className="h-5 w-5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                onAddContribution(goal.id);
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" aria-hidden />
              Dodaj uplatu
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onEdit(goal.id);
              }}
            >
              <PencilLine className="mr-2 h-4 w-4" aria-hidden />
              Uredi
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onDelete(goal.id);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              Obriši
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Hero: progress circle + amounts */}
      <div className="flex items-center gap-5">
        {/* Circle: 80px on mobile (default), 96px on sm+ */}
        <div className="hidden sm:block">
          <ProgressCircle progress={goal.progress} color={color} label={progressLabel} size={96} />
        </div>
        <div className="block sm:hidden">
          <ProgressCircle progress={goal.progress} color={color} label={progressLabel} size={80} />
        </div>

        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
            <span className="font-mono font-semibold tabular-nums">
              {formatMoney(goal.currentAmountCents, goal.currency, 'bs-BA', { showCurrency: false })}
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatMoney(goal.targetAmountCents, goal.currency, 'bs-BA', { showCurrency: true })}
            </span>
          </div>

          {/* Date / months left */}
          {goal.targetDate ? (
            <p className="text-muted-foreground">
              {goal.monthsLeft !== null && goal.monthsLeft > 0
                ? `${String(goal.monthsLeft)} mj. preostalo`
                : 'Rok je prošao ili ovaj mjesec'}
            </p>
          ) : (
            <p className="text-muted-foreground">Bez datuma cilja</p>
          )}

          {/* Recommended monthly contribution */}
          {goal.recommendedMonthlyCents !== null && !isAchieved && (
            <p className="text-xs text-muted-foreground">
              ~
              {formatMoney(goal.recommendedMonthlyCents, goal.currency, 'bs-BA', {
                showCurrency: true,
              })}
              /mj.
            </p>
          )}

          {/* Linked account */}
          {goal.accountName && (
            <p className="truncate text-xs text-muted-foreground">Račun: {goal.accountName}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
