'use client';

/**
 * Drag-and-drop reorderable dashboard with per-widget visibility toggle.
 *
 * Renders pre-built RSC slots (passed in from app/(app)/pocetna/page.tsx)
 * in the user's preferred order. The "Preuredi" pill enters an edit mode
 * where each visible card gets a drag handle + hide button, and hidden
 * widgets show up as pills in a "Skrivene sekcije" tray for re-enabling.
 *
 * Pull-to-refresh is suppressed in edit mode — otherwise pulling down on
 * the hero would compete with dragging it.
 */

import { useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Eye, EyeOff, GripVertical, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PullToRefreshWrapper } from '@/components/shell/pull-to-refresh-wrapper';
import { updateDashboardOrder } from '@/app/(app)/pocetna/actions';
import {
  DASHBOARD_SECTION_KEYS,
  SECTION_LABELS_BS,
  type DashboardSectionKey,
} from '@/lib/dashboard/sections';

interface SortableDashboardProps {
  initialOrder: DashboardSectionKey[];
  slots: Record<DashboardSectionKey, ReactNode>;
  /** Static fragments rendered above the section list (e.g. toast hosts). */
  children?: ReactNode;
}

export function SortableDashboard({ initialOrder, slots, children }: SortableDashboardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftOrder, setDraftOrder] = useState<DashboardSectionKey[]>(initialOrder);
  const [isPending, startTransition] = useTransition();

  // Mouse: 8px movement before drag starts → click on hide button still works.
  // Touch: 200ms long-press → vertical scroll never accidentally triggers reorder.
  // Keyboard: Tab to focus card, Space to pick up, Arrow keys to move, Space to drop.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleOrder = editing ? draftOrder : initialOrder;
  const hiddenKeys = DASHBOARD_SECTION_KEYS.filter((k) => !visibleOrder.includes(k));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    setDraftOrder((cur) => {
      const oldIdx = cur.indexOf(active.id as DashboardSectionKey);
      const newIdx = cur.indexOf(over.id as DashboardSectionKey);
      if (oldIdx < 0 || newIdx < 0) return cur;
      return arrayMove(cur, oldIdx, newIdx);
    });
  };

  const enterEdit = () => {
    setDraftOrder(initialOrder);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraftOrder(initialOrder);
    setEditing(false);
  };

  const hideSection = (k: DashboardSectionKey) => {
    setDraftOrder((cur) => cur.filter((x) => x !== k));
  };

  const showSection = (k: DashboardSectionKey) => {
    setDraftOrder((cur) => (cur.includes(k) ? cur : [...cur, k]));
  };

  const save = () => {
    startTransition(async () => {
      const res = await updateDashboardOrder({ order: draftOrder });
      if (res.success) {
        // revalidatePath alone hasn't been reliable when the action is invoked
        // via useTransition (see uvidi-client / budgets-client for the same
        // pattern). router.refresh() forces the server component to re-fetch
        // so the new initialOrder prop arrives before we leave edit mode.
        router.refresh();
        setEditing(false);
        toast.success('Redoslijed sačuvan');
      } else {
        // DD-1: roll the optimistic draft back to the server's last known
        // good state BEFORE surfacing the toast. Otherwise the user sees the
        // failed-to-save order persist visually until router.refresh() lands
        // (which it doesn't on this branch — only happens on success). If
        // they drag again before realising, the second save races the first.
        setDraftOrder(initialOrder);
        toast.error('Greška pri snimanju redoslijeda. Pokušaj ponovo.');
      }
    });
  };

  return (
    <PullToRefreshWrapper
      className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6"
      refreshLabel="Osvježavam dashboard..."
      disabled={editing}
    >
      {children}

      {!editing ? (
        <>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={enterEdit} aria-label="Preuredi dashboard">
              <Settings2 className="mr-1.5 h-4 w-4" aria-hidden />
              Preuredi
            </Button>
          </div>

          {visibleOrder.map((key) => (
            <div key={key}>{slots[key]}</div>
          ))}
        </>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Prevuci kartice da promijeniš redoslijed. Klikni{' '}
            <EyeOff className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden /> za sakrivanje
            sekcije. Na mobilnom pritisni i drži karticu za premještanje.
          </p>

          <SortableContext items={draftOrder} strategy={verticalListSortingStrategy}>
            <div className="space-y-4 sm:space-y-6">
              {draftOrder.map((key) => (
                <SortableItem
                  key={key}
                  id={key}
                  onHide={() => {
                    hideSection(key);
                  }}
                >
                  {slots[key]}
                </SortableItem>
              ))}
            </div>
          </SortableContext>

          {hiddenKeys.length > 0 ? (
            <section
              aria-label="Skrivene sekcije"
              className="rounded-2xl border border-dashed border-border bg-muted/30 p-4"
            >
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">Skrivene sekcije</h3>
              <ul className="flex flex-wrap gap-2">
                {hiddenKeys.map((k) => (
                  <li key={k}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        showSection(k);
                      }}
                      aria-label={`Pokaži ${SECTION_LABELS_BS[k]}`}
                    >
                      <Eye className="mr-1.5 h-4 w-4" aria-hidden />
                      {SECTION_LABELS_BS[k]}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="sticky bottom-0 z-20 -mx-4 mt-2 flex gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <Button onClick={save} disabled={isPending} className="flex-1 sm:flex-none">
              {isPending ? 'Čuvam…' : 'Sačuvaj'}
            </Button>
            <Button
              variant="ghost"
              onClick={cancelEdit}
              disabled={isPending}
              className="flex-1 sm:flex-none"
            >
              Odustani
            </Button>
          </div>
        </DndContext>
      )}
    </PullToRefreshWrapper>
  );
}

interface SortableItemProps {
  id: DashboardSectionKey;
  children: ReactNode;
  onHide: () => void;
}

function SortableItem({ id, children, onHide }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  // touchAction: 'none' is essential on mobile — without it the browser claims
  // the touch as a scroll gesture before the TouchSensor's 200ms long-press
  // timer fires, so reorder never starts. dnd-kit docs flag this explicitly.
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-2xl outline-2 outline-dashed outline-primary/40 outline-offset-2 ${isDragging ? 'z-50 opacity-60' : ''}`}
      {...attributes}
      {...listeners}
    >
      <span
        className="pointer-events-none absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-background/85 text-muted-foreground shadow-sm backdrop-blur"
        aria-hidden
      >
        <GripVertical className="h-4 w-4" />
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onHide();
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-background/85 text-muted-foreground shadow-sm backdrop-blur hover:bg-background hover:text-foreground"
        aria-label={`Sakrij ${SECTION_LABELS_BS[id]}`}
      >
        <EyeOff className="h-4 w-4" aria-hidden />
      </button>
      <div className="pointer-events-none">{children}</div>
    </div>
  );
}
