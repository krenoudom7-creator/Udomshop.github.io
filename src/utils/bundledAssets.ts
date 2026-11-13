import heroOudomCollection from '../assets/images/hero_oudom_collection_1794578200596.jpg';
import productGoldChronograph from '../assets/images/product_gold_chronograph_1794578199661.jpg';
import productLeatherAccessories from '../assets/images/product_leather_accessories_1794578201108.jpg';
import productLeatherHandbag from '../assets/images/product_leather_handbag_1794578199699.jpg';
import productLuxurySneakers from '../assets/images/product_luxury_sneakers_1794578199048.jpg';
import productTailoredJacket from '../assets/images/product_tailored_jacket_1794578201540.jpg';
import type { Product, StoreSettings } from '../types/shop.ts';

export const HERO_COLLECTION_IMAGE = heroOudomCollection;

const BUNDLED_IMAGE_MAP: Record<string, string> = {
  '/src/assets/images/hero_oudom_collection_1794578200596.jpg': heroOudomCollection,
  'hero_oudom_collection_1794578200596.jpg': heroOudomCollection,
  '/src/assets/images/product_luxury_sneakers_1794578199048.jpg': productLuxurySneakers,
  'product_luxury_sneakers_1794578199048.jpg': productLuxurySneakers,
  '/src/assets/images/product_tailored_jacket_1794578201540.jpg': productTailoredJacket,
  'product_tailored_jacket_1794578201540.jpg': productTailoredJacket,
  '/src/assets/images/product_leather_handbag_1794578199699.jpg': productLeatherHandbag,
  'product_leather_handbag_1794578199699.jpg': productLeatherHandbag,
  '/src/assets/images/product_gold_chronograph_1794578199661.jpg': productGoldChronograph,
  'product_gold_chronograph_1794578199661.jpg': productGoldChronograph,
  '/src/assets/images/product_leather_accessories_1794578201108.jpg': productLeatherAccessories,
  'product_leather_accessories_1794578201108.jpg': productLeatherAccessories,
};

export function resolveAssetUrl(src: string): string {
  if (!src) return '';
  if (BUNDLED_IMAGE_MAP[src]) return BUNDLED_IMAGE_MAP[src];
  const fileName = src.split('/').pop() || '';
  if (BUNDLED_IMAGE_MAP[fileName]) return BUNDLED_IMAGE_MAP[fileName];
  return src;
}

const STATIC_DATE = '2026-01-01T00:00:00.000Z';

export const STATIC_FALLBACK_SETTINGS: StoreSettings = {
  shopName: 'ឧត្តម Shop',
  announcementText:
    'ប្រើកូដ OUDOM10 បញ្ចុះតម្លៃ 10% · ដឹកជញ្ជូនឥតគិតថ្លៃចាប់ពី $50 ឡើងទៅ',
  heroEyebrow: 'ឧត្តម Shop · សម័យទំនើប និងប្រណីតភាព',
  heroTitle: 'ស្ទីលប្រណីត សម្រាប់គ្រប់ជំហានប្រចាំថ្ងៃ',
  heroSubtitle:
    'ស្បែកជើង សម្លៀកបំពាក់ កាបូប និងនាឡិកាគុណភាពខ្ពស់ ដឹកជញ្ជូនរហ័សទូទាំងប្រទេស ទូទាត់សុវត្ថិភាពតាម ABA PayWay។',
  contactPhone: '012 888 999',
  contactAddress: 'រាជធានីភ្នំពេញ ព្រះរាជាណាចក្រកម្ពុជា',
  telegramContact: '@oudomshop',
  khrRate: 4100,
  freeShippingThresholdUsd: 50,
  phnomPenhShippingUsd: 1.5,
  provinceShippingUsd: 2.5,
  abaAccountName: 'UDOM KREN',
  abaAccountId: '3609517',
  abaAccountUsd: '009 338 762',
  abaAccountKhr: '009 338 764',
  abaQrUsdImage: '',
  abaQrKhrImage: '',
  updatedAt: STATIC_DATE,
};

export const STATIC_FALLBACK_PRODUCTS: Product[] = [
  {
    id: 'static_prod_1',
    sku: 'ODS-SHOE-001',
    name: 'ស្បែកជើងស្បែកប្រណីត Oudom Noir',
    category: 'shoes',
    priceUsd: 89.0,
    discountPriceUsd: 74.0,
    stock: 24,
    status: 'available',
    description:
      'ស្បែកជើងស្បែកគោសុទ្ធ ១០០% រចនាប័ទ្មតិចតួចតែប្រណីត លាយពណ៌ខ្មៅ និងភ្លុក ជាមួយចុងខ្សែពណ៌មាស ស្រាល ទន់ស្រួលពាក់ពេញមួយថ្ងៃ។',
    imageUrl: productLuxurySneakers,
    sizes: ['39', '40', '41', '42', '43', '44'],
    colors: ['ខ្មៅ-ភ្លុក', 'ខ្មៅសុទ្ធ'],
    isNew: true,
    isPopular: true,
    soldCount: 18,
    createdAt: STATIC_DATE,
    updatedAt: STATIC_DATE,
  },
  {
    id: 'static_prod_2',
    sku: 'ODS-WEAR-002',
    name: 'អាវក្រៅកាត់ដេរប្រណីត Heritage Overshirt',
    category: 'clothing',
    priceUsd: 75.0,
    discountPriceUsd: null,
    stock: 19,
    status: 'available',
    description:
      'អាវក្រៅសាច់ក្រណាត់គុណភាពខ្ពស់ កាត់ដេរយ៉ាងផ្ចិតផ្ចង់ បំពាក់ឡេវពណ៌មាសសំរឹទ្ធ ស័ក្តិសមទាំងការពាក់ប្រចាំថ្ងៃ និងកម្មវិធីផ្លូវការ។',
    imageUrl: productTailoredJacket,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['ខ្មៅដិត'],
    isNew: true,
    isPopular: false,
    soldCount: 11,
    createdAt: STATIC_DATE,
    updatedAt: STATIC_DATE,
  },
  {
    id: 'static_prod_3',
    sku: 'ODS-BAG-003',
    name: 'កាបូបស្បែកយួរដៃ Royal Clasp Tote',
    category: 'bags',
    priceUsd: 145.0,
    discountPriceUsd: 119.0,
    stock: 12,
    status: 'available',
    description:
      'កាបូបស្បែកកូនគោប្រណីត រាងរឹងមាំស្អាត បំពាក់គន្លឹះមាសបែបទំនើប មានកន្លែងដាក់សម្ភារៈធំទូលាយ និងខ្សែស្ពាយចំហៀង។',
    imageUrl: productLeatherHandbag,
    sizes: ['Standard'],
    colors: ['ខ្មៅ-មាស'],
    isNew: false,
    isPopular: true,
    soldCount: 25,
    createdAt: STATIC_DATE,
    updatedAt: STATIC_DATE,
  },
  {
    id: 'static_prod_4',
    sku: 'ODS-WATCH-004',
    name: 'នាឡិកាដៃ Chronograph Gold Edition',
    category: 'watches',
    priceUsd: 260.0,
    discountPriceUsd: 215.0,
    stock: 8,
    status: 'available',
    description:
      'នាឡិកាដៃមុខខ្មៅរឹងមាំ កញ្ចក់ Sapphire ការពារឆ្កូត តួស្រោបមាស brushed gold ជាមួយខ្សែស្បែកក្រពើពណ៌ខ្មៅ និងការពារទឹក ៥០ម៉ែត្រ។',
    imageUrl: productGoldChronograph,
    sizes: ['41mm'],
    colors: ['មាស-ខ្មៅ'],
    isNew: true,
    isPopular: true,
    soldCount: 15,
    createdAt: STATIC_DATE,
    updatedAt: STATIC_DATE,
  },
  {
    id: 'static_prod_5',
    sku: 'ODS-ACC-005',
    name: 'ឈុតកាបូបលុយស្បែក និងវ៉ែនតាការពារកម្តៅថ្ងៃ',
    category: 'accessories',
    priceUsd: 58.0,
    discountPriceUsd: 48.0,
    stock: 32,
    status: 'available',
    description:
      'កាបូបដាក់កាតស្បែកស្តើងទាន់សម័យ រួមជាមួយវ៉ែនតាការពារកាំរស្មី UV400 ស៊ុមខ្មៅលាយមាស រចនាប័ទ្មស្អាតសម្រាប់បុរស និងនារី។',
    imageUrl: productLeatherAccessories,
    sizes: ['One Size'],
    colors: ['ខ្មៅ-មាស'],
    isNew: false,
    isPopular: true,
    soldCount: 29,
    createdAt: STATIC_DATE,
    updatedAt: STATIC_DATE,
  },
];
