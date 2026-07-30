import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/primitives';
import { Alert } from '@/components/ui/feedback';
import { api, ApiError } from '@/lib/api';
import type { Address } from '@/types';

export interface AddressFormValues {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

const EMPTY: AddressFormValues = {
  label: 'Home',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  isDefault: false,
};

export function AddressForm({
  initial,
  addressId,
  onSuccess,
}: {
  /** Accepts the raw Address shape too -- nullable fields are normalised below. */
  initial?: Partial<Address>;
  addressId?: string;
  onSuccess: (address: Address) => void;
}) {
  const [form, setForm] = React.useState<AddressFormValues>({
    ...EMPTY,
    ...initial,
    line2: initial?.line2 ?? EMPTY.line2,
    landmark: initial?.landmark ?? EMPTY.landmark,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const set = (key: keyof AddressFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const mutation = useMutation({
    mutationFn: () =>
      addressId ? api.patch<Address>(`/addresses/${addressId}`, form) : api.post<Address>('/addresses', form),
    onSuccess,
    onError: (err: ApiError) => {
      setFieldErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.field, f.message])));
      if (!err.fieldErrors.length) setError(err.message);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setFieldErrors({});
        mutation.mutate();
      }}
      className="space-y-4"
      noValidate
    >
      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="label">Label</Label>
          <Input id="label" value={form.label} onChange={set('label')} placeholder="Home, Work…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" required value={form.fullName} onChange={set('fullName')} error={Boolean(fieldErrors.fullName)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone number</Label>
        <Input id="phone" required value={form.phone} onChange={set('phone')} placeholder="98400 12345" error={Boolean(fieldErrors.phone)} />
        {fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="line1">Address line 1</Label>
        <Input id="line1" required value={form.line1} onChange={set('line1')} placeholder="House no., street" error={Boolean(fieldErrors.line1)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="line2">Address line 2 (optional)</Label>
        <Input id="line2" value={form.line2} onChange={set('line2')} placeholder="Apartment, floor" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="landmark">Landmark (optional)</Label>
        <Input id="landmark" value={form.landmark} onChange={set('landmark')} placeholder="Near…" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" required value={form.city} onChange={set('city')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">State</Label>
          <Input id="state" required value={form.state} onChange={set('state')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pincode">PIN code</Label>
          <Input id="pincode" required value={form.pincode} onChange={set('pincode')} error={Boolean(fieldErrors.pincode)} />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <Checkbox checked={form.isDefault} onCheckedChange={(checked) => setForm((f) => ({ ...f, isDefault: Boolean(checked) }))} />
        Set as default address
      </label>

      <Button type="submit" className="w-full" loading={mutation.isPending}>
        {addressId ? 'Save changes' : 'Save address'}
      </Button>
    </form>
  );
}
