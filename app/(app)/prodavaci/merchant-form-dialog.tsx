'use client';

import { useEffect, useState } from 'react';
import { useForm, type Resolver, type UseFormReturn } from 'react-hook-form';
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
import { CreateMerchantSchema, type CreateMerchantInput } from '@/lib/merchants/validation';
import { createMerchant, updateMerchant, type MerchantFieldErrorDetails } from './actions';
import type { MerchantListItem } from './types';

function defaultCreateValues(): CreateMerchantInput {
  return {
    canonical_name: '',
    display_name: '',
    default_category_id: null,
    icon: null,
    color: null,
  };
}

function toFormValues(m: MerchantListItem): CreateMerchantInput {
  return {
    canonical_name: m.canonical_name,
    display_name: m.display_name,
    default_category_id: m.default_category_id,
    icon: m.icon,
    color: m.color,
  };
}

export function MerchantFormDialog({
  open,
  onOpenChange,
  mode,
  merchant,
  categoryOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  merchant: MerchantListItem | null;
  categoryOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [syncDisplay, setSyncDisplay] = useState(true);

  const form = useForm<CreateMerchantInput>({
    resolver: zodResolver(CreateMerchantSchema) as Resolver<CreateMerchantInput>,
    defaultValues:
      mode === 'create'
        ? defaultCreateValues()
        : merchant
          ? toFormValues(merchant)
          : defaultCreateValues(),
    mode: 'onSubmit',
  });

  useEffect(() => {
    if (!open) return;
    setSyncDisplay(true);
    if (mode === 'create') {
      form.reset(defaultCreateValues());
    } else if (merchant) {
      form.reset(toFormValues(merchant));
    }
  }, [open, mode, merchant, form]);

  async function onSubmit(values: CreateMerchantInput) {
    if (mode === 'create') {
      const result = await createMerchant(values);
      if (result.success) {
        toast.success('Prodavač je dodan.');
        onOpenChange(false);
        router.refresh();
        return;
      }
      if (result.error === 'DUPLICATE_CANONICAL') {
        form.setError('canonical_name', {
          message: 'Već postoji prodavač s istim kanonskim imenom.',
        });
        return;
      }
      if (result.error === 'VALIDATION_ERROR') {
        const d = result.details;
        applyFieldErrors(form, d);
        return;
      }
      if (result.error === 'UNAUTHORIZED') {
        toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
        return;
      }
      toast.error('Nije uspjelo.', { description: 'Pokušaj ponovo.' });
      return;
    }

    if (!merchant) return;
    const result = await updateMerchant(merchant.id, values);
    if (result.success) {
      toast.success('Sačuvano.');
      onOpenChange(false);
      router.refresh();
      return;
    }
    if (result.error === 'DUPLICATE_CANONICAL') {
      form.setError('canonical_name', {
        message: 'Već postoji prodavač s istim kanonskim imenom.',
      });
      return;
    }
    if (result.error === 'VALIDATION_ERROR') {
      const d = result.details;
      if ('_root' in d && d._root.length > 0) {
        toast.error(d._root[0]);
        return;
      }
      applyFieldErrors(form, d as MerchantFieldErrorDetails);
      return;
    }
    if (result.error === 'UNAUTHORIZED') {
      toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
      return;
    }
    if (result.error === 'NOT_FOUND') {
      toast.error('Zapis više ne postoji.');
      router.refresh();
      return;
    }
    toast.error('Nije uspjelo.', { description: 'Pokušaj ponovo.' });
  }

  const submitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Novi prodavač' : 'Uredi prodavača'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={(e) => {
              void form.handleSubmit(onSubmit)(e);
            }}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="canonical_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kanonsko ime</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="h-11"
                      autoComplete="off"
                      onBlur={(e) => {
                        field.onBlur();
                        if (mode === 'create' && syncDisplay) {
                          const disp = form.getValues('display_name').trim();
                          if (disp === '') {
                            form.setValue('display_name', e.target.value.trim(), {
                              shouldValidate: true,
                            });
                          }
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prikazno ime</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value}
                      className="h-11"
                      autoComplete="off"
                      onChange={(ev) => {
                        setSyncDisplay(false);
                        field.onChange(ev);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="default_category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Podrazumijevana kategorija</FormLabel>
                  <Select
                    onValueChange={(v) => {
                      field.onChange(v === '__none__' ? null : v);
                    }}
                    value={field.value ?? '__none__'}
                  >
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Bez kategorije" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Bez kategorije</SelectItem>
                      {categoryOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
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
              control={form.control}
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
      </DialogContent>
    </Dialog>
  );
}

function applyFieldErrors(form: UseFormReturn<CreateMerchantInput>, d: MerchantFieldErrorDetails) {
  if (d.canonical_name?.[0]) form.setError('canonical_name', { message: d.canonical_name[0] });
  if (d.display_name?.[0]) form.setError('display_name', { message: d.display_name[0] });
  if (d.default_category_id?.[0]) {
    form.setError('default_category_id', { message: d.default_category_id[0] });
  }
  if (d.icon?.[0]) form.setError('icon', { message: d.icon[0] });
  if (d.color?.[0]) form.setError('color', { message: d.color[0] });
}
