'use client';

import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CategorySchema,
  EditSystemCategoryFormSchema,
  type CategoryInput,
  type EditSystemCategoryFormValues,
} from '@/lib/categories/validation';
import { slugify } from '@/lib/format/slugify';
import { createCategory, updateCategory, type CategoryFieldErrorDetails } from './actions';
import type { CategoryListItem } from './types';

const KIND_OPTIONS: { value: CategoryInput['kind']; label: string }[] = [
  { value: 'expense', label: 'Trošak' },
  { value: 'income', label: 'Prihod' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'saving', label: 'Štednja' },
  { value: 'investment', label: 'Investicija' },
];

function defaultCreateValues(kind: CategoryInput['kind']): CategoryInput {
  return {
    name: '',
    slug: '',
    icon: null,
    color: null,
    kind,
    parent_id: null,
  };
}

function toSystemFormValues(c: CategoryListItem): EditSystemCategoryFormValues {
  return {
    name: c.name,
    icon: c.icon,
    color: c.color,
  };
}

function toFullFormValues(c: CategoryListItem): CategoryInput {
  return {
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    color: c.color,
    kind: c.kind as CategoryInput['kind'],
    parent_id: c.parent_id,
  };
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  mode,
  defaultKind,
  category,
  parentOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  defaultKind: CategoryInput['kind'];
  category: CategoryListItem | null;
  parentOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [slugManual, setSlugManual] = useState(false);

  const isEditSystem = mode === 'edit' && category?.is_system;

  const systemForm = useForm<EditSystemCategoryFormValues>({
    resolver: zodResolver(EditSystemCategoryFormSchema) as Resolver<EditSystemCategoryFormValues>,
    defaultValues: category ? toSystemFormValues(category) : { name: '', icon: null, color: null },
    mode: 'onSubmit',
  });

  const fullForm = useForm<CategoryInput>({
    resolver: zodResolver(CategorySchema) as Resolver<CategoryInput>,
    defaultValues:
      mode === 'create'
        ? defaultCreateValues(defaultKind)
        : category
          ? toFullFormValues(category)
          : defaultCreateValues(defaultKind),
    mode: 'onSubmit',
  });

  useEffect(() => {
    if (!open) return;
    setSlugManual(false);
    if (mode === 'create') {
      fullForm.reset(defaultCreateValues(defaultKind));
    } else if (category) {
      if (category.is_system) {
        systemForm.reset(toSystemFormValues(category));
      } else {
        fullForm.reset(toFullFormValues(category));
      }
    }
  }, [open, mode, defaultKind, category, fullForm, systemForm]);

  async function onSubmitSystem(values: EditSystemCategoryFormValues) {
    if (!category) return;
    const result = await updateCategory(category.id, {
      name: values.name,
      icon: values.icon,
      color: values.color,
    });
    if (result.success) {
      toast.success('Kategorija je sačuvana.');
      onOpenChange(false);
      router.refresh();
      return;
    }
    if (
      result.error === 'VALIDATION_ERROR' &&
      'name' in result.details &&
      result.details.name?.[0]
    ) {
      systemForm.setError('name', { message: result.details.name[0] });
      return;
    }
    if (result.error === 'UNAUTHORIZED') {
      toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
      return;
    }
    if (result.error === 'NOT_FOUND') {
      toast.error('Kategorija više ne postoji.');
      router.refresh();
      return;
    }
    toast.error('Nije uspjelo.', { description: 'Pokušaj ponovo.' });
  }

  async function onSubmitFull(values: CategoryInput) {
    if (mode === 'create') {
      const result = await createCategory(values);
      if (result.success) {
        toast.success('Kategorija je dodana.');
        onOpenChange(false);
        router.refresh();
        return;
      }
      if (result.error === 'SLUG_CONFLICT') {
        fullForm.setError('slug', { message: 'Ovaj slug već postoji. Izmijeni ga.' });
        return;
      }
      if (result.error === 'VALIDATION_ERROR') {
        const d = result.details;
        if (d.name?.[0]) fullForm.setError('name', { message: d.name[0] });
        if (d.slug?.[0]) fullForm.setError('slug', { message: d.slug[0] });
        if (d.kind?.[0]) fullForm.setError('kind', { message: d.kind[0] });
        if (d.parent_id?.[0]) fullForm.setError('parent_id', { message: d.parent_id[0] });
        return;
      }
      if (result.error === 'UNAUTHORIZED') {
        toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
        return;
      }
      toast.error('Nije uspjelo.', { description: 'Pokušaj ponovo.' });
      return;
    }

    if (!category) return;
    const result = await updateCategory(category.id, values);
    if (result.success) {
      toast.success('Kategorija je sačuvana.');
      onOpenChange(false);
      router.refresh();
      return;
    }
    if (result.error === 'SLUG_CONFLICT') {
      fullForm.setError('slug', { message: 'Ovaj slug već postoji. Izmijeni ga.' });
      return;
    }
    if (result.error === 'VALIDATION_ERROR') {
      const d = result.details;
      if ('_root' in d && d._root.length > 0) {
        toast.error(d._root[0]);
        return;
      }
      const f = d as CategoryFieldErrorDetails;
      if (f.name?.[0]) fullForm.setError('name', { message: f.name[0] });
      if (f.slug?.[0]) fullForm.setError('slug', { message: f.slug[0] });
      if (f.kind?.[0]) fullForm.setError('kind', { message: f.kind[0] });
      if (f.parent_id?.[0]) fullForm.setError('parent_id', { message: f.parent_id[0] });
      return;
    }
    if (result.error === 'UNAUTHORIZED') {
      toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
      return;
    }
    if (result.error === 'NOT_FOUND') {
      toast.error('Kategorija više ne postoji.');
      router.refresh();
      return;
    }
    toast.error('Nije uspjelo.', { description: 'Pokušaj ponovo.' });
  }

  const submitting = isEditSystem
    ? systemForm.formState.isSubmitting
    : fullForm.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nova kategorija' : 'Uredi kategoriju'}</DialogTitle>
        </DialogHeader>

        {isEditSystem ? (
          <Form {...systemForm}>
            <form
              onSubmit={(e) => {
                void systemForm.handleSubmit(onSubmitSystem)(e);
              }}
              className="space-y-4"
            >
              <FormField
                control={systemForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Naziv</FormLabel>
                    <FormControl>
                      <Input {...field} className="h-11" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={systemForm.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ikonica (emoji)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        className="h-11"
                        placeholder="npr. 🛒"
                        maxLength={10}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={systemForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Boja (opcionalno)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        className="h-11 font-mono text-sm"
                        placeholder="#RRGGBB"
                      />
                    </FormControl>
                    <FormDescription>Heks u formatu #RRGGBB.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                  }}
                >
                  Odustani
                </Button>
                <Button type="submit" disabled={submitting} className="min-h-[44px]">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sačuvaj'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <Form {...fullForm}>
            <form
              onSubmit={(e) => {
                void fullForm.handleSubmit(onSubmitFull)(e);
              }}
              className="space-y-4"
            >
              <FormField
                control={fullForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Naziv</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="h-11"
                        autoComplete="off"
                        onBlur={(e) => {
                          field.onBlur();
                          if (mode === 'create' && !slugManual) {
                            const s = slugify(e.target.value);
                            if (s) fullForm.setValue('slug', s, { shouldValidate: true });
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={fullForm.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="h-11 font-mono text-sm"
                        autoComplete="off"
                        onChange={(e) => {
                          setSlugManual(true);
                          field.onChange(e);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Generiše se iz naziva pri prvom napuštanju polja; možeš ručno izmijeniti.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={fullForm.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tip</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={mode === 'edit'}
                    >
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Odaberi" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {KIND_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={fullForm.control}
                name="parent_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Roditeljska kategorija</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v === '__none__' ? null : v);
                      }}
                      value={field.value ?? '__none__'}
                    >
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Nijedna" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Nijedna</SelectItem>
                        {parentOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={fullForm.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ikonica (emoji)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} className="h-11" maxLength={10} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={fullForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Boja (opcionalno)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        className="h-11 font-mono text-sm"
                        placeholder="#RRGGBB"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                  }}
                >
                  Odustani
                </Button>
                <Button type="submit" disabled={submitting} className="min-h-[44px]">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sačuvaj'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
