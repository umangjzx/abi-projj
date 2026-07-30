import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Checkbox, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/primitives';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { ProductImage } from '@/components/product/ProductImage';
import { useToast } from '@/components/ui/toast';
import { useCategories } from '@/hooks/useCatalog';
import { api, ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/types';

interface VariantForm {
  id?: string;
  name: string;
  price: string;
  mrp: string;
  unit: string;
  packSize: string;
  weightGram: string;
  isDefault: boolean;
  isActive: boolean;
  stock: string;
  lowStockThreshold: string;
}

interface ImageForm {
  url: string;
  publicId?: string;
  alt: string;
  isPrimary: boolean;
}

const EMPTY_VARIANT: VariantForm = {
  name: '',
  price: '',
  mrp: '',
  unit: 'pc',
  packSize: '',
  weightGram: '',
  isDefault: false,
  isActive: true,
  stock: '0',
  lowStockThreshold: '15',
};

export default function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: categories } = useCategories();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => api.get<Product>(`/products/${id}`),
    enabled: isEdit,
  });

  const [name, setName] = React.useState('');
  const [shortDescription, setShortDescription] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [brand, setBrand] = React.useState('Butterman');
  const [tags, setTags] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [isFeatured, setIsFeatured] = React.useState(false);
  const [attributes, setAttributes] = React.useState<{ key: string; value: string }[]>([{ key: '', value: '' }]);
  const [images, setImages] = React.useState<ImageForm[]>([]);
  const [variants, setVariants] = React.useState<VariantForm[]>([{ ...EMPTY_VARIANT, isDefault: true }]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setShortDescription(existing.shortDescription ?? '');
    setDescription(existing.description);
    setCategoryId(existing.category?.id ?? '');
    setBrand(existing.brand);
    setTags(existing.tags.join(', '));
    setIsActive(existing.isActive);
    setIsFeatured(existing.isFeatured);
    setAttributes(
      Object.entries(existing.attributes).length
        ? Object.entries(existing.attributes).map(([key, value]) => ({ key, value: String(value) }))
        : [{ key: '', value: '' }],
    );
    setImages(existing.images.map((img) => ({ url: img.url, alt: img.alt, isPrimary: img.isPrimary })));
    setVariants(
      existing.variants.map((v) => ({
        id: v.id,
        name: v.name,
        price: String(v.price),
        mrp: String(v.mrp),
        unit: v.unit,
        packSize: v.packSize ?? '',
        weightGram: v.weightGram ? String(v.weightGram) : '',
        isDefault: v.isDefault,
        isActive: v.isActive,
        stock: String(v.stock),
        lowStockThreshold: String(v.lowStockThreshold),
      })),
    );
  }, [existing]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('images', file));
      formData.append('folder', 'products');
      const uploaded = await api.post<{ url: string; publicId: string | null }[]>('/uploads/images', formData);
      setImages((prev) => [
        ...prev,
        ...uploaded.map((u, i) => ({ url: u.url, publicId: u.publicId ?? undefined, alt: name, isPrimary: prev.length === 0 && i === 0 })),
      ]);
    } catch (err) {
      toast.error('Upload failed', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        shortDescription: shortDescription || undefined,
        description,
        categoryId,
        brand,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        isActive,
        isFeatured,
        attributes: Object.fromEntries(attributes.filter((a) => a.key.trim()).map((a) => [a.key.trim(), a.value])),
        images: images.map((img) => ({ url: img.url, publicId: img.publicId, alt: img.alt, isPrimary: img.isPrimary })),
        variants: variants.map((v) => ({
          id: v.id,
          name: v.name,
          price: Number(v.price),
          mrp: Number(v.mrp),
          unit: v.unit,
          packSize: v.packSize || undefined,
          weightGram: v.weightGram ? Number(v.weightGram) : undefined,
          isDefault: v.isDefault,
          isActive: v.isActive,
          stock: Number(v.stock),
          lowStockThreshold: Number(v.lowStockThreshold),
        })),
      };
      return isEdit ? api.patch<Product>(`/products/${id}`, payload) : api.post<Product>('/products', payload);
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      toast.success(isEdit ? 'Product updated' : 'Product created');
      navigate(`/admin/products/${product.id}/edit`);
    },
    onError: (err: ApiError) => {
      setFieldErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.field, f.message])));
      if (!err.fieldErrors.length) setError(err.message);
    },
  });

  const updateVariant = (index: number, patch: Partial<VariantForm>) =>
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  if (isEdit && isLoading) return <PageLoader />;

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="font-display text-xl font-bold">{isEdit ? 'Edit product' : 'Add product'}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setFieldErrors({});
          mutation.mutate();
        }}
        className="space-y-6"
      >
        {error && <Alert variant="error">{error}</Alert>}

        {/* --- basic info --- */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-4 font-display text-sm font-bold">Basic information</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">Product name</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} error={Boolean(fieldErrors.name)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand">Brand</Label>
              <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="shortDescription">Short description</Label>
              <Input id="shortDescription" maxLength={200} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">Full description</Label>
              <Textarea id="description" required minLength={10} className="min-h-32" value={description} onChange={(e) => setDescription(e.target.value)} error={Boolean(fieldErrors.description)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="milk, fresh, daily" />
            </div>
          </div>
          <div className="mt-4 flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isActive} onCheckedChange={(c) => setIsActive(Boolean(c))} />
              Active (visible to customers)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isFeatured} onCheckedChange={(c) => setIsFeatured(Boolean(c))} />
              Featured
            </label>
          </div>
        </section>

        {/* --- images --- */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Images</h2>
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} loading={uploading}>
                <Upload />
                Upload images
              </Button>
            </div>
          </div>
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images yet. Upload at least one.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {images.map((image, index) => (
                <div key={index} className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
                  <ProductImage src={image.url} alt={image.alt} className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.map((img, i) => ({ ...img, isPrimary: i === index })))}
                    className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                      image.isPrimary ? 'bg-primary text-primary-foreground' : 'bg-black/60 text-white opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {image.isPrimary ? 'Primary' : 'Set primary'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* --- attributes --- */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-4 font-display text-sm font-bold">Attributes</h2>
          <div className="space-y-2.5">
            {attributes.map((attr, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="Attribute (e.g. Fat content)"
                  value={attr.key}
                  onChange={(e) => setAttributes((prev) => prev.map((a, i) => (i === index ? { ...a, key: e.target.value } : a)))}
                />
                <Input
                  placeholder="Value (e.g. 3.0%)"
                  value={attr.value}
                  onChange={(e) => setAttributes((prev) => prev.map((a, i) => (i === index ? { ...a, value: e.target.value } : a)))}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => setAttributes((prev) => prev.filter((_, i) => i !== index))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setAttributes((prev) => [...prev, { key: '', value: '' }])}>
              <Plus />
              Add attribute
            </Button>
          </div>
        </section>

        {/* --- variants --- */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-4 font-display text-sm font-bold">Variants (pack sizes)</h2>
          <div className="space-y-4">
            {variants.map((variant, index) => (
              <div key={index} className="rounded-lg border border-border p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Variant name</Label>
                    <Input required value={variant.name} onChange={(e) => updateVariant(index, { name: e.target.value })} placeholder="500 ml pouch" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pack size label</Label>
                    <Input value={variant.packSize} onChange={(e) => updateVariant(index, { packSize: e.target.value })} placeholder="500 ml" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Price (₹)</Label>
                    <Input required type="number" min="0" step="0.01" value={variant.price} onChange={(e) => updateVariant(index, { price: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>MRP (₹)</Label>
                    <Input required type="number" min="0" step="0.01" value={variant.mrp} onChange={(e) => updateVariant(index, { mrp: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Unit</Label>
                    <Input value={variant.unit} onChange={(e) => updateVariant(index, { unit: e.target.value })} placeholder="pouch, bottle, box…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Stock</Label>
                    <Input type="number" min="0" value={variant.stock} onChange={(e) => updateVariant(index, { stock: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Low stock threshold</Label>
                    <Input type="number" min="0" value={variant.lowStockThreshold} onChange={(e) => updateVariant(index, { lowStockThreshold: e.target.value })} />
                  </div>
                </div>

                {Number(variant.price) > 0 && Number(variant.mrp) > Number(variant.price) && (
                  <p className="mt-2 text-xs text-success">
                    {Math.round(((Number(variant.mrp) - Number(variant.price)) / Number(variant.mrp)) * 100)}% off ·{' '}
                    {formatCurrency(Number(variant.price))}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={variant.isDefault} onCheckedChange={(c) => updateVariant(index, { isDefault: Boolean(c) })} />
                      Default
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={variant.isActive} onCheckedChange={(c) => updateVariant(index, { isActive: Boolean(c) })} />
                      Active
                    </label>
                  </div>
                  {variants.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setVariants((prev) => prev.filter((_, i) => i !== index))}>
                      <Trash2 />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setVariants((prev) => [...prev, { ...EMPTY_VARIANT }])}>
              <Plus />
              Add variant
            </Button>
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/products')}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </form>
    </div>
  );
}
