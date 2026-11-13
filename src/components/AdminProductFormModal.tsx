import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, ImagePlus, Loader2, Plus, X } from 'lucide-react';
import type { Category, Product, ProductCategory, ProductStatus } from '../types/shop.ts';
import { apiUrl, safeReadJson } from '../utils/api.ts';
import { compressImageToWebP } from '../utils/format.ts';
import { SafeImage } from './SafeImage.tsx';

interface AdminProductFormModalProps {
  open: boolean;
  editingProduct: Product | null;
  categories: Category[];
  authToken: string | null;
  onClose: () => void;
  onSaved: () => void;
  onCategoryCreated: (category: Category) => void;
}

export function AdminProductFormModal({
  open,
  editingProduct,
  categories,
  authToken,
  onClose,
  onSaved,
  onCategoryCreated,
}: AdminProductFormModalProps) {
  const [name, setName] = useState(editingProduct?.name || '');
  const [sku, setSku] = useState(editingProduct?.sku || '');
  const [category, setCategory] = useState<ProductCategory>(
    editingProduct?.category || categories[0]?.slug || 'shoes'
  );
  const [priceUsd, setPriceUsd] = useState(
    editingProduct ? String(editingProduct.priceUsd) : ''
  );
  const [discountPriceUsd, setDiscountPriceUsd] = useState(
    editingProduct?.discountPriceUsd != null
      ? String(editingProduct.discountPriceUsd)
      : ''
  );
  const [stock, setStock] = useState(
    editingProduct ? String(editingProduct.stock) : '10'
  );
  const [status, setStatus] = useState<ProductStatus>(
    editingProduct?.status || 'available'
  );
  const [description, setDescription] = useState(editingProduct?.description || '');
  const [imageUrl, setImageUrl] = useState(editingProduct?.imageUrl || '');
  const [sizesInput, setSizesInput] = useState(
    editingProduct?.sizes?.join(', ') || ''
  );
  const [colorsInput, setColorsInput] = useState(
    editingProduct?.colors?.join(', ') || ''
  );
  const [isNew, setIsNew] = useState(editingProduct?.isNew ?? true);
  const [isPopular, setIsPopular] = useState(editingProduct?.isPopular ?? false);

  // Inline quick category creator
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatNameKm, setNewCatNameKm] = useState('');
  const [newCatNameEn, setNewCatNameEn] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const authHeaders: Record<string, string> = {};
  if (authToken) {
    authHeaders.Authorization = `Bearer ${authToken}`;
  }

  const handleQuickCreateCategory = async () => {
    if (!newCatNameKm.trim()) return;
    setError('');
    setCreatingCat(true);
    try {
      const res = await fetch(apiUrl('/api/admin/categories'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        credentials: 'include',
        body: JSON.stringify({
          nameKm: newCatNameKm.trim(),
          nameEn: newCatNameEn.trim(),
        }),
      });
      const data = await safeReadJson<{ category?: Category; error?: string }>(res);
      if (!data || !res.ok || !data.category) {
        setError(data?.error || 'មិនអាចបន្ថែមប្រភេទទំនិញថ្មីបានទេ');
      } else {
        onCategoryCreated(data.category);
        setCategory(data.category.slug);
        setNewCatNameKm('');
        setNewCatNameEn('');
        setAddingCategory(false);
      }
    } catch {
      setError('មានបញ្ហាក្នុងការបន្ថែមប្រភេទទំនិញ');
    } finally {
      setCreatingCat(false);
    }
  };

  const handleImageFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setUploading(true);
    try {
      const optimized = await compressImageToWebP(file);
      const formData = new FormData();
      formData.append('image', optimized);

      const res = await fetch(apiUrl('/api/admin/upload'), {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: formData,
      });

      const data = await safeReadJson<{ imageUrl?: string; error?: string }>(res);
      if (!data || !res.ok || !data.imageUrl) {
        setError(data?.error || 'មិនអាច Upload រូបភាពបានទេ');
      } else {
        setImageUrl(data.imageUrl);
      }
    } catch {
      setError('មានបញ្ហាក្នុងការ Upload រូបភាព');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        category,
        priceUsd: Number(priceUsd),
        discountPriceUsd: discountPriceUsd.trim() ? Number(discountPriceUsd) : null,
        stock: Math.max(0, Math.floor(Number(stock))),
        status,
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        sizes: sizesInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        colors: colorsInput
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        isNew,
        isPopular,
      };

      const url = editingProduct
        ? apiUrl(`/api/admin/products/${editingProduct.id}`)
        : apiUrl('/api/admin/products');
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await safeReadJson<{ error?: string }>(res);
      if (!data || !res.ok) {
        setError(data?.error || 'មិនអាចរក្សាទុកផលិតផលបានទេ');
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError('មានបញ្ហាក្នុងការភ្ជាប់ទៅ Server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#ECE8DF] px-5">
          <h3 className="text-base sm:text-lg font-semibold text-[#111111]">
            {editingProduct ? 'កែប្រែព័ត៌មានផលិតផល' : 'បន្ថែមផលិតផលថ្មី'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="បិទ"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#FAF9F6]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="rounded-2xl border border-[#E2DDD3] bg-[#FAF9F6] p-4">
            <p className="text-xs font-medium text-[#4A463E] mb-3">
              រូបភាពផលិតផល (បម្លែងជា WebP ស្វ័យប្រវត្តិ) *
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="h-28 w-36 shrink-0 overflow-hidden rounded-xl border border-[#E2DDD3] bg-white">
                {imageUrl ? (
                  <SafeImage
                    src={imageUrl}
                    alt={name || 'Product Preview'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-[#8A8478]">
                    គ្មានរូបភាព
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 w-full">
                <div className="flex flex-wrap gap-2">
                  <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#111111] px-4 text-xs font-semibold text-white hover:bg-[#262626]">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    <span>ជ្រើសពី Gallery</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                  </label>

                  <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#111111] bg-white px-4 text-xs font-semibold text-[#111111] hover:bg-[#FAF9F6]">
                    <Camera className="h-4 w-4" />
                    <span>ថតរូបផ្ទាល់</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="ឬបញ្ចូល URL រូបភាព..."
                  className="h-10 w-full rounded-lg border border-[#E2DDD3] bg-white px-3 text-xs font-mono-num"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#4A463E] mb-1">
                ឈ្មោះផលិតផល *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ឧ. ស្បែកជើងស្បែកប្រណីត..."
                className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3.5 text-sm focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4A463E] mb-1">
                លេខកូដផលិតផល (SKU) *
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="ODS-SHOE-009"
                className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3.5 text-sm font-mono-num uppercase focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-[#4A463E]">
                  ប្រភេទផលិតផល *
                </label>
                <button
                  type="button"
                  onClick={() => setAddingCategory((v) => !v)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#9A6F04] hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  <span>{addingCategory ? 'បោះបង់' : 'បន្ថែមប្រភេទថ្មី'}</span>
                </button>
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-sm focus:border-[#111111] focus:bg-white focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.nameKm} {c.nameEn ? `(${c.nameEn})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {addingCategory && (
              <div className="sm:col-span-2 rounded-xl border border-[#C9A227]/50 bg-[#FAF9F6] p-3 space-y-2">
                <p className="text-xs font-semibold text-[#111111]">
                  បង្កើតប្រភេទទំនិញថ្មីរហ័ស
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newCatNameKm}
                    onChange={(e) => setNewCatNameKm(e.target.value)}
                    placeholder="ឈ្មោះខ្មែរ (ឧ. គ្រឿងសម្អាង)"
                    className="h-10 rounded-lg border border-[#E2DDD3] bg-white px-3 text-xs"
                  />
                  <input
                    type="text"
                    value={newCatNameEn}
                    onChange={(e) => setNewCatNameEn(e.target.value)}
                    placeholder="English Slug (ឧ. Cosmetics)"
                    className="h-10 rounded-lg border border-[#E2DDD3] bg-white px-3 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleQuickCreateCategory}
                    disabled={creatingCat || !newCatNameKm.trim()}
                    className="h-10 rounded-lg bg-[#111111] px-3 text-xs font-semibold text-white disabled:opacity-45"
                  >
                    {creatingCat ? 'កំពុងបង្កើត...' : 'រក្សាទុកប្រភេទ'}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#4A463E] mb-1">
                តម្លៃលក់ (USD) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                inputMode="decimal"
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                placeholder="89.00"
                className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3.5 text-sm font-mono-num focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4A463E] mb-1">
                តម្លៃបញ្ចុះតម្លៃ (USD - បើមាន)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={discountPriceUsd}
                onChange={(e) => setDiscountPriceUsd(e.target.value)}
                placeholder="74.00"
                className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3.5 text-sm font-mono-num focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4A463E] mb-1">
                ចំនួនស្តុក (Stock) *
              </label>
              <input
                type="number"
                min="0"
                required
                inputMode="numeric"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3.5 text-sm font-mono-num focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4A463E] mb-1">
                ស្ថានភាពទំនិញ
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductStatus)}
                className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3 text-sm focus:border-[#111111] focus:bg-white focus:outline-none"
              >
                <option value="available">មានក្នុងស្តុក (Available)</option>
                <option value="out_of_stock">អស់ពីស្តុក (Out of Stock)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4A463E] mb-1">
                ទំហំ (Sizes - បំបែកដោយក្បៀស)
              </label>
              <input
                type="text"
                value={sizesInput}
                onChange={(e) => setSizesInput(e.target.value)}
                placeholder="39, 40, 41, 42 ឬ S, M, L"
                className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3.5 text-sm focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4A463E] mb-1">
                ពណ៌ (Colors - បំបែកដោយក្បៀស)
              </label>
              <input
                type="text"
                value={colorsInput}
                onChange={(e) => setColorsInput(e.target.value)}
                placeholder="ខ្មៅ, មាស, ស"
                className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3.5 text-sm focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#4A463E] mb-1">
                ការពិពណ៌នាផលិតផល
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ព័ត៌មានលម្អិតអំពីសាច់ក្រណាត់ ស្បែក ឬគុណភាព..."
                className="w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] p-3.5 text-sm focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-5 pt-1">
              <label className="flex items-center gap-2 text-sm text-[#111111] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isNew}
                  onChange={(e) => setIsNew(e.target.checked)}
                  className="h-4 w-4 rounded accent-[#111111]"
                />
                <span>បង្ហាញជាផលិតផលថ្មីៗ</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-[#111111] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPopular}
                  onChange={(e) => setIsPopular(e.target.checked)}
                  className="h-4 w-4 rounded accent-[#111111]"
                />
                <span>បង្ហាញជាផលិតផលពេញនិយម</span>
              </label>
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2.5 pt-2 pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl border border-[#E2DDD3] px-5 text-sm font-medium text-[#4A463E]"
            >
              បោះបង់
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex h-11 items-center gap-2 rounded-xl bg-[#111111] px-6 text-sm font-semibold text-white hover:bg-[#262626] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{editingProduct ? 'រក្សាទុកការកែប្រែ' : 'បន្ថែមផលិតផល'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
