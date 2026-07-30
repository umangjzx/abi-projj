import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Percent, Plus, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Checkbox, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState, TableSkeleton } from '@/components/ui/feedback';
import { ProductImage } from '@/components/product/ProductImage';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import type { Offer } from '@/types';

interface OfferFormValues {
  title: string;
  subtitle: string;
  description: string;
  bannerUrl: string;
  ctaLabel: string;
  ctaHref: string;
  type: 'BANNER' | 'CATEGORY_DISCOUNT' | 'PRODUCT_DISCOUNT' | 'COMBO';
  discountPercent: string;
  priority: string;
  endsAt: string;
  isActive: boolean;
}

const EMPTY: OfferFormValues = {
  title: '',
  subtitle: '',
  description: '',
  bannerUrl: '',
  ctaLabel: 'Shop now',
  ctaHref: '/products',
  type: 'BANNER',
  discountPercent: '',
  priority: '0',
  endsAt: '',
  isActive: true,
};

export default function AdminOffersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'offers'],
    queryFn: () => api.list<Offer[]>('/offers?limit=50'),
  });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<OfferFormValues>(EMPTY);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Offer | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (offer: Offer) => {
    setEditingId(offer.id);
    setForm({
      title: offer.title,
      subtitle: offer.subtitle ?? '',
      description: offer.description ?? '',
      bannerUrl: offer.bannerUrl ?? '',
      ctaLabel: offer.ctaLabel ?? '',
      ctaHref: offer.ctaHref ?? '',
      type: offer.type,
      discountPercent: offer.discountPercent ? String(offer.discountPercent) : '',
      priority: String(offer.priority),
      endsAt: offer.endsAt ? offer.endsAt.slice(0, 10) : '',
      isActive: offer.isActive,
    });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        discountPercent: form.discountPercent ? Number(form.discountPercent) : null,
        priority: Number(form.priority),
        endsAt: form.endsAt || null,
      };
      return editingId ? api.patch(`/offers/${editingId}`, payload) : api.post('/offers', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'offers'] });
      queryClient.invalidateQueries({ queryKey: ['offers', 'active'] });
      setDialogOpen(false);
      toast.success(editingId ? 'Offer updated' : 'Offer created');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/offers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'offers'] });
      queryClient.invalidateQueries({ queryKey: ['offers', 'active'] });
      setDeleteTarget(null);
      toast.success('Offer deleted');
    },
  });

  const offers = data?.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Offers</h1>
        <Button onClick={openCreate}>
          <Plus />
          Add offer
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : !offers || offers.length === 0 ? (
        <EmptyState icon={<Percent />} title="No offers yet" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer) => (
            <div key={offer.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
              <div className="relative aspect-[16/9] bg-muted">
                <ProductImage src={offer.bannerUrl} alt={offer.title} className="size-full object-cover" />
                <Badge variant={offer.isActive ? 'success' : 'muted'} size="sm" className="absolute left-2 top-2">
                  {offer.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="p-4">
                <p className="font-semibold">{offer.title}</p>
                <p className="text-xs text-muted-foreground">{offer.subtitle}</p>
                {offer.endsAt && <p className="mt-1 text-xs text-muted-foreground">Ends {formatDate(offer.endsAt)}</p>}
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(offer)}>
                    <Edit />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(offer)}>
                    <Trash2 />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit offer' : 'Add offer'}</DialogTitle>
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
              <Label htmlFor="offer-title">Title</Label>
              <Input id="offer-title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-subtitle">Subtitle</Label>
              <Input id="offer-subtitle" value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-desc">Description</Label>
              <Textarea id="offer-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-banner">Banner image URL</Label>
              <Input id="offer-banner" value={form.bannerUrl} onChange={(e) => setForm((f) => ({ ...f, bannerUrl: e.target.value }))} placeholder="https://…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="offer-cta-label">Button label</Label>
                <Input id="offer-cta-label" value={form.ctaLabel} onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-cta-href">Button link</Label>
                <Input id="offer-cta-href" value={form.ctaHref} onChange={(e) => setForm((f) => ({ ...f, ctaHref: e.target.value }))} placeholder="/products?category=milk" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as OfferFormValues['type'] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANNER">Banner</SelectItem>
                    <SelectItem value="CATEGORY_DISCOUNT">Category discount</SelectItem>
                    <SelectItem value="PRODUCT_DISCOUNT">Product discount</SelectItem>
                    <SelectItem value="COMBO">Combo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-discount">Discount %</Label>
                <Input id="offer-discount" type="number" min="1" max="90" value={form.discountPercent} onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-priority">Priority</Label>
                <Input id="offer-priority" type="number" min="0" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-ends">Ends on (optional)</Label>
              <Input id="offer-ends" type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
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
            <DialogTitle>Delete "{deleteTarget?.title}"?</DialogTitle>
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
