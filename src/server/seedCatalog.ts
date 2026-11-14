import bcrypt from 'bcryptjs';
import { DEFAULT_STORE_SETTINGS, mutateDb, newId, readDb } from './db.ts';
import type { Category, Coupon, Product } from '../types/shop.ts';

const INITIAL_CATEGORIES: Array<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>> = [
  { slug: 'shoes', nameKm: 'ស្បែកជើង', nameEn: 'Shoes', sortOrder: 1 },
  { slug: 'clothing', nameKm: 'សម្លៀកបំពាក់', nameEn: 'Clothing', sortOrder: 2 },
  { slug: 'bags', nameKm: 'កាបូប', nameEn: 'Bags', sortOrder: 3 },
  { slug: 'watches', nameKm: 'នាឡិកា', nameEn: 'Watches', sortOrder: 4 },
  { slug: 'accessories', nameKm: 'សម្ភារៈប្រើប្រាស់', nameEn: 'Accessories', sortOrder: 5 },
];

const INITIAL_COUPONS: Array<Omit<Coupon, 'id' | 'createdAt'>> = [
  {
    code: 'OUDOM10',
    discountType: 'percent',
    discountValue: 10,
    minOrderUsd: 30,
    maxUses: 500,
    usedCount: 0,
    active: true,
    expiresAt: null,
  },
];

const INITIAL_PRODUCTS: Array<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
];

let bootstrapped = false;

export async function ensureInitialDataSeeded(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  const state = await readDb();
  const envUsername = process.env.ADMIN_USERNAME?.trim();
  const envPassword = process.env.ADMIN_PASSWORD?.trim();
  const targetUsername = envUsername || 'oudom_admin';
  const targetPassword = envPassword || 'OudomShop@2026';

  const existingDefaultAdmin = state.admin_accounts.find(
    (a) => a.id === 'super_admin_default' || a.role === 'super_admin'
  );
  const needsAdminSync = Boolean(
    envUsername &&
      envPassword &&
      (!existingDefaultAdmin ||
        existingDefaultAdmin.username !== targetUsername ||
        !(await bcrypt.compare(targetPassword, existingDefaultAdmin.passwordHash)))
  );

  const needsSeed =
    state.categories.length === 0 ||
    state.products.length === 0 ||
    state.admin_accounts.length === 0 ||
    state.coupons.length === 0 ||
    needsAdminSync;

  if (needsSeed) {
    const passwordHash = await bcrypt.hash(targetPassword, 12);

    await mutateDb((db) => {
      const now = new Date().toISOString();

      if (db.categories.length === 0) {
        for (const cat of INITIAL_CATEGORIES) {
          db.categories.push({
            id: newId('cat'),
            ...cat,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      if (db.coupons.length === 0) {
        for (const c of INITIAL_COUPONS) {
          db.coupons.push({
            id: newId('cpn'),
            ...c,
            createdAt: now,
          });
        }
      }

      if (!db.settings?.shopName) {
        db.settings = { ...DEFAULT_STORE_SETTINGS, updatedAt: now };
      }

      if (db.products.length === 0) {
        for (const item of INITIAL_PRODUCTS) {
          db.products.push({
            id: newId('prod'),
            ...item,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      if (db.admin_accounts.length === 0) {
        db.admin_accounts.push({
          id: 'super_admin_default',
          username: targetUsername,
          email: process.env.SUPER_ADMIN_EMAIL?.trim() || 'krenoudom7@gmail.com',
          displayName: 'Oudom Super Admin',
          passwordHash,
          role: 'super_admin',
          active: true,
          createdAt: now,
        });
      } else if (needsAdminSync) {
        const target =
          db.admin_accounts.find((a) => a.id === 'super_admin_default') ||
          db.admin_accounts.find((a) => a.role === 'super_admin');
        if (target) {
          target.username = targetUsername;
          target.passwordHash = passwordHash;
          target.active = true;
        }
      }
    });
  }
}
