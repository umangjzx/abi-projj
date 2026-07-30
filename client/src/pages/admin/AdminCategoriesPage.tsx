import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, Plus, Tag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, EmptyState, TableSkeleton } from '@/components/ui/feedback';
import { ProductImage } from '@/components/product/ProductImage';
import { useToast } from '@/components/ui/toast';
import { useCategories } from '@/hooks/useCatalog';
import { api, ApiError } from '@/lib/api';
import type { Category } from '@/types';

interface CategoryFormValues {
  name: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
}

const EMPTY: CategoryFormValues = { name: '', description: '', imageUrl: '', isActive: true };

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: categories, isLoading } = useCategories();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<CategoryFormValues>(EMPTY);
  const [deleteTarget, setDeleteTarget] = React.useState<Category | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditingId(category.id);
    setForm({ name: category.name, description: category.description ?? '', imageUrl: category.imageUrl ?? '', isActive: category.isActive });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: () => (editingId ? api.patch(`/categories/${editingId}`, form) : api.post('/categories', form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setDialogOpen(false);
      toast.success(editingId ? 'Category updated' : 'Category created');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setDeleteTarget(null);
      toast.success('Category deleted');
    },
    onError: (err: ApiError) => {
      toast.error('Could not delete category', err.message);
      setDeleteTarget(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Categories</h1>
        <Button onClick={openCreate}>
          <Plus />
          Add category
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : !categories || categories.length === 0 ? (
        <EmptyState icon={<Tag />} title="No categories yet" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <div key={category.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
              <div className="aspect-[3/1] bg-muted">
                <ProductImage src={category.imageUrl} alt={category.name} className="size-full object-cover" />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{category.name}</p>
                    <p className="text-xs text-muted-foreground">{category.productCount} products</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(category)} aria-label="Edit category">
                      <Edit />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(category)} aria-label="Delete category">
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {category.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{category.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit category' : 'Add category'}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              save.mutate();
            }}
            className="space-y-4"
          >
            {error && <Alert variant="error">{error}</Alert>}
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea id="cat-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-image">Image URL</Label>
              <Input id="cat-image" value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isActive} onCheckedChange={(c) => setForm((f) => ({ ...f, isActive: Boolean(c) }))} />
              Active
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                {editingId ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>Categories with existing products cannot be deleted — deactivate them instead.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && remove.mutate(deleteTarget.id)} loading={remove.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
