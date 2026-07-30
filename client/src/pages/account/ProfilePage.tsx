import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Star, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { AddressForm } from '@/components/account/AddressForm';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import type { Address } from '@/types';

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Profile & addresses</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your personal details and delivery addresses.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileForm />
        </TabsContent>
        <TabsContent value="addresses">
          <AddressList />
        </TabsContent>
        <TabsContent value="security">
          <SecurityForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [form, setForm] = React.useState({ name: user?.name ?? '', phone: user?.phone ?? '' });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await updateProfile(form);
      toast.success('Profile updated');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4 rounded-xl border border-border bg-card p-5 shadow-soft">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" value={user?.email ?? ''} disabled />
        <p className="text-xs text-muted-foreground">Your email address cannot be changed.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" icon={<User />} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone number</Label>
        <Input id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="98400 12345" />
      </div>
      <Button type="submit" loading={isSubmitting}>
        Save changes
      </Button>
    </form>
  );
}

function AddressList() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const { data: addresses, isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.get<Address[]>('/addresses'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/addresses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      toast.success('Address removed');
    },
    onError: (err: ApiError) => toast.error('Could not remove address', err.message),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => api.post(`/addresses/${id}/default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      toast.success('Default address updated');
    },
  });

  const editingAddress = addresses?.find((a) => a.id === editingId);

  if (isLoading) return null;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setEditingId(null);
            setDialogOpen(true);
          }}
        >
          <Plus />
          Add address
        </Button>
      </div>

      {!addresses || addresses.length === 0 ? (
        <EmptyState icon={<MapPin />} title="No saved addresses" description="Add an address to speed up checkout." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <div key={address.id} className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    {address.label}
                    {address.isDefault && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-primary">
                        <Star className="size-3 fill-current" />
                        Default
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{address.fullName}</p>
                </div>
                <button
                  onClick={() => remove.mutate(address.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete address"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {address.line1}, {address.city}, {address.state} {address.pincode}
              </p>
              <p className="text-sm text-muted-foreground">{address.phone}</p>

              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingId(address.id);
                    setDialogOpen(true);
                  }}
                >
                  Edit
                </Button>
                {!address.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => setDefault.mutate(address.id)}>
                    Set as default
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit address' : 'Add a new address'}</DialogTitle>
          </DialogHeader>
          <AddressForm
            addressId={editingId ?? undefined}
            initial={editingAddress}
            onSuccess={() => {
              setDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ['addresses'] });
              toast.success(editingId ? 'Address updated' : 'Address added');
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SecurityForm() {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [form, setForm] = React.useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirm) {
      setError('New passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      toast.success('Password changed', 'Please sign in again.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4 rounded-xl border border-border bg-card p-5 shadow-soft">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          type="password"
          required
          value={form.currentPassword}
          onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          type="password"
          required
          value={form.newPassword}
          onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" type="password" required value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} />
      </div>
      <Button type="submit" loading={isSubmitting}>
        Change password
      </Button>
      <p className="text-xs text-muted-foreground">You'll be signed out on all devices after changing your password.</p>
    </form>
  );
}
