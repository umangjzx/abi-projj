import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Plus, Ticket, Trash2 } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState, TableSkeleton } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import type { Coupon } from '@/types';

interface CouponFormValues {
  code: string;
  description: string;
  discountType: 'PERCENTAGE' | 'FLAT';
  value: string;
  minOrderValue: string;
  maxDiscount: string;
  usageLimit: string;
  perUserLimit: string;
  expiresAt: string;
  isActive: boolean;
}

const EMPTY: CouponFormValues = {
  code: '',
  description: '',
  discountType: 'PERCENTAGE',
  value: '',
  minOrderValue: '0',
  maxDiscount: '',
  usageLimit: '',
  perUserLimit: '1',
  expiresAt: '',
  isActive: true,
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-success/10 text-success',
  scheduled: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  expired: 'bg-muted text-muted-foreground',
  inactive: 'bg-destructive/10 text-destructive',
};

export default function AdminCouponsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: () => api.list<Coupon[]>('/coupons?limit=50'),
  });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<CouponFormValues>(EMPTY);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Coupon | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      description: coupon.description ?? '',
      discountType: coupon.discountType,
      value: String(coupon.value),
      minOrderValue: String(coupon.minOrderValue),
      maxDiscount: coupon.maxDiscount ? String(coupon.maxDiscount) : '',
      usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : '',
      perUserLimit: String(coupon.perUserLimit),
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : '',
      isActive: coupon.isActive,
    });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        value: Number(form.value),
        minOrderValue: Number(form.minOrderValue),
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        perUserLimit: Number(form.perUserLimit),
        expiresAt: form.expiresAt || null,
      };
      return editingId ? api.patch(`/coupons/${editingId}`, payload) : api.post('/coupons', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      setDialogOpen(false);
      toast.success(editingId ? 'Coupon updated' : 'Coupon created');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ softDeleted: boolean; message: string }>(`/coupons/${id}`),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      setDeleteTarget(null);
      toast.success(result.softDeleted ? 'Coupon deactivated' : 'Coupon deleted', result.message);
    },
  });

  const coupons = data?.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Coupons</h1>
        <Button onClick={openCreate}>
          <Plus />
          Add coupon
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-soft">
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : !coupons || coupons.length === 0 ? (
          <EmptyState icon={<Ticket />} title="No coupons yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Min. order</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell>
                    <p className="font-display font-bold text-primary">{coupon.code}</p>
                    <p className="text-xs text-muted-foreground">{coupon.description}</p>
                  </TableCell>
                  <TableCell>{coupon.discountType === 'PERCENTAGE' ? `${coupon.value}%` : formatCurrency(coupon.value)}</TableCell>
                  <TableCell>{formatCurrency(coupon.minOrderValue)}</TableCell>
                  <TableCell>
                    {coupon.usedCount}
                    {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{coupon.expiresAt ? formatDate(coupon.expiresAt) : 'Never'}</TableCell>
                  <TableCell>
                    <Badge className={cn(STATUS_STYLES[coupon.status])} variant="outline" size="sm">
                      {coupon.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(coupon)} aria-label="Edit coupon">
                        <Edit />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(coupon)} aria-label="Delete coupon">
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit coupon' : 'Add coupon'}</DialogTitle>
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
              <Label htmlFor="coupon-code">Code</Label>
              <Input id="coupon-code" required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SAVE20" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon-desc">Description</Label>
              <Input id="coupon-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Discount type</Label>
                <Select value={form.discountType} onValueChange={(v) => setForm((f) => ({ ...f, discountType: v as 'PERCENTAGE' | 'FLAT' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                    <SelectItem value="FLAT">Flat amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-value">Value</Label>
                <Input id="coupon-value" type="number" required min="1" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-min">Min. order value</Label>
                <Input id="coupon-min" type="number" min="0" value={form.minOrderValue} onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-max">Max discount (optional)</Label>
                <Input id="coupon-max" type="number" min="0" value={form.maxDiscount} onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-usage">Total usage limit</Label>
                <Input id="coupon-usage" type="number" min="1" value={form.usageLimit} onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))} placeholder="Unlimited" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-peruser">Per-user limit</Label>
                <Input id="coupon-peruser" type="number" min="1" value={form.perUserLimit} onChange={(e) => setForm((f) => ({ ...f, perUserLimit: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon-expires">Expires on (optional)</Label>
              <Input id="coupon-expires" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
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
            <DialogTitle>Delete "{deleteTarget?.code}"?</DialogTitle>
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
