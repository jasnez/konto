'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-is-mobile';
import type { CategoryInput } from '@/lib/categories/validation';
import { deleteCategory, reorderCategories } from './actions';
import { CategoryFormDialog } from './category-form-dialog';
import type { CategoryListItem } from './types';

type TabId = 'troskovi' | 'prihodi' | 'transferi';

const TABS: { id: TabId; label: string; kinds: CategoryInput['kind'][] }[] = [
  { id: 'troskovi', label: 'Troškovi', kinds: ['expense', 'saving', 'investment'] },
  { id: 'prihodi', label: 'Prihodi', kinds: ['income'] },
  { id: 'transferi', label: 'Transferi', kinds: ['transfer'] },
];

function defaultKindForTab(tab: TabId): CategoryInput['kind'] {
  switch (tab) {
    case 'troskovi':
      return 'expense';
    case 'prihodi':
      return 'income';
    case 'transferi':
      return 'transfer';
  }
}

function kindsForTabId(id: TabId): CategoryInput['kind'][] {
  const found = TABS.find((t) => t.id === id);
  return found?.kinds ?? TABS[0].kinds;
}

function SortableRow({
  cat,
  reorderMode,
  showHandle,
  onEdit,
  onRequestDelete,
}: {
  cat: CategoryListItem;
  reorderMode: boolean;
  showHandle: boolean;
  onEdit: (c: CategoryListItem) => void;
  onRequestDelete: (c: CategoryListItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat.id,
    disabled: !reorderMode || !showHandle,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex h-16 min-h-16 items-center gap-2 border-b border-border px-1"
    >
      {showHandle && reorderMode ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hidden shrink-0 touch-none rounded-md p-2 md:block"
          aria-label="Povuci za promjenu reda"
          {...attributes}
          {...listeners}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <GripVertical className="h-5 w-5" aria-hidden />
        </button>
      ) : (
        <span className="hidden w-9 shrink-0 md:block" aria-hidden />
      )}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2 text-left transition-colors hover:bg-accent/50"
        onClick={() => {
          onEdit(cat);
        }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center text-xl leading-none">
          {cat.icon ? (
            <span aria-hidden>{cat.icon}</span>
          ) : (
            <span className="text-muted-foreground">·</span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{cat.name}</span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {cat.sort_order}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label="Meni za kategoriju"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => {
              onEdit(cat);
            }}
          >
            <Pencil className="mr-2 h-4 w-4" aria-hidden />
            Uredi
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={cat.is_system}
            className="text-destructive focus:text-destructive"
            onClick={() => {
              if (!cat.is_system) onRequestDelete(cat);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden />
            Obriši
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function CategoriesClient({ categories }: { categories: CategoryListItem[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('troskovi');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<CategoryListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryListItem | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const isDesktop = !useIsMobile();

  useEffect(() => {
    if (!isDesktop) {
      setReorderMode(false);
    }
  }, [isDesktop]);

  const kinds = useMemo(() => kindsForTabId(tab), [tab]);

  const filtered = useMemo(
    () => categories.filter((c) => kinds.includes(c.kind as CategoryInput['kind'])),
    [categories, kinds],
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'bs'),
      ),
    [filtered],
  );

  const [itemIds, setItemIds] = useState<string[]>(() => sorted.map((c) => c.id));

  useEffect(() => {
    setItemIds(sorted.map((c) => c.id));
  }, [sorted]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const parentOptions = useMemo(() => {
    return categories
      .filter((c) => kinds.includes(c.kind as CategoryInput['kind']) && c.id !== editing?.id)
      .map((c) => ({ id: c.id, name: c.name }));
  }, [categories, kinds, editing?.id]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const prev = [...itemIds];
    const oldIndex = prev.indexOf(active.id as string);
    const newIndex = prev.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(prev, oldIndex, newIndex);
    setItemIds(next);
    const result = await reorderCategories(next);
    if (!result.success) {
      setItemIds(prev);
      if (result.error === 'VALIDATION_ERROR') {
        const msg =
          '_root' in result.details && result.details._root[0]
            ? result.details._root[0]
            : 'Redoslijed nije validan.';
        toast.error(msg);
        return;
      }
      if (result.error === 'UNAUTHORIZED') {
        toast.error('Sesija je istekla.');
        return;
      }
      toast.error('Nije uspjelo spremiti redoslijed.');
      return;
    }
    router.refresh();
  }

  function openCreate() {
    setDialogMode('create');
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(c: CategoryListItem) {
    setDialogMode('edit');
    setEditing(c);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteCategory(deleteTarget.id);
    setDeleteTarget(null);
    if (result.success) {
      toast.success('Kategorija je obrisana.');
      router.refresh();
      return;
    }
    if (result.error === 'SYSTEM_CATEGORY') {
      toast.error('Sistemske kategorije ne mogu se obrisati.');
      return;
    }
    if (result.error === 'NOT_FOUND') {
      toast.error('Kategorija više ne postoji.');
      router.refresh();
      return;
    }
    toast.error('Brisanje nije uspjelo.');
  }

  const orderedRows = useMemo(() => {
    const map = new Map(sorted.map((c) => [c.id, c]));
    return itemIds.map((id) => map.get(id)).filter(Boolean) as CategoryListItem[];
  }, [sorted, itemIds]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Kategorije</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {isDesktop ? (
            <Button
              type="button"
              variant={reorderMode ? 'secondary' : 'outline'}
              className="h-11 min-h-[44px] w-full sm:w-auto"
              onClick={() => {
                setReorderMode((v) => !v);
              }}
            >
              {reorderMode ? 'Gotovo s redom' : 'Uredi redoslijed'}
            </Button>
          ) : null}
          <Button type="button" className="h-11 min-h-[44px] w-full sm:w-auto" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Dodaj kategoriju
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as TabId);
        }}
        className="w-full"
      >
        <TabsList className="grid h-auto w-full grid-cols-3 p-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="min-h-11 px-2 text-xs sm:text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-4">
            {t.id === tab ? (
              orderedRows.length === 0 ? (
                <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-8 text-center">
                  <p className="text-muted-foreground text-sm">Nema kategorija u ovoj grupi.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={openCreate}
                  >
                    Dodaj kategoriju
                  </Button>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => {
                    void handleDragEnd(e);
                  }}
                >
                  <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                    <ul
                      className="list-none rounded-xl border bg-card"
                      aria-label={`Kategorije — ${t.label}`}
                    >
                      {orderedRows.map((c) => (
                        <li key={c.id}>
                          <SortableRow
                            cat={c}
                            reorderMode={reorderMode && isDesktop}
                            showHandle={isDesktop}
                            onEdit={openEdit}
                            onRequestDelete={setDeleteTarget}
                          />
                        </li>
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              )
            ) : null}
          </TabsContent>
        ))}
      </Tabs>

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        defaultKind={defaultKindForTab(tab)}
        category={editing}
        parentOptions={parentOptions}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Obrisati kategoriju?</AlertDialogTitle>
            <AlertDialogDescription>
              Ovo je trajno za tvoje podatke — kategorija će nestati s liste. Transakcije koje su je
              koristile ostaju, ali bez ove kategorije.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Odustani</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void confirmDelete();
              }}
            >
              Obriši
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
