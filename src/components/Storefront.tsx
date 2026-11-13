import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Heart,
  Lock,
  MapPin,
  Menu,
  PackageSearch,
  Phone,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react';
import type {
  CartItem,
  Category,
  CurrencyCode,
  Product,
  ProductCategory,
  StoreSettings,
} from '../types/shop.ts';
import { getCategoryLabel, formatMoney } from '../utils/format.ts';
import { SafeImage } from './SafeImage.tsx';
import { ProductDetailModal } from './ProductDetailModal.tsx';
import { CartCheckoutDrawer } from './CartCheckoutDrawer.tsx';
import { OrderTrackerModal } from './OrderTrackerModal.tsx';

interface StorefrontProps {
  onNavigateAdmin: () => void;
}

const HERO_IMAGE = '/src/assets/images/hero_oudom_collection_1794578200596.jpg';

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_shoes', slug: 'shoes', nameKm: 'ស្បែកជើង', nameEn: 'Shoes', sortOrder: 1, createdAt: '', updatedAt: '' },
  { id: 'cat_clothing', slug: 'clothing', nameKm: 'សម្លៀកបំពាក់', nameEn: 'Clothing', sortOrder: 2, createdAt: '', updatedAt: '' },
  { id: 'cat_bags', slug: 'bags', nameKm: 'កាបូប', nameEn: 'Bags', sortOrder: 3, createdAt: '', updatedAt: '' },
  { id: 'cat_watches', slug: 'watches', nameKm: 'នាឡិកា', nameEn: 'Watches', sortOrder: 4, createdAt: '', updatedAt: '' },
  { id: 'cat_accessories', slug: 'accessories', nameKm: 'សម្ភារៈប្រើប្រាស់', nameEn: 'Accessories', sortOrder: 5, createdAt: '', updatedAt: '' },
];

type SortOption = 'newest' | 'bestselling' | 'price_asc' | 'price_desc';
type CollectionFilter = 'all' | 'new' | 'popular' | 'sale' | 'saved';

export function Storefront({ onNavigateAdmin }: StorefrontProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [khrRate, setKhrRate] = useState(4100);
  const [freeShippingThresholdUsd, setFreeShippingThresholdUsd] = useState(50);
  const [phnomPenhShippingUsd, setPhnomPenhShippingUsd] = useState(1.5);
  const [provinceShippingUsd, setProvinceShippingUsd] = useState(2.5);

  const [selectedCategory, setSelectedCategory] = useState<'all' | ProductCategory>('all');
  const [collectionTab, setCollectionTab] = useState<CollectionFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  const [wishlistIds, setWishlistIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('oudom_wishlist_ids');
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutInitialStep, setCheckoutInitialStep] = useState<'cart' | 'checkout'>('cart');
  const [cartToast, setCartToast] = useState('');

  const loadStoreData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [cfgRes, prodRes] = await Promise.all([
        fetch('/api/config/public'),
        fetch('/api/products'),
      ]);
      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as {
          khrRate?: number;
          freeShippingThresholdUsd?: number;
          phnomPenhShippingUsd?: number;
          provinceShippingUsd?: number;
          categories?: Category[];
          settings?: StoreSettings;
        };
        if (cfg.khrRate) setKhrRate(cfg.khrRate);
        if (cfg.freeShippingThresholdUsd !== undefined) {
          setFreeShippingThresholdUsd(cfg.freeShippingThresholdUsd);
        }
        if (cfg.phnomPenhShippingUsd !== undefined) {
          setPhnomPenhShippingUsd(cfg.phnomPenhShippingUsd);
        }
        if (cfg.provinceShippingUsd !== undefined) {
          setProvinceShippingUsd(cfg.provinceShippingUsd);
        }
        if (cfg.categories && cfg.categories.length > 0) {
          setCategories(cfg.categories);
        }
        if (cfg.settings) {
          setSettings(cfg.settings);
        }
      }
      const prodData = (await prodRes.json()) as { products?: Product[]; error?: string };
      if (!prodRes.ok) {
        setLoadError(prodData.error || 'មិនអាចទាញយកបញ្ជីផលិតផលបានទេ');
      } else {
        setProducts(prodData.products || []);
      }
    } catch {
      setLoadError('មានបញ្ហាក្នុងការភ្ជាប់ទៅប្រព័ន្ធ Server។ សូមព្យាយាមម្តងទៀត។');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStoreData();
  }, []);

  const toggleWishlist = (productId: string) => {
    setWishlistIds((prev) => {
      const exists = prev.includes(productId);
      const next = exists ? prev.filter((id) => id !== productId) : [...prev, productId];
      try {
        localStorage.setItem('oudom_wishlist_ids', JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      showToast(exists ? 'បានដកចេញពីបញ្ជីពេញចិត្ត' : 'បានរក្សាទុកក្នុងបញ្ជីពេញចិត្ត');
      return next;
    });
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (collectionTab === 'new' && !p.isNew) return false;
      if (collectionTab === 'popular' && !p.isPopular && p.soldCount <= 0) return false;
      if (
        collectionTab === 'sale' &&
        (p.discountPriceUsd === null || p.discountPriceUsd >= p.priceUsd)
      ) {
        return false;
      }
      if (collectionTab === 'saved' && !wishlistIds.includes(p.id)) {
        return false;
      }
      if (q) {
        const match =
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    const activePrice = (p: Product) =>
      p.discountPriceUsd !== null && p.discountPriceUsd < p.priceUsd
        ? p.discountPriceUsd
        : p.priceUsd;

    if (sortBy === 'price_asc') {
      return [...list].sort((a, b) => activePrice(a) - activePrice(b));
    }
    if (sortBy === 'price_desc') {
      return [...list].sort((a, b) => activePrice(b) - activePrice(a));
    }
    if (sortBy === 'bestselling') {
      return [...list].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
    }
    return list;
  }, [products, selectedCategory, collectionTab, searchQuery, sortBy, wishlistIds]);

  const totalCartItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  const showToast = (msg: string) => {
    setCartToast(msg);
    setTimeout(() => setCartToast(''), 2200);
  };

  const handleAddToCart = (
    product: Product,
    quantity = 1,
    size?: string,
    color?: string
  ) => {
    if (product.status === 'out_of_stock' || product.stock <= 0) return;

    const chosenSize = size ?? product.sizes?.[0];
    const chosenColor = color ?? product.colors?.[0];

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) =>
          item.product.id === product.id &&
          item.selectedSize === chosenSize &&
          item.selectedColor === chosenColor
      );
      if (existingIdx > -1) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: Math.min(product.stock, next[existingIdx].quantity + quantity),
        };
        return next;
      }
      return [
        ...prev,
        { product, quantity, selectedSize: chosenSize, selectedColor: chosenColor },
      ];
    });
    showToast(`បានបន្ថែម "${product.name}" ចូលកន្ត្រក`);
  };

  const handleBuyNow = (
    product: Product,
    quantity = 1,
    size?: string,
    color?: string
  ) => {
    handleAddToCart(product, quantity, size, color);
    setCheckoutInitialStep('checkout');
    setCartOpen(true);
  };

  const handleUpdateCartQty = (index: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item, i) => {
          if (i !== index) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          return { ...item, quantity: Math.min(item.product.stock, nextQty) };
        })
        .filter((x): x is CartItem => x !== null)
    );
  };

  const handleRemoveCartItem = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const scrollToCatalog = (cat?: 'all' | ProductCategory) => {
    if (cat) setSelectedCategory(cat);
    setMobileMenuOpen(false);
    document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#111111]">
      {/* Slim Dismissible Announcement Strip */}
      {settings?.announcementText && !announcementDismissed && (
        <div className="relative flex h-9 items-center justify-center bg-[#111111] px-8 text-[11px] sm:text-xs font-medium text-[#FAF9F6] print:hidden">
          <p className="truncate text-center">{settings.announcementText}</p>
          <button
            type="button"
            aria-label="បិទសារផ្សព្វផ្សាយ"
            onClick={() => setAnnouncementDismissed(true)}
            className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-full text-white/70 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Sticky Top Header (56px height <= 15% mobile sticky cap, strict 3-zone contract) */}
      <header className="sticky top-0 z-40 h-14 border-b border-[#E5E0D5] bg-[#FAF9F6]/92 backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6">
          {/* Zone 1: Brand Mark (single line) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label="បើកម៉ឺនុយ"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-11 w-11 -ml-2 items-center justify-center rounded-lg text-[#111111] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <a
              href="#top"
              className="flex items-center gap-2 text-lg font-bold tracking-tight text-[#111111] whitespace-nowrap shrink-0"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" fill="#111111" />
                <path
                  d="M8 9.5V13.2C8 15.3 9.7 17 12 17C14.3 17 16 15.3 16 13.2V9.5"
                  stroke="#C9A227"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="7.5" r="1.2" fill="#C9A227" />
              </svg>
              <span>{settings?.shopName || 'ឧត្តម Shop'}</span>
            </a>
          </div>

          {/* Zone 2: Clean single-line dynamic navigation links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#4A463E]">
            <button
              type="button"
              onClick={() => scrollToCatalog('all')}
              className="hover:text-[#111111] transition-colors whitespace-nowrap shrink-0"
            >
              ទំព័រដើម
            </button>
            {categories.slice(0, 5).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCatalog(cat.slug)}
                className="hover:text-[#111111] transition-colors whitespace-nowrap shrink-0"
              >
                {cat.nameKm}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single primary Cart action + Currency toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCurrency((c) => (c === 'USD' ? 'KHR' : 'USD'))}
              aria-label="ប្តូររូបិយប័ណ្ណ"
              className="flex h-10 items-center rounded-lg border border-[#E2DDD3] bg-white px-2.5 text-xs font-semibold font-mono-num text-[#111111] hover:border-[#111111] whitespace-nowrap shrink-0"
            >
              {currency}
            </button>
            <button
              type="button"
              onClick={() => {
                setCheckoutInitialStep('cart');
                setCartOpen(true);
              }}
              aria-label="បើកកន្ត្រកទំនិញ"
              className="relative flex h-10 items-center gap-2 rounded-lg bg-[#111111] px-3.5 text-xs font-semibold text-white transition hover:bg-[#262626] whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="h-4 w-4 text-[#C9A227]" />
              <span className="hidden sm:inline">កន្ត្រក</span>
              <span className="font-mono-num">({totalCartItems})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="flex h-full w-72 max-w-[85vw] flex-col bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#ECE8DF] pb-4">
              <span className="text-lg font-bold text-[#111111]">ឧត្តម Shop</span>
              <button
                type="button"
                aria-label="បិទម៉ឺនុយ"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#FAF9F6]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-1">
              <p className="px-3 pb-1 text-xs font-medium text-[#8A8478]">ប្រភេទទំនិញ</p>
              <button
                type="button"
                onClick={() => scrollToCatalog('all')}
                className={`flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-medium ${
                  selectedCategory === 'all'
                    ? 'bg-[#111111] text-white'
                    : 'text-[#111111] hover:bg-[#FAF9F6]'
                }`}
              >
                <span>ទាំងអស់</span>
                <ArrowRight className="h-4 w-4 opacity-50" />
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => scrollToCatalog(cat.slug)}
                  className={`flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-medium ${
                    selectedCategory === cat.slug
                      ? 'bg-[#111111] text-white'
                      : 'text-[#111111] hover:bg-[#FAF9F6]'
                  }`}
                >
                  <span>{cat.nameKm}</span>
                  <ArrowRight className="h-4 w-4 opacity-50" />
                </button>
              ))}

              <div className="pt-4 mt-4 border-t border-[#ECE8DF] space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setTrackerOpen(true);
                  }}
                  className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-[#111111] hover:bg-[#FAF9F6]"
                >
                  <PackageSearch className="h-4 w-4 text-[#B8860B]" />
                  <span>តាមដានការបញ្ជាទិញ</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigateAdmin();
                  }}
                  className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-[#6B6559] hover:bg-[#FAF9F6]"
                >
                  <Lock className="h-4 w-4" />
                  <span>Admin Dashboard</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {cartToast && (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-[#111111] px-4 py-2.5 text-xs font-medium text-white shadow-xl border border-[#C9A227]/40 whitespace-nowrap">
          {cartToast}
        </div>
      )}

      <main id="top" className="flex-1 print:hidden">
        {/* Section 1: Storefront Hero */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-4 sm:pt-6">
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#0B0B0C] text-white">
            <div className="grid lg:grid-cols-12 items-stretch">
              <div className="relative z-10 flex flex-col justify-center p-6 sm:p-10 lg:col-span-5 lg:py-14">
                <p className="text-xs font-medium tracking-wide text-[#C9A227]">
                  {settings?.heroEyebrow || 'ឧត្តម Shop · សម័យទំនើប និងប្រណីតភាព'}
                </p>
                <h1 className="mt-2.5 text-2xl sm:text-4xl lg:text-[2.6rem] font-bold leading-tight text-white [text-wrap:balance]">
                  {settings?.heroTitle || 'ស្ទីលប្រណីត សម្រាប់គ្រប់ជំហានប្រចាំថ្ងៃ'}
                </h1>
                <p className="mt-3 text-sm sm:text-base text-white/75 leading-relaxed max-w-md">
                  {settings?.heroSubtitle ||
                    'ស្បែកជើង សម្លៀកបំពាក់ កាបូប និងនាឡិកាគុណភាពខ្ពស់ ដឹកជញ្ជូនរហ័សទូទាំងប្រទេស ទូទាត់សុវត្ថិភាពតាម ABA PayWay។'}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => scrollToCatalog('all')}
                    className="flex h-12 items-center gap-2 rounded-xl bg-[#C9A227] px-6 text-sm font-bold text-[#0B0B0C] transition hover:bg-[#D4B038] active:scale-[0.98] whitespace-nowrap"
                  >
                    <span>ទិញទំនិញឥឡូវនេះ</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrackerOpen(true)}
                    className="flex h-12 items-center gap-2 rounded-xl border border-white/25 px-4 text-sm font-medium text-white transition hover:bg-white/10 whitespace-nowrap"
                  >
                    <PackageSearch className="h-4 w-4 text-[#C9A227]" />
                    <span>តាមដាន Order</span>
                  </button>
                </div>
              </div>

              <div className="relative aspect-[16/9] lg:aspect-auto lg:col-span-7 overflow-hidden">
                <SafeImage
                  src={HERO_IMAGE}
                  alt="ឧត្តម Shop Luxury Collection Showcase"
                  priority
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0B0C]/60 via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#0B0B0C] lg:via-[#0B0B0C]/20 lg:to-transparent" />
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Search, Categories, Sort & Product Grid */}
        <section id="catalog-section" className="mx-auto max-w-7xl px-4 sm:px-6 py-7 sm:py-10">
          {/* Search Bar, Collection Tabs & Sort */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 gap-2 max-w-2xl">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B6559]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ស្វែងរកផលិតផល ឬ លេខកូដ SKU..."
                  aria-label="ស្វែងរកទំនិញ"
                  className="h-12 w-full rounded-xl border border-[#E2DDD3] bg-white pl-10 pr-4 text-sm text-[#111111] placeholder:text-[#8A8478] focus:border-[#111111] focus:outline-none"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                aria-label="តម្រៀបទំនិញ"
                className="h-12 rounded-xl border border-[#E2DDD3] bg-white px-3 text-xs sm:text-sm font-medium text-[#111111] focus:border-[#111111] focus:outline-none shrink-0"
              >
                <option value="newest">ថ្មីបំផុត</option>
                <option value="bestselling">លក់ដាច់ជាងគេ</option>
                <option value="price_asc">តម្លៃ៖ ទាប ទៅ ខ្ពស់</option>
                <option value="price_desc">តម្លៃ៖ ខ្ពស់ ទៅ ទាប</option>
              </select>
            </div>

            {/* Collection Filter Tabs (New, Popular, Sale, Saved) */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-xl bg-[#EFECE5] p-1">
              {[
                { key: 'all', label: 'ទាំងអស់' },
                { key: 'new', label: 'ថ្មីៗ' },
                { key: 'popular', label: 'ពេញនិយម' },
                { key: 'sale', label: 'បញ្ចុះតម្លៃ' },
                { key: 'saved', label: `ពេញចិត្ត (${wishlistIds.length})` },
              ].map((tab) => {
                const active = collectionTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setCollectionTab(tab.key as CollectionFilter)}
                    className={`h-10 rounded-lg px-3.5 text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white text-[#111111] shadow-sm'
                        : 'text-[#6B6559] hover:text-[#111111]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Horizontal Category Bar */}
          <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`h-10 rounded-xl border px-4 text-xs sm:text-sm font-medium transition whitespace-nowrap shrink-0 ${
                selectedCategory === 'all'
                  ? 'border-[#111111] bg-[#111111] text-white'
                  : 'border-[#E2DDD3] bg-white text-[#4A463E] hover:border-[#111111]'
              }`}
            >
              ទាំងអស់
            </button>
            {categories.map((cat) => {
              const active = selectedCategory === cat.slug;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={`h-10 rounded-xl border px-4 text-xs sm:text-sm font-medium transition whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-[#111111] bg-[#111111] text-white'
                      : 'border-[#E2DDD3] bg-white text-[#4A463E] hover:border-[#111111]'
                  }`}
                >
                  {cat.nameKm}
                </button>
              );
            })}
          </div>

          {/* Product States: Loading / Error / Empty / 2-Col Mobile Grid */}
          {loading ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl border border-[#ECE8DF] bg-white p-3 animate-pulse"
                >
                  <div className="aspect-[4/3] rounded-xl bg-[#EFECE5]" />
                  <div className="mt-3 h-3 w-1/2 rounded bg-[#EFECE5]" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-[#EFECE5]" />
                  <div className="mt-3 h-9 rounded-lg bg-[#EFECE5]" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-white p-8 text-center">
              <p className="text-sm font-medium text-red-700">{loadError}</p>
              <button
                type="button"
                onClick={() => void loadStoreData()}
                className="mt-4 h-11 rounded-xl bg-[#111111] px-5 text-xs font-semibold text-white"
              >
                ព្យាយាមម្តងទៀត
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-[#E2DDD3] bg-white p-10 text-center">
              <p className="text-base font-medium text-[#111111]">
                មិនមានផលិតផលត្រូវនឹងការស្វែងរកទេ
              </p>
              <p className="mt-1 text-sm text-[#6B6559]">
                សូមសាកល្បងជ្រើសរើសប្រភេទផ្សេង ឬលុបពាក្យស្វែងរក
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setCollectionTab('all');
                  setSearchQuery('');
                }}
                className="mt-4 h-11 rounded-xl bg-[#111111] px-5 text-xs font-semibold text-white"
              >
                បង្ហាញទំនិញទាំងអស់
              </button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((product) => {
                const isAvailable = product.status === 'available' && product.stock > 0;
                const hasDiscount =
                  product.discountPriceUsd !== null &&
                  product.discountPriceUsd < product.priceUsd;
                const activePrice = hasDiscount
                  ? product.discountPriceUsd!
                  : product.priceUsd;

                return (
                  <article
                    key={product.id}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#E6E1D6] bg-white transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#EFECE5]">
                      <button
                        type="button"
                        onClick={() => setActiveProduct(product)}
                        className="h-full w-full text-left"
                      >
                        <SafeImage
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </button>
                      <button
                        type="button"
                        aria-label="រក្សាទុកក្នុងបញ្ជីពេញចិត្ត"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleWishlist(product.id);
                        }}
                        className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#111111] shadow-sm backdrop-blur transition hover:bg-white active:scale-95"
                      >
                        <Heart
                          className={`h-4 w-4 ${
                            wishlistIds.includes(product.id)
                              ? 'fill-red-600 text-red-600'
                              : ''
                          }`}
                        />
                      </button>
                      {!isAvailable && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55">
                          <span className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111111]">
                            អស់ពីស្តុក
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-3 sm:p-4">
                      {/* Unboxed Metadata (Zero-Pill Rule) */}
                      <div className="flex items-center justify-between gap-1 text-[11px] text-[#6B6559]">
                        <span className="truncate">
                          {getCategoryLabel(product.category, categories)}
                        </span>
                        {hasDiscount && (
                          <span className="font-semibold text-[#9A6F04] shrink-0">
                            បញ្ចុះតម្លៃ
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveProduct(product)}
                        className="mt-1 text-left text-xs sm:text-sm font-semibold text-[#111111] line-clamp-2 leading-snug hover:text-[#9A6F04]"
                      >
                        {product.name}
                      </button>

                      {/* Pricing */}
                      <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
                        <span className="text-sm sm:text-base font-bold font-mono-num text-[#111111]">
                          {formatMoney(activePrice, currency, khrRate)}
                        </span>
                        {hasDiscount && (
                          <span className="text-[11px] sm:text-xs font-mono-num text-[#8A8478] line-through">
                            {formatMoney(product.priceUsd, currency, khrRate)}
                          </span>
                        )}
                      </div>

                      {/* Mobile-friendly Action Buttons */}
                      <div className="mt-auto pt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => handleAddToCart(product, 1)}
                          className="flex h-10 items-center justify-center rounded-lg border border-[#111111] bg-white px-2 text-xs font-semibold text-[#111111] transition hover:bg-[#FAF9F6] active:scale-[0.98] disabled:opacity-40 whitespace-nowrap"
                        >
                          Add to Cart
                        </button>
                        <button
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => handleBuyNow(product, 1)}
                          className="flex h-10 items-center justify-center rounded-lg bg-[#111111] px-2 text-xs font-semibold text-white transition hover:bg-[#262626] active:scale-[0.98] disabled:opacity-40 whitespace-nowrap"
                        >
                          Buy Now
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 3: Service Guarantee Strip */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-2xl border border-[#E5E0D5] bg-white p-5 sm:p-7">
            <div>
              <p className="text-sm font-semibold text-[#111111]">០១. គុណភាពធានាជូន</p>
              <p className="mt-1 text-xs leading-relaxed text-[#6B6559]">
                ទំនិញគ្រប់មុខត្រូវបានត្រួតពិនិត្យគុណភាពយ៉ាងម៉ត់ចត់មុនពេលដឹកជញ្ជូនដល់ដៃអតិថិជន។
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#111111]">០២. ទូទាត់តាម ABA PayWay</p>
              <p className="mt-1 text-xs leading-relaxed text-[#6B6559]">
                គាំទ្រការទូទាត់សុវត្ថិភាពតាម ABA Mobile និង KHQR ផ្ទៀងផ្ទាត់ស្វ័យប្រវត្តិ។
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#111111]">
                ០៣. ដឹកជញ្ជូនឥតគិតថ្លៃ
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#6B6559]">
                ដឹកជញ្ជូនឥតគិតថ្លៃសម្រាប់ការបញ្ជាទិញចាប់ពី ${freeShippingThresholdUsd} ឡើងទៅ។
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Section 4: Footer */}
      <footer className="border-t border-[#E5E0D5] bg-[#0B0B0C] text-white print:hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div>
              <p className="text-lg font-bold tracking-tight text-white">
                {settings?.shopName || 'ឧត្តម Shop'}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/70 max-w-xs">
                ហាងលក់ទំនិញអនឡាញទំនើប និងប្រណីត — ស្បែកជើង សម្លៀកបំពាក់ កាបូប នាឡិកា និងសម្ភារៈប្រើប្រាស់ប្រចាំថ្ងៃ។
              </p>
            </div>

            <div className="space-y-2 text-xs text-white/80">
              <p className="font-semibold text-[#C9A227]">ព័ត៌មានទំនាក់ទំនង</p>
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#C9A227] shrink-0" />
                <span>{settings?.contactAddress || 'រាជធានីភ្នំពេញ ព្រះរាជាណាចក្រកម្ពុជា'}</span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#C9A227] shrink-0" />
                <span className="font-mono-num">
                  {settings?.contactPhone || '012 888 999'} · 08:00 - 20:00
                </span>
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTrackerOpen(true)}
                  className="h-10 rounded-lg border border-white/20 px-3.5 text-xs font-medium text-white hover:bg-white/10"
                >
                  តាមដានការបញ្ជាទិញ
                </button>
                <button
                  type="button"
                  onClick={onNavigateAdmin}
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-white/20 px-3.5 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10"
                >
                  <Lock className="h-3.5 w-3.5 text-[#C9A227]" />
                  <span>Admin Portal</span>
                </button>
              </div>
              <p className="text-[11px] text-white/50">
                © {new Date().getFullYear()} {settings?.shopName || 'ឧត្តម Shop'}. រក្សាសិទ្ធិគ្រប់យ៉ាង។
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <ProductDetailModal
        key={activeProduct?.id || 'none'}
        product={activeProduct}
        categories={categories}
        currency={currency}
        khrRate={khrRate}
        isWishlisted={activeProduct ? wishlistIds.includes(activeProduct.id) : false}
        onToggleWishlist={toggleWishlist}
        onClose={() => setActiveProduct(null)}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
      />

      <CartCheckoutDrawer
        open={cartOpen}
        items={cart}
        currency={currency}
        khrRate={khrRate}
        freeShippingThresholdUsd={freeShippingThresholdUsd}
        phnomPenhShippingUsd={phnomPenhShippingUsd}
        provinceShippingUsd={provinceShippingUsd}
        abaBankInfo={{
          accountName: settings?.abaAccountName || 'UDOM KREN',
          accountId: settings?.abaAccountId || '3609517',
          accountUsd: settings?.abaAccountUsd || '009 338 762',
          accountKhr: settings?.abaAccountKhr || '009 338 764',
        }}
        initialStep={checkoutInitialStep}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={() => setCart([])}
      />

      <OrderTrackerModal
        open={trackerOpen}
        khrRate={khrRate}
        onClose={() => setTrackerOpen(false)}
      />
    </div>
  );
}
