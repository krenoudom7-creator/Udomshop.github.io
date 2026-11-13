import { useEffect, useState, type MouseEvent } from 'react';
import { Check, Heart, Minus, Plus, Share2, ShoppingBag, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Category, CurrencyCode, Product } from '../types/shop.ts';
import { formatMoney, getCategoryLabel } from '../utils/format.ts';
import { SafeImage } from './SafeImage.tsx';

interface ProductDetailModalProps {
  product: Product | null;
  categories: Category[];
  currency: CurrencyCode;
  khrRate: number;
  isWishlisted: boolean;
  onToggleWishlist: (productId: string) => void;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number, size?: string, color?: string) => void;
  onBuyNow: (product: Product, quantity: number, size?: string, color?: string) => void;
}

export function ProductDetailModal({
  product,
  categories,
  currency,
  khrRate,
  isWishlisted,
  onToggleWishlist,
  onClose,
  onAddToCart,
  onBuyNow,
}: ProductDetailModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | undefined>(
    product?.sizes?.[0]
  );
  const [selectedColor, setSelectedColor] = useState<string | undefined>(
    product?.colors?.[0]
  );
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!product) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [product, onClose]);

  if (!product) return null;

  const isAvailable = product.status === 'available' && product.stock > 0;
  const hasDiscount =
    product.discountPriceUsd !== null &&
    product.discountPriceUsd >= 0 &&
    product.discountPriceUsd < product.priceUsd;
  const activePrice = hasDiscount ? product.discountPriceUsd! : product.priceUsd;
  const discountPercent = hasDiscount
    ? Math.round(((product.priceUsd - activePrice) / product.priceUsd) * 100)
    : 0;

  const activeSize =
    selectedSize && product.sizes.includes(selectedSize) ? selectedSize : product.sizes[0];
  const activeColor =
    selectedColor && product.colors.includes(selectedColor) ? selectedColor : product.colors[0];

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!zoomed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setOrigin({ x, y });
  };

  const handleShare = async () => {
    try {
      const shareText = `${product.name} — $${activePrice.toFixed(2)} | ឧត្តម Shop`;
      if (navigator.share) {
        await navigator.share({ title: product.name, text: shareText, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(`${shareText} (${window.location.href})`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // Ignored if user cancels share
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div
        className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl bg-[#FAF9F6] shadow-2xl lg:grid lg:grid-cols-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleWishlist(product.id)}
            aria-label="រក្សាទុកក្នុងបញ្ជីពេញចិត្ត"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[#111111] shadow-sm backdrop-blur transition hover:bg-white active:scale-95"
          >
            <Heart
              className={`h-5 w-5 ${isWishlisted ? 'fill-red-600 text-red-600' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={handleShare}
            aria-label="ចែករំលែក"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[#111111] shadow-sm backdrop-blur transition hover:bg-white active:scale-95"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="បិទ"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[#111111] shadow-sm backdrop-blur transition hover:bg-white active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Image Gallery with Zoom */}
        <div className="relative bg-[#EFECE5] lg:col-span-7 flex flex-col justify-center">
          <div
            className={`relative aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[460px] w-full overflow-hidden select-none ${
              zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
            }`}
            onClick={() => setZoomed((z) => !z)}
            onMouseMove={handleMouseMove}
          >
            <div
              className="h-full w-full transition-transform duration-200 ease-out"
              style={{
                transform: zoomed ? 'scale(1.85)' : 'scale(1)',
                transformOrigin: `${origin.x}% ${origin.y}%`,
              }}
            >
              <SafeImage
                src={product.imageUrl}
                alt={product.name}
                priority
                className="h-full w-full object-cover"
              />
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setZoomed((z) => !z);
              }}
              className="absolute bottom-3 right-3 flex h-10 items-center gap-1.5 rounded-full bg-black/75 px-3.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black"
            >
              {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
              <span>{zoomed ? 'បង្រួម' : 'ពង្រីករូប'}</span>
            </button>
          </div>
        </div>

        {/* Purchase Details */}
        <div className="flex flex-1 flex-col overflow-y-auto p-5 sm:p-7 lg:col-span-5 bg-white">
          <div className="flex items-center gap-2 text-xs text-[#6B6559]">
            <span>{getCategoryLabel(product.category, categories)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">{product.sku}</span>
            {copied && <span className="text-emerald-700 font-medium">· បានចម្លងតំណ!</span>}
          </div>

          <h2 className="mt-2 text-xl sm:text-2xl font-semibold text-[#111111] leading-snug">
            {product.name}
          </h2>

          {/* Pricing */}
          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-bold tabular-nums text-[#111111]">
              {formatMoney(activePrice, currency, khrRate)}
            </span>
            {hasDiscount && (
              <>
                <span className="text-sm tabular-nums text-[#8A8478] line-through">
                  {formatMoney(product.priceUsd, currency, khrRate)}
                </span>
                <span className="text-xs font-semibold text-[#9A6F04]">
                  បញ្ចុះ {discountPercent}%
                </span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs tabular-nums text-[#6B6559]">
            {currency === 'USD'
              ? `ប្រមាណ ${formatMoney(activePrice, 'KHR', khrRate)}`
              : `តម្លៃដុល្លារ ${formatMoney(activePrice, 'USD', khrRate)}`}
          </p>

          {/* Stock Status */}
          <div className="mt-4 flex items-center gap-2 text-sm">
            {isAvailable ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
                <Check className="h-4 w-4" />
                មានក្នុងស្តុក ({product.stock} មុខ)
              </span>
            ) : (
              <span className="font-medium text-red-700">អស់ពីស្តុក (Out of Stock)</span>
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-[#4A463E]">{product.description}</p>

          {product.sizes && product.sizes.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-medium text-[#6B6559]">ជ្រើសរើសទំហំ (Size)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.sizes.map((size) => {
                  const active = activeSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSelectedSize(size)}
                      className={`min-h-[44px] min-w-[48px] rounded-lg border px-3 text-sm font-medium transition whitespace-nowrap ${
                        active
                          ? 'border-[#111111] bg-[#111111] text-white'
                          : 'border-[#E2DDD3] bg-[#FAF9F6] text-[#111111] hover:border-[#111111]'
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {product.colors && product.colors.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-[#6B6559]">ជ្រើសរើសពណ៌ (Color)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.colors.map((color) => {
                  const active = activeColor === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      className={`min-h-[44px] rounded-lg border px-3.5 text-sm font-medium transition whitespace-nowrap ${
                        active
                          ? 'border-[#B8860B] bg-[#B8860B]/10 text-[#111111]'
                          : 'border-[#E2DDD3] bg-[#FAF9F6] text-[#4A463E] hover:border-[#111111]'
                      }`}
                    >
                      {color}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity & Actions */}
          <div className="mt-6 pt-4 border-t border-[#ECE8DF] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#111111]">ចំនួន (Quantity)</span>
              <div className="flex items-center rounded-xl border border-[#E2DDD3] bg-[#FAF9F6]">
                <button
                  type="button"
                  aria-label="បន្ថយចំនួន"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={!isAvailable || quantity <= 1}
                  className="flex h-11 w-11 items-center justify-center text-[#111111] disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center text-sm font-semibold tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="បន្ថែមចំនួន"
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  disabled={!isAvailable || quantity >= product.stock}
                  className="flex h-11 w-11 items-center justify-center text-[#111111] disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1 pb-safe">
              <button
                type="button"
                disabled={!isAvailable}
                onClick={() => {
                  onAddToCart(product, quantity, activeSize, activeColor);
                  onClose();
                }}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#111111] bg-white px-4 text-sm font-semibold text-[#111111] transition hover:bg-[#FAF9F6] active:scale-[0.98] disabled:opacity-45 whitespace-nowrap"
              >
                <ShoppingBag className="h-4 w-4" />
                <span>បន្ថែមចូលកន្ត្រក</span>
              </button>
              <button
                type="button"
                disabled={!isAvailable}
                onClick={() => {
                  onBuyNow(product, quantity, activeSize, activeColor);
                  onClose();
                }}
                className="flex h-12 items-center justify-center rounded-xl bg-[#111111] px-4 text-sm font-semibold text-white transition hover:bg-[#262626] active:scale-[0.98] disabled:opacity-45 whitespace-nowrap"
              >
                ទិញភ្លាម
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
