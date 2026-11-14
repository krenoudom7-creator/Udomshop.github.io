import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase.ts';
import type {
  AdminRole,
  AdminUser,
  BackupSnapshot,
  Category,
  Coupon,
  CurrencyCode,
  CustomerRecord,
  DashboardStats,
  DeliveryZone,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentRecord,
  Product,
  StoreSettings,
} from '../types/shop.ts';
import {
  STATIC_FALLBACK_PRODUCTS,
  STATIC_FALLBACK_SETTINGS,
} from '../utils/bundledAssets.ts';

export const BOOTSTRAPPED_SUPER_ADMIN_EMAIL = 'krenoudom7@gmail.com';

export const DEFAULT_STORE_CATEGORIES: Category[] = [
  { id: 'cat_shoes', slug: 'shoes', nameKm: 'ស្បែកជើង', nameEn: 'Shoes', sortOrder: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cat_clothing', slug: 'clothing', nameKm: 'សម្លៀកបំពាក់', nameEn: 'Clothing', sortOrder: 2, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cat_bags', slug: 'bags', nameKm: 'កាបូប', nameEn: 'Bags', sortOrder: 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cat_watches', slug: 'watches', nameKm: 'នាឡិកា', nameEn: 'Watches', sortOrder: 4, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cat_accessories', slug: 'accessories', nameKm: 'សម្ភារៈប្រើប្រាស់', nameEn: 'Accessories', sortOrder: 5, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
];

const INITIAL_FIRESTORE_PRODUCT_TEMPLATES: Array<{ id: string; data: Omit<Product, 'id'> }> = [
  {
    id: 'prod_seed_1',
    data: {
      sku: 'ODS-SHOE-001',
      name: 'ស្បែកជើងស្បែកប្រណីត Oudom Noir',
      category: 'shoes',
      priceUsd: 89.0,
      discountPriceUsd: 74.0,
      stock: 24,
      status: 'available',
      description:
        'ស្បែកជើងស្បែកគោសុទ្ធ ១០០% រចនាប័ទ្មតិចតួចតែប្រណីត លាយពណ៌ខ្មៅ និងភ្លុក ជាមួយចុងខ្សែពណ៌មាស ស្រាល ទន់ស្រួលពាក់ពេញមួយថ្ងៃ។',
      imageUrl: '/src/assets/images/product_luxury_sneakers_1794578199048.jpg',
      sizes: ['39', '40', '41', '42', '43', '44'],
      colors: ['ខ្មៅ-ភ្លុក', 'ខ្មៅសុទ្ធ'],
      isNew: true,
      isPopular: true,
      soldCount: 18,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
  {
    id: 'prod_seed_2',
    data: {
      sku: 'ODS-WEAR-002',
      name: 'អាវក្រៅកាត់ដេរប្រណីត Heritage Overshirt',
      category: 'clothing',
      priceUsd: 75.0,
      discountPriceUsd: null,
      stock: 19,
      status: 'available',
      description:
        'អាវក្រៅសាច់ក្រណាត់គុណភាពខ្ពស់ កាត់ដេរយ៉ាងផ្ចិតផ្ចង់ បំពាក់ឡេវពណ៌មាសសំរឹទ្ធ ស័ក្តិសមទាំងការពាក់ប្រចាំថ្ងៃ និងកម្មវិធីផ្លូវការ។',
      imageUrl: '/src/assets/images/product_tailored_jacket_1794578201540.jpg',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['ខ្មៅដិត'],
      isNew: true,
      isPopular: false,
      soldCount: 11,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
  {
    id: 'prod_seed_3',
    data: {
      sku: 'ODS-BAG-003',
      name: 'កាបូបស្បែកយួរដៃ Royal Clasp Tote',
      category: 'bags',
      priceUsd: 145.0,
      discountPriceUsd: 119.0,
      stock: 12,
      status: 'available',
      description:
        'កាបូបស្បែកកូនគោប្រណីត រាងរឹងមាំស្អាត បំពាក់គន្លឹះមាសបែបទំនើប មានកន្លែងដាក់សម្ភារៈធំទូលាយ និងខ្សែស្ពាយចំហៀង។',
      imageUrl: '/src/assets/images/product_leather_handbag_1794578199699.jpg',
      sizes: ['Standard'],
      colors: ['ខ្មៅ-មាស'],
      isNew: false,
      isPopular: true,
      soldCount: 25,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
  {
    id: 'prod_seed_4',
    data: {
      sku: 'ODS-WATCH-004',
      name: 'នាឡិកាដៃ Chronograph Gold Edition',
      category: 'watches',
      priceUsd: 260.0,
      discountPriceUsd: 215.0,
      stock: 8,
      status: 'available',
      description:
        'នាឡិកាដៃមុខខ្មៅរឹងមាំ កញ្ចក់ Sapphire ការពារឆ្កូត តួស្រោបមាស brushed gold ជាមួយខ្សែស្បែកក្រពើពណ៌ខ្មៅ និងការពារទឹក ៥០ម៉ែត្រ។',
      imageUrl: '/src/assets/images/product_gold_chronograph_1794578199661.jpg',
      sizes: ['41mm'],
      colors: ['មាស-ខ្មៅ'],
      isNew: true,
      isPopular: true,
      soldCount: 15,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
  {
    id: 'prod_seed_5',
    data: {
      sku: 'ODS-ACC-005',
      name: 'ឈុតកាបូបលុយស្បែក និងវ៉ែនតាការពារកម្តៅថ្ងៃ',
      category: 'accessories',
      priceUsd: 58.0,
      discountPriceUsd: 48.0,
      stock: 32,
      status: 'available',
      description:
        'កាបូបដាក់កាតស្បែកស្តើងទាន់សម័យ រួមជាមួយវ៉ែនតាការពារកាំរស្មី UV400 ស៊ុមខ្មៅលាយមាស រចនាប័ទ្មស្អាតសម្រាប់បុរស និងនារី។',
      imageUrl: '/src/assets/images/product_leather_accessories_1794578201108.jpg',
      sizes: ['One Size'],
      colors: ['ខ្មៅ-មាស'],
      isNew: false,
      isPopular: true,
      soldCount: 29,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
];

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function generateDocId(prefix: string): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export async function computeTrackingKey(
  orderNumber: string,
  customerPhone: string
): Promise<string> {
  const normalized = `${orderNumber.trim().toUpperCase()}:${customerPhone.replace(/\D/g, '')}`;
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function compressImageToBoundedDataUrl(
  file: File,
  maxWidth = 760,
  maxChars = 320000
): Promise<string> {
  const fallbackRead = () =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Failed to read image'));
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });

  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return fallbackRead();
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const qualities = [0.8, 0.65, 0.5, 0.35];
      let width = Math.min(maxWidth, img.width || maxWidth);

      for (const q of qualities) {
        const scale = img.width > width ? width / img.width : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) break;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/webp', q);
        if (dataUrl.length <= maxChars) {
          resolve(dataUrl);
          return;
        }
        width = Math.round(width * 0.78);
      }

      // Final tight fallback pass
      const tightScale = img.width > 480 ? 480 / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * tightScale));
      canvas.height = Math.max(1, Math.round(img.height * tightScale));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const finalUrl = canvas.toDataURL('image/jpeg', 0.55);
        if (finalUrl.length <= maxChars) {
          resolve(finalUrl);
          return;
        }
      }
      reject(new Error('រូបភាពមានទំហំធំពេក សូមជ្រើសរើសរូបភាពតូចជាងនេះ'));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      void fallbackRead().then(resolve).catch(reject);
    };

    img.src = objectUrl;
  });
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function sanitizeProductDoc(p: Omit<Product, 'id'>): Record<string, unknown> {
  return stripUndefined({
    sku: String(p.sku || '').trim().toUpperCase(),
    name: String(p.name || '').trim(),
    category: String(p.category || 'shoes').trim(),
    priceUsd: Number(p.priceUsd || 0),
    discountPriceUsd: p.discountPriceUsd != null ? Number(p.discountPriceUsd) : null,
    stock: Math.max(0, Math.floor(Number(p.stock || 0))),
    status: p.status === 'out_of_stock' ? 'out_of_stock' : 'available',
    description: String(p.description || ''),
    imageUrl: String(p.imageUrl || ''),
    sizes: Array.isArray(p.sizes) ? p.sizes.slice(0, 20).map(String) : [],
    colors: Array.isArray(p.colors) ? p.colors.slice(0, 20).map(String) : [],
    isNew: Boolean(p.isNew),
    isPopular: Boolean(p.isPopular),
    soldCount: Math.max(0, Math.floor(Number(p.soldCount || 0))),
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString(),
  });
}

function sanitizeSettingsDoc(s: StoreSettings): Record<string, unknown> {
  return stripUndefined({
    shopName: String(s.shopName || 'ឧត្តម Shop'),
    heroEyebrow: String(s.heroEyebrow || ''),
    heroTitle: String(s.heroTitle || ''),
    heroSubtitle: String(s.heroSubtitle || ''),
    announcementText: String(s.announcementText || ''),
    contactPhone: String(s.contactPhone || ''),
    contactAddress: String(s.contactAddress || ''),
    contactLat:
      typeof s.contactLat === 'number' &&
      Number.isFinite(s.contactLat) &&
      s.contactLat >= -90 &&
      s.contactLat <= 90
        ? Number(s.contactLat.toFixed(6))
        : undefined,
    contactLng:
      typeof s.contactLng === 'number' &&
      Number.isFinite(s.contactLng) &&
      s.contactLng >= -180 &&
      s.contactLng <= 180
        ? Number(s.contactLng.toFixed(6))
        : undefined,
    contactMapUrl:
      typeof s.contactMapUrl === 'string' && s.contactMapUrl.trim()
        ? s.contactMapUrl.trim().slice(0, 400)
        : undefined,
    contactMapImageUrl:
      typeof s.contactMapImageUrl === 'string' &&
      s.contactMapImageUrl.trim() &&
      s.contactMapImageUrl.trim().length <= 350000
        ? s.contactMapImageUrl.trim()
        : undefined,
    telegramContact: String(s.telegramContact || ''),
    abaAccountName: String(s.abaAccountName || ''),
    abaAccountId: String(s.abaAccountId || ''),
    abaAccountUsd: String(s.abaAccountUsd || ''),
    abaAccountKhr: String(s.abaAccountKhr || ''),
    abaQrUsdImage: String(s.abaQrUsdImage || ''),
    abaQrKhrImage: String(s.abaQrKhrImage || ''),
    khrRate: Math.max(100, Math.round(Number(s.khrRate || 4100))),
    freeShippingThresholdUsd: Math.max(0, Number(s.freeShippingThresholdUsd || 0)),
    phnomPenhShippingUsd: Math.max(0, Number(s.phnomPenhShippingUsd || 0)),
    provinceShippingUsd: Math.max(0, Number(s.provinceShippingUsd || 0)),
    updatedAt: new Date().toISOString(),
  });
}

// ---------------- PUBLIC ONLINE STOREFRONT ----------------

export async function fetchPublicCatalogFromFirestore(): Promise<{
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
}> {
  let settings: StoreSettings = STATIC_FALLBACK_SETTINGS;
  let categories: Category[] = DEFAULT_STORE_CATEGORIES;
  let products: Product[] = STATIC_FALLBACK_PRODUCTS;

  try {
    const setSnap = await getDoc(doc(db, 'settings', 'storefront'));
    if (setSnap.exists()) {
      settings = { ...STATIC_FALLBACK_SETTINGS, ...(setSnap.data() as StoreSettings) };
    }
  } catch (err) {
    console.warn('Firestore settings read notice:', err);
  }

  try {
    const catSnap = await getDocs(query(collection(db, 'categories'), orderBy('sortOrder', 'asc')));
    if (!catSnap.empty) {
      categories = catSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Category, 'id'>) }));
    }
  } catch (err) {
    console.warn('Firestore categories read notice:', err);
  }

  try {
    const prodSnap = await getDocs(collection(db, 'products'));
    if (!prodSnap.empty) {
      products = prodSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }
  } catch (err) {
    console.warn('Firestore products read notice:', err);
  }

  return { settings, categories, products };
}

export async function validateCouponInFirestore(
  rawCode: string,
  subtotalUsd: number
): Promise<{
  valid: boolean;
  coupon?: {
    code: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    discountUsd: number;
  };
  error?: string;
}> {
  const code = rawCode.trim().toUpperCase();
  if (!code || !/^[A-Z0-9_-]{2,32}$/.test(code)) {
    return { valid: false, error: 'កូដបញ្ចុះតម្លៃមិនត្រឹមត្រូវទេ' };
  }

  let snap;
  try {
    snap = await getDoc(doc(db, 'coupons', code));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `coupons/${code}`);
  }

  if (!snap.exists()) {
    return { valid: false, error: 'កូដបញ្ចុះតម្លៃមិនត្រឹមត្រូវ ឬត្រូវបានបិទ' };
  }

  const coupon = snap.data() as Coupon;
  if (!coupon.active) {
    return { valid: false, error: 'កូដបញ្ចុះតម្លៃមិនត្រឹមត្រូវ ឬត្រូវបានបិទ' };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { valid: false, error: 'កូដបញ្ចុះតម្លៃនេះផុតកំណត់ហើយ' };
  }
  if (coupon.maxUses > 0 && (coupon.usedCount || 0) >= coupon.maxUses) {
    return { valid: false, error: 'កូដបញ្ចុះតម្លៃនេះត្រូវបានប្រើអស់ចំនួនកំណត់ហើយ' };
  }
  if (subtotalUsd < (coupon.minOrderUsd || 0)) {
    return {
      valid: false,
      error: `កូដនេះតម្រូវឱ្យទិញចាប់ពី $${Number(coupon.minOrderUsd || 0).toFixed(2)} ឡើងទៅ`,
    };
  }

  const rawDiscount =
    coupon.discountType === 'percent'
      ? (subtotalUsd * coupon.discountValue) / 100
      : coupon.discountValue;
  const discountUsd = Number(Math.min(subtotalUsd, Math.max(0, rawDiscount)).toFixed(2));

  return {
    valid: true,
    coupon: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountUsd,
    },
  };
}

export async function createOrderInFirestore(input: {
  customerName: string;
  customerPhone: string;
  deliveryZone: DeliveryZone;
  shippingAddress: string;
  locationLat?: number;
  locationLng?: number;
  locationMapUrl?: string;
  locationImageUrl?: string;
  couponCode?: string;
  notes?: string;
  currency: CurrencyCode;
  paymentMethod: PaymentMethod;
  items: Array<{
    productId: string;
    quantity: number;
    selectedSize?: string;
    selectedColor?: string;
  }>;
}): Promise<Order> {
  const { settings, products } = await fetchPublicCatalogFromFirestore();
  const productMap = new Map<string, Product>();
  for (const p of products) productMap.set(p.id, p);
  for (const p of STATIC_FALLBACK_PRODUCTS) {
    if (!productMap.has(p.id)) productMap.set(p.id, p);
  }

  const orderItems: OrderItem[] = [];
  let subtotalUsd = 0;
  let itemDiscountSavings = 0;

  for (const reqItem of input.items) {
    const prod = productMap.get(reqItem.productId);
    if (!prod) {
      throw new Error('រកមិនឃើញផលិតផលក្នុងប្រព័ន្ធទេ');
    }
    const qty = Math.max(1, Math.floor(Number(reqItem.quantity || 1)));
    const unitPrice =
      prod.discountPriceUsd !== null && prod.discountPriceUsd < prod.priceUsd
        ? prod.discountPriceUsd
        : prod.priceUsd;
    const lineTotal = Number((unitPrice * qty).toFixed(2));
    subtotalUsd += lineTotal;
    if (prod.discountPriceUsd !== null && prod.discountPriceUsd < prod.priceUsd) {
      itemDiscountSavings += (prod.priceUsd - prod.discountPriceUsd) * qty;
    }

    orderItems.push(
      stripUndefined({
        productId: prod.id,
        sku: prod.sku,
        name: prod.name,
        imageUrl: prod.imageUrl.length > 1000 ? '' : prod.imageUrl,
        quantity: qty,
        unitPriceUsd: unitPrice,
        originalPriceUsd: prod.priceUsd,
        lineTotalUsd: lineTotal,
        selectedSize: reqItem.selectedSize || undefined,
        selectedColor: reqItem.selectedColor || undefined,
      }) as unknown as OrderItem
    );
  }

  let couponDiscountUsd = 0;
  let appliedCouponCode: string | undefined;
  if (input.couponCode) {
    const check = await validateCouponInFirestore(input.couponCode, subtotalUsd);
    if (check.valid && check.coupon) {
      couponDiscountUsd = check.coupon.discountUsd;
      appliedCouponCode = check.coupon.code;
    }
  }

  const netSubtotal = Math.max(0, subtotalUsd - couponDiscountUsd);
  const zoneFee =
    input.deliveryZone === 'province'
      ? settings.provinceShippingUsd
      : settings.phnomPenhShippingUsd;
  const shippingFeeUsd = netSubtotal >= settings.freeShippingThresholdUsd ? 0 : zoneFee;
  const totalUsd = Number((netSubtotal + shippingFeeUsd).toFixed(2));
  const khrRate = settings.khrRate || 4100;
  const totalKhr = Math.round(totalUsd * khrRate);

  const now = new Date();
  const yymmdd = now.toISOString().slice(2, 10).replace(/-/g, '');
  const randBytes = new Uint8Array(3);
  crypto.getRandomValues(randBytes);
  const suffix = Array.from(randBytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  const orderId = generateDocId('ord');
  const orderNumber = `ODS-${yymmdd}-${suffix}`;
  const nowIso = now.toISOString();

  const effectiveMethod: PaymentMethod =
    input.paymentMethod === 'cod' ? 'cod' : 'bank_qr';

  const hasValidCoords =
    typeof input.locationLat === 'number' &&
    typeof input.locationLng === 'number' &&
    Number.isFinite(input.locationLat) &&
    Number.isFinite(input.locationLng) &&
    input.locationLat >= -90 &&
    input.locationLat <= 90 &&
    input.locationLng >= -180 &&
    input.locationLng <= 180;
  const cleanLat = hasValidCoords ? Number(input.locationLat!.toFixed(6)) : undefined;
  const cleanLng = hasValidCoords ? Number(input.locationLng!.toFixed(6)) : undefined;
  const cleanMapUrl =
    typeof input.locationMapUrl === 'string' && input.locationMapUrl.trim()
      ? input.locationMapUrl.trim().slice(0, 400)
      : cleanLat !== undefined && cleanLng !== undefined
      ? `https://www.google.com/maps?q=${cleanLat},${cleanLng}`
      : undefined;

  const cleanLocationImage =
    typeof input.locationImageUrl === 'string' &&
    input.locationImageUrl.trim() &&
    input.locationImageUrl.trim().length <= 350000
      ? input.locationImageUrl.trim()
      : undefined;

  const orderPayload: Record<string, unknown> = stripUndefined({
    orderNumber,
    customerId: `cust_${input.customerPhone.replace(/\D/g, '') || suffix}`,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    shippingAddress: input.shippingAddress.trim(),
    locationLat: cleanLat,
    locationLng: cleanLng,
    locationMapUrl: cleanMapUrl,
    locationImageUrl: cleanLocationImage,
    deliveryZone: input.deliveryZone,
    notes: input.notes?.trim() || undefined,
    items: orderItems,
    subtotalUsd: Number(subtotalUsd.toFixed(2)),
    shippingFeeUsd: Number(shippingFeeUsd.toFixed(2)),
    discountUsd: Number((itemDiscountSavings + couponDiscountUsd).toFixed(2)),
    couponCode: appliedCouponCode,
    couponDiscountUsd: appliedCouponCode ? couponDiscountUsd : undefined,
    totalUsd,
    totalKhr,
    currency: input.currency,
    paymentMethod: effectiveMethod,
    paymentStatus: 'pending',
    orderStatus: 'pending',
    abaTranId: orderNumber,
    abaMode: effectiveMethod === 'cod' ? 'cod' : 'direct_qr',
    telegramNotified: false,
    userId: auth.currentUser?.emailVerified ? auth.currentUser.uid : undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const trackingKey = await computeTrackingKey(orderNumber, input.customerPhone);
  const trackingPayload: Record<string, unknown> = {
    orderId,
    orderNumber,
    paymentMethod: effectiveMethod,
    paymentStatus: 'pending',
    orderStatus: 'pending',
    totalUsd,
    totalKhr,
    currency: input.currency,
    items: orderItems,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  try {
    await Promise.all([
      setDoc(doc(db, 'orders', orderId), orderPayload),
      setDoc(doc(db, 'order_tracking', trackingKey), trackingPayload),
    ]);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
  }

  return {
    id: orderId,
    ...(orderPayload as Omit<Order, 'id'>),
  };
}

export async function submitPaymentProofInFirestore(input: {
  orderId: string;
  orderNumber: string;
  customerPhone: string;
  reference?: string;
  slipUrl?: string;
}): Promise<void> {
  const proofId = generateDocId('prf');
  const submittedAt = new Date().toISOString();
  const trackingKey = await computeTrackingKey(input.orderNumber, input.customerPhone);
  const payload = stripUndefined({
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    trackingKey,
    reference: input.reference?.trim() || undefined,
    slipUrl: input.slipUrl || undefined,
    submittedAt,
  });

  try {
    await setDoc(doc(db, 'payment_proofs', proofId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `payment_proofs/${proofId}`);
  }
}

export async function confirmOrderReceiptInFirestore(input: {
  orderNumber: string;
  customerPhone: string;
}): Promise<{ orderStatus: OrderStatus; receiptConfirmed: boolean; receiptConfirmedAt: string }> {
  const cleanOrderNum = input.orderNumber.trim().toUpperCase();
  const trackingKey = await computeTrackingKey(cleanOrderNum, input.customerPhone);
  const trackingRef = doc(db, 'order_tracking', trackingKey);
  const confirmRef = doc(db, 'receipt_confirmations', trackingKey);

  let snap;
  try {
    snap = await getDoc(trackingRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `order_tracking/${trackingKey}`);
  }

  if (!snap.exists()) {
    throw new Error(
      'លេខកូដបញ្ជាទិញ ឬលេខទូរស័ព្ទមិនត្រូវគ្នាទេ — មានតែភ្ញៀវដែលជាអ្នកកុម្ម៉ង់ប៉ុណ្ណោះ ទើបអាចបញ្ជាក់បង្កាន់ដៃបាន'
    );
  }

  const d = snap.data() as {
    orderId: string;
    orderNumber: string;
    orderStatus: OrderStatus;
    receiptConfirmed?: boolean;
    receiptConfirmedAt?: string;
  };

  if (d.orderStatus === 'cancelled' || d.orderStatus === 'failed') {
    throw new Error('មិនអាចបញ្ជាក់បង្កាន់ដៃសម្រាប់ការបញ្ជាទិញដែលបានលុប ឬបរាជ័យបានទេ');
  }

  if (d.receiptConfirmed || d.orderStatus === 'completed') {
    return {
      orderStatus: 'completed',
      receiptConfirmed: true,
      receiptConfirmedAt: d.receiptConfirmedAt || new Date().toISOString(),
    };
  }

  const nowIso = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(confirmRef, {
    orderId: d.orderId,
    orderNumber: d.orderNumber,
    confirmedAt: nowIso,
  });
  batch.update(trackingRef, {
    orderStatus: 'completed',
    receiptConfirmed: true,
    receiptConfirmedAt: nowIso,
    updatedAt: nowIso,
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `order_tracking/${trackingKey}`);
  }

  return {
    orderStatus: 'completed',
    receiptConfirmed: true,
    receiptConfirmedAt: nowIso,
  };
}

export async function lookupOrderTrackingInFirestore(
  orderNumber: string,
  phone: string
): Promise<Order | null> {
  const trackingKey = await computeTrackingKey(orderNumber, phone);
  let snap;
  try {
    snap = await getDoc(doc(db, 'order_tracking', trackingKey));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `order_tracking/${trackingKey}`);
  }

  if (!snap.exists()) return null;
  const d = snap.data() as {
    orderId: string;
    orderNumber: string;
    paymentMethod: PaymentMethod;
    paymentStatus: 'pending' | 'paid' | 'failed';
    orderStatus: OrderStatus;
    totalUsd: number;
    totalKhr: number;
    currency: CurrencyCode;
    items: OrderItem[];
    paymentSubmittedAt?: string;
    receiptConfirmed?: boolean;
    receiptConfirmedAt?: string;
    createdAt: string;
    updatedAt: string;
  };

  return {
    id: d.orderId,
    orderNumber: d.orderNumber,
    customerId: '',
    customerName: '',
    customerPhone: phone,
    shippingAddress: '',
    deliveryZone: 'phnom_penh',
    items: d.items || [],
    subtotalUsd: d.totalUsd,
    shippingFeeUsd: 0,
    discountUsd: 0,
    totalUsd: d.totalUsd,
    totalKhr: d.totalKhr,
    currency: d.currency || 'USD',
    paymentMethod: d.paymentMethod || 'bank_qr',
    paymentStatus: d.paymentStatus || 'pending',
    orderStatus: d.orderStatus || 'pending',
    abaTranId: d.orderNumber,
    abaMode: d.paymentMethod === 'cod' ? 'cod' : 'direct_qr',
    paymentSubmittedAt: d.paymentSubmittedAt,
    receiptConfirmed: d.receiptConfirmed ?? d.orderStatus === 'completed',
    receiptConfirmedAt: d.receiptConfirmedAt,
    telegramNotified: false,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// ---------------- ADMIN CLOUD MODE (FIREBASE AUTH + FIRESTORE) ----------------

export async function verifyAdminFirebaseUser(user: User): Promise<{
  authorized: boolean;
  role: AdminRole;
}> {
  const email = (user.email || '').toLowerCase();
  if (!user.emailVerified || !email) {
    return { authorized: false, role: 'staff' };
  }

  if (email === BOOTSTRAPPED_SUPER_ADMIN_EMAIL) {
    return { authorized: true, role: 'super_admin' };
  }

  try {
    const roleSnap = await getDoc(doc(db, 'admin_roles', user.uid));
    if (roleSnap.exists()) {
      const data = roleSnap.data() as { role?: AdminRole; active?: boolean };
      if (data.active) {
        return { authorized: true, role: data.role || 'manager' };
      }
    }
  } catch (err) {
    console.warn('Admin role lookup error:', err);
  }

  return { authorized: false, role: 'staff' };
}

export async function seedFirestoreIfEmpty(): Promise<void> {
  const [setSnap, catSnap, prodSnap, couponSnap] = await Promise.all([
    getDoc(doc(db, 'settings', 'storefront')),
    getDocs(collection(db, 'categories')),
    getDocs(collection(db, 'products')),
    getDocs(collection(db, 'coupons')),
  ]);

  const tasks: Array<Promise<unknown>> = [];

  if (!setSnap.exists()) {
    tasks.push(setDoc(doc(db, 'settings', 'storefront'), sanitizeSettingsDoc(STATIC_FALLBACK_SETTINGS)));
  }

  if (catSnap.empty) {
    for (const c of DEFAULT_STORE_CATEGORIES) {
      tasks.push(
        setDoc(doc(db, 'categories', c.id), {
          slug: c.slug,
          nameKm: c.nameKm,
          nameEn: c.nameEn || '',
          sortOrder: c.sortOrder,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })
      );
    }
  }

  if (prodSnap.empty) {
    for (const p of INITIAL_FIRESTORE_PRODUCT_TEMPLATES) {
      tasks.push(setDoc(doc(db, 'products', p.id), sanitizeProductDoc(p.data)));
    }
  }

  if (couponSnap.empty) {
    tasks.push(
      setDoc(doc(db, 'coupons', 'OUDOM10'), {
        code: 'OUDOM10',
        discountType: 'percent',
        discountValue: 10,
        minOrderUsd: 30,
        maxUses: 500,
        usedCount: 0,
        active: true,
        expiresAt: null,
        createdAt: new Date().toISOString(),
      })
    );
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}

export async function loadAdminDashboardFromFirestore(): Promise<{
  stats: DashboardStats;
  categories: Category[];
  products: Product[];
  orders: Order[];
  customers: CustomerRecord[];
  payments: PaymentRecord[];
  coupons: Coupon[];
  settings: StoreSettings;
  adminUsers: AdminUser[];
  backups: BackupSnapshot[];
}> {
  try {
    await seedFirestoreIfEmpty();
  } catch (err) {
    console.warn('Firestore seed skipped:', err);
  }

  let categories: Category[] = DEFAULT_STORE_CATEGORIES;
  let products: Product[] = [];
  let orders: Order[] = [];
  let coupons: Coupon[] = [];
  let settings: StoreSettings = STATIC_FALLBACK_SETTINGS;
  let backups: BackupSnapshot[] = [];
  let adminUsers: AdminUser[] = [];
  const proofByOrderId = new Map<
    string,
    { reference?: string; slipUrl?: string; submittedAt: string }
  >();
  const confirmationByOrderId = new Map<string, { confirmedAt: string }>();

  try {
    const [
      catSnap,
      prodSnap,
      ordSnap,
      proofSnap,
      confirmSnap,
      cpnSnap,
      setSnap,
      bkpSnap,
      rolesSnap,
    ] = await Promise.all([
      getDocs(query(collection(db, 'categories'), orderBy('sortOrder', 'asc'))),
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'payment_proofs')),
      getDocs(collection(db, 'receipt_confirmations')),
      getDocs(collection(db, 'coupons')),
      getDoc(doc(db, 'settings', 'storefront')),
      getDocs(collection(db, 'backups')),
      getDocs(collection(db, 'admin_roles')),
    ]);

    if (!catSnap.empty) {
      categories = catSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Category, 'id'>) }));
    }

    products = prodSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    // Index latest payment proof per order
    const sortedProofs = proofSnap.docs
      .map((d) => d.data() as { orderId: string; reference?: string; slipUrl?: string; submittedAt: string })
      .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    for (const prf of sortedProofs) {
      if (!proofByOrderId.has(prf.orderId)) {
        proofByOrderId.set(prf.orderId, prf);
      }
    }

    for (const cdoc of confirmSnap.docs) {
      const c = cdoc.data() as { orderId: string; confirmedAt: string };
      if (c.orderId && !confirmationByOrderId.has(c.orderId)) {
        confirmationByOrderId.set(c.orderId, { confirmedAt: c.confirmedAt });
      }
    }

    orders = ordSnap.docs
      .map((d) => {
        const ord = { id: d.id, ...(d.data() as Omit<Order, 'id'>) };
        const prf = proofByOrderId.get(ord.id);
        if (prf && !ord.paymentSubmittedAt) {
          ord.paymentReference = prf.reference || ord.paymentReference;
          ord.paymentSlipUrl = prf.slipUrl || ord.paymentSlipUrl;
          ord.paymentSubmittedAt = prf.submittedAt;
        }
        const conf = confirmationByOrderId.get(ord.id);
        if (conf && ord.orderStatus !== 'cancelled' && ord.orderStatus !== 'failed') {
          ord.receiptConfirmed = true;
          ord.receiptConfirmedAt = conf.confirmedAt;
          ord.orderStatus = 'completed';
          if (conf.confirmedAt > (ord.updatedAt || '')) {
            ord.updatedAt = conf.confirmedAt;
          }
        }
        return ord;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    coupons = cpnSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Coupon, 'id'>) }));

    if (setSnap.exists()) {
      settings = { ...STATIC_FALLBACK_SETTINGS, ...(setSnap.data() as StoreSettings) };
    }

    backups = bkpSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<BackupSnapshot, 'id'>) }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    adminUsers = [
      {
        id: 'bootstrapped_super_admin',
        username: 'krenoudom7',
        email: BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
        displayName: 'Oudom Super Admin',
        role: 'super_admin',
        active: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      ...rolesSnap.docs.map((d) => {
        const r = d.data() as { email?: string; role?: AdminRole; active?: boolean };
        return {
          id: d.id,
          username: (r.email || d.id).split('@')[0],
          email: r.email || '',
          displayName: r.email || d.id,
          role: r.role || 'manager',
          active: Boolean(r.active),
          createdAt: '',
        };
      }),
    ];
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'admin_dashboard');
  }

  // Derive Customers & Payments from Orders
  const customerMap = new Map<string, CustomerRecord>();
  const payments: PaymentRecord[] = [];
  const productRevenue = new Map<string, { sold: number; rev: number }>();

  for (const o of orders) {
    const phoneKey = o.customerPhone.replace(/\D/g, '') || o.customerName;
    const prev = customerMap.get(phoneKey);
    const paidAdd = o.paymentStatus === 'paid' ? o.totalUsd : 0;
    if (prev) {
      prev.totalOrders += 1;
      prev.totalSpentUsd = Number((prev.totalSpentUsd + paidAdd).toFixed(2));
      if (o.createdAt > prev.lastOrderAt) prev.lastOrderAt = o.createdAt;
    } else {
      customerMap.set(phoneKey, {
        id: o.customerId || phoneKey,
        name: o.customerName,
        phone: o.customerPhone,
        address: o.shippingAddress,
        totalOrders: 1,
        totalSpentUsd: paidAdd,
        lastOrderAt: o.createdAt,
        createdAt: o.createdAt,
      });
    }

    if (o.paymentStatus === 'paid' || o.paymentSubmittedAt) {
      payments.push({
        id: `pay_${o.id}`,
        orderId: o.id,
        orderNumber: o.orderNumber,
        tranId: o.paymentReference || o.abaTranId || o.orderNumber,
        amountUsd: o.totalUsd,
        amountKhr: o.totalKhr,
        currency: o.currency,
        method: o.paymentMethod,
        status: o.paymentStatus,
        provider: o.paymentMethod === 'cod' ? 'COD' : 'Direct KHQR / ABA',
        verifiedByServer: o.paymentStatus === 'paid',
        statusDetail: o.paymentStatus === 'paid' ? 'បានផ្ទៀងផ្ទាត់ដោយ Admin' : 'អតិថិជនបានផ្ញើវិក្កយបត្រ',
        createdAt: o.paymentSubmittedAt || o.updatedAt || o.createdAt,
      });
    }

    if (o.orderStatus !== 'cancelled' && o.orderStatus !== 'failed') {
      for (const item of o.items || []) {
        const cur = productRevenue.get(item.productId) || { sold: 0, rev: 0 };
        cur.sold += item.quantity;
        cur.rev += item.lineTotalUsd;
        productRevenue.set(item.productId, cur);
      }
    }
  }

  const customers = Array.from(customerMap.values()).sort((a, b) =>
    (b.lastOrderAt || '').localeCompare(a.lastOrderAt || '')
  );

  // Build Stats + 7-Day Sales Chart
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const monthPrefix = now.toISOString().slice(0, 7);

  let dailyRevenueUsd = 0;
  let monthlyRevenueUsd = 0;
  let totalRevenueUsd = 0;

  for (const o of orders) {
    if (o.paymentStatus === 'paid') {
      totalRevenueUsd += o.totalUsd;
      if (o.createdAt.startsWith(todayIso)) dailyRevenueUsd += o.totalUsd;
      if (o.createdAt.startsWith(monthPrefix)) monthlyRevenueUsd += o.totalUsd;
    }
  }

  const salesChart: DashboardStats['salesChart'] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayOrders = orders.filter((o) => o.createdAt.startsWith(key));
    const rev = dayOrders
      .filter((o) => o.paymentStatus === 'paid')
      .reduce((s, o) => s + o.totalUsd, 0);
    salesChart.push({
      date: key,
      label: key.slice(5),
      revenueUsd: Number(rev.toFixed(2)),
      orders: dayOrders.length,
    });
  }

  const topProducts = products
    .map((p) => {
      const agg = productRevenue.get(p.id);
      const soldCount = Math.max(p.soldCount || 0, agg?.sold || 0);
      const revenueUsd = agg?.rev || soldCount * (p.discountPriceUsd ?? p.priceUsd);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        imageUrl: p.imageUrl,
        soldCount,
        revenueUsd: Number(revenueUsd.toFixed(2)),
      };
    })
    .sort((a, b) => b.soldCount - a.soldCount)
    .slice(0, 5);

  const stats: DashboardStats = {
    totalProducts: products.length,
    totalOrders: orders.length,
    totalCustomers: customers.length,
    outOfStockCount: products.filter((p) => p.status === 'out_of_stock' || p.stock <= 0).length,
    dailyRevenueUsd: Number(dailyRevenueUsd.toFixed(2)),
    monthlyRevenueUsd: Number(monthlyRevenueUsd.toFixed(2)),
    totalRevenueUsd: Number(totalRevenueUsd.toFixed(2)),
    khrRate: settings.khrRate || 4100,
    topProducts,
    salesChart,
    integrations: {
      abaConfigured: Boolean(settings.abaQrUsdImage || settings.abaQrKhrImage || settings.abaAccountUsd),
      telegramConfigured: false,
      databaseConnected: true,
    },
  };

  return {
    stats,
    categories,
    products,
    orders,
    customers,
    payments,
    coupons,
    settings,
    adminUsers,
    backups,
  };
}

export async function upsertProductInFirestore(
  payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'soldCount'>,
  existingProduct?: Product | null
): Promise<Product> {
  const now = new Date().toISOString();
  const id = existingProduct?.id || generateDocId('prod');
  const fullData: Omit<Product, 'id'> = {
    ...payload,
    soldCount: existingProduct?.soldCount ?? 0,
    createdAt: existingProduct?.createdAt || now,
    updatedAt: now,
  };
  const docData = sanitizeProductDoc(fullData);

  try {
    if (existingProduct) {
      const { createdAt: _c, ...updateFields } = docData;
      await updateDoc(doc(db, 'products', id), updateFields);
    } else {
      await setDoc(doc(db, 'products', id), docData);
    }
  } catch (err) {
    handleFirestoreError(
      err,
      existingProduct ? OperationType.UPDATE : OperationType.CREATE,
      `products/${id}`
    );
  }

  return { id, ...fullData };
}

export async function toggleProductStockInFirestore(p: Product): Promise<void> {
  const nextStatus = p.status === 'available' ? 'out_of_stock' : 'available';
  try {
    await updateDoc(doc(db, 'products', p.id), {
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `products/${p.id}`);
  }
}

export async function deleteProductInFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'products', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `products/${id}`);
  }
}

export async function createCategoryInFirestore(
  nameKm: string,
  nameEn: string,
  currentCount: number
): Promise<Category> {
  const slugBase = (nameEn || nameKm)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const slug = slugBase || `cat_${Date.now().toString().slice(-5)}`;
  const id = generateDocId('cat');
  const now = new Date().toISOString();
  const cat: Omit<Category, 'id'> = {
    slug,
    nameKm: nameKm.trim(),
    nameEn: nameEn.trim(),
    sortOrder: currentCount + 1,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'categories', id), cat);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `categories/${id}`);
  }

  return { id, ...cat };
}

export async function updateCategoryInFirestore(
  id: string,
  nameKm: string,
  nameEn: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'categories', id), {
      nameKm: nameKm.trim(),
      nameEn: nameEn.trim(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `categories/${id}`);
  }
}

export async function deleteCategoryInFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'categories', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `categories/${id}`);
  }
}

export async function updateOrderStatusInFirestore(
  order: Order,
  nextOrderStatus: OrderStatus
): Promise<void> {
  if (nextOrderStatus === 'completed') {
    throw new Error('ការបញ្ជាក់បង្កាន់ដៃ (ដល់ដៃជោគជ័យ) គឺសម្រាប់តែភ្ញៀវដែលជាអ្នកកុម្ម៉ង់ប៉ុណ្ណោះ');
  }
  if (order.receiptConfirmed || order.orderStatus === 'completed') {
    throw new Error('ភ្ញៀវបានបញ្ជាក់បង្កាន់ដៃទទួលទំនិញរួចរាល់ហើយ មិនអាចកែប្រែស្ថានភាពបានទេ');
  }

  const now = new Date().toISOString();
  const nextPaymentStatus =
    nextOrderStatus === 'paid' ||
    nextOrderStatus === 'processing' ||
    nextOrderStatus === 'shipping'
      ? 'paid'
      : nextOrderStatus === 'failed' || nextOrderStatus === 'cancelled'
      ? 'failed'
      : order.paymentStatus;

  const orderUpdate: Record<string, unknown> = stripUndefined({
    orderStatus: nextOrderStatus,
    paymentStatus: nextPaymentStatus,
    paymentSlipUrl: order.paymentSlipUrl,
    paymentReference: order.paymentReference,
    paymentSubmittedAt: order.paymentSubmittedAt,
    updatedAt: now,
  });

  try {
    await updateDoc(doc(db, 'orders', order.id), orderUpdate);
    const trackingKey = await computeTrackingKey(order.orderNumber, order.customerPhone);
    const trackingRef = doc(db, 'order_tracking', trackingKey);
    const trackingSnap = await getDoc(trackingRef);
    if (trackingSnap.exists()) {
      await updateDoc(
        trackingRef,
        stripUndefined({
          orderStatus: nextOrderStatus,
          paymentStatus: nextPaymentStatus,
          paymentSubmittedAt: order.paymentSubmittedAt,
          updatedAt: now,
        })
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
  }
}

export async function saveSettingsInFirestore(settings: StoreSettings): Promise<StoreSettings> {
  const clean = sanitizeSettingsDoc(settings);
  try {
    await setDoc(doc(db, 'settings', 'storefront'), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/storefront');
  }
  return { ...settings, updatedAt: String(clean.updatedAt) };
}

export async function createCouponInFirestore(input: {
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderUsd: number;
  maxUses: number;
}): Promise<Coupon> {
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!code || code.length < 2) {
    throw new Error('លេខកូដបញ្ចុះតម្លៃត្រូវមានយ៉ាងតិច ២ តួអក្សរ');
  }
  const couponData: Omit<Coupon, 'id'> = {
    code,
    discountType: input.discountType,
    discountValue: Math.max(0, Number(input.discountValue)),
    minOrderUsd: Math.max(0, Number(input.minOrderUsd || 0)),
    maxUses: Math.max(0, Math.floor(Number(input.maxUses || 0))),
    usedCount: 0,
    active: true,
    expiresAt: null,
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'coupons', code), couponData);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `coupons/${code}`);
  }
  return { id: code, ...couponData };
}

export async function toggleCouponInFirestore(coupon: Coupon): Promise<void> {
  try {
    await updateDoc(doc(db, 'coupons', coupon.id), { active: !coupon.active });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `coupons/${coupon.id}`);
  }
}

export async function deleteCouponInFirestore(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'coupons', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `coupons/${id}`);
  }
}

export async function createBackupSnapshotInFirestore(
  createdBy: string,
  counts: { productCount: number; orderCount: number; customerCount: number; paymentCount: number }
): Promise<BackupSnapshot> {
  const id = generateDocId('bkp');
  const snap: Omit<BackupSnapshot, 'id'> = {
    createdBy,
    productCount: counts.productCount,
    orderCount: counts.orderCount,
    customerCount: counts.customerCount,
    paymentCount: counts.paymentCount,
    trigger: 'manual',
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'backups', id), snap);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `backups/${id}`);
  }
  return { id, ...snap };
}

export function subscribeAdminOrderEventsInFirestore(
  onChanged: () => void,
  onError?: (err: unknown) => void
): () => void {
  let initialOrders = true;
  let initialProofs = true;
  let initialConfirmations = true;

  const unsubOrders = onSnapshot(
    collection(db, 'orders'),
    () => {
      if (initialOrders) {
        initialOrders = false;
        return;
      }
      onChanged();
    },
    (err) => {
      console.error('Firestore orders listener error:', err);
      onError?.(err);
    }
  );

  const unsubProofs = onSnapshot(
    collection(db, 'payment_proofs'),
    () => {
      if (initialProofs) {
        initialProofs = false;
        return;
      }
      onChanged();
    },
    (err) => {
      console.error('Firestore payment_proofs listener error:', err);
      onError?.(err);
    }
  );

  const unsubConfirmations = onSnapshot(
    collection(db, 'receipt_confirmations'),
    () => {
      if (initialConfirmations) {
        initialConfirmations = false;
        return;
      }
      onChanged();
    },
    (err) => {
      console.error('Firestore receipt_confirmations listener error:', err);
      onError?.(err);
    }
  );

  return () => {
    unsubOrders();
    unsubProofs();
    unsubConfirmations();
  };
}
