import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type {
  AdminUser,
  BackupSnapshot,
  Category,
  Coupon,
  CustomerRecord,
  Order,
  PaymentRecord,
  Product,
  StoreSettings,
} from '../types/shop.ts';

export interface AdminAccountRecord extends AdminUser {
  passwordHash: string;
}

export interface MediaRecord {
  id: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
  uploadedBy: string;
  createdAt: string;
}

export interface AdminRoleRecord {
  uid: string;
  email: string;
  role: string;
  active: boolean;
  updatedAt: string;
}

interface DatabaseState {
  categories: Category[];
  coupons: Coupon[];
  settings: StoreSettings;
  products: Product[];
  orders: Order[];
  customers: CustomerRecord[];
  payments: PaymentRecord[];
  admin_accounts: AdminAccountRecord[];
  admin_roles: AdminRoleRecord[];
  media: MediaRecord[];
  backups: BackupSnapshot[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'oudom-shop.db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  shopName: 'ឧត្តម Shop',
  heroEyebrow: 'ឧត្តម Shop · សម័យទំនើប និងប្រណីតភាព',
  heroTitle: 'ស្ទីលប្រណីត សម្រាប់គ្រប់ជំហានប្រចាំថ្ងៃ',
  heroSubtitle:
    'ស្បែកជើង សម្លៀកបំពាក់ កាបូប និងនាឡិកាគុណភាពខ្ពស់ ដឹកជញ្ជូនរហ័សទូទាំងប្រទេស ទូទាត់សុវត្ថិភាពតាម ABA PayWay។',
  announcementText: 'ដឹកជញ្ជូនឥតគិតថ្លៃទូទាំងប្រទេសសម្រាប់ការបញ្ជាទិញចាប់ពី $50 · ប្រើកូដ OUDOM10 បញ្ចុះ 10%',
  contactPhone: '012 888 999',
  contactAddress: 'រាជធានីភ្នំពេញ ព្រះរាជាណាចក្រកម្ពុជា',
  telegramContact: '@oudomshop_kh',
  abaAccountName: 'UDOM KREN',
  abaAccountId: '3609517',
  abaAccountUsd: '009 338 762',
  abaAccountKhr: '009 338 764',
  khrRate: Number(process.env.KHR_EXCHANGE_RATE || 4100),
  freeShippingThresholdUsd: 50,
  phnomPenhShippingUsd: 1.5,
  provinceShippingUsd: 2.5,
  updatedAt: new Date().toISOString(),
};

const DEFAULT_STATE: DatabaseState = {
  categories: [],
  coupons: [],
  settings: DEFAULT_STORE_SETTINGS,
  products: [],
  orders: [],
  customers: [],
  payments: [],
  admin_accounts: [],
  admin_roles: [],
  media: [],
  backups: [],
};

let cache: DatabaseState | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

export async function readDb(): Promise<DatabaseState> {
  if (cache) return cache;
  await ensureDir();
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseState>;
    cache = {
      categories: parsed.categories || [],
      coupons: parsed.coupons || [],
      settings: { ...DEFAULT_STORE_SETTINGS, ...(parsed.settings || {}) },
      products: parsed.products || [],
      orders: parsed.orders || [],
      customers: parsed.customers || [],
      payments: parsed.payments || [],
      admin_accounts: parsed.admin_accounts || [],
      admin_roles: parsed.admin_roles || [],
      media: parsed.media || [],
      backups: parsed.backups || [],
    };
  } catch {
    cache = structuredClone(DEFAULT_STATE);
    await persistDb(cache);
  }
  return cache;
}

async function persistDb(state: DatabaseState): Promise<void> {
  await ensureDir();
  const tmpFile = `${DB_FILE}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpFile, DB_FILE);
}

export async function mutateDb<T>(fn: (state: DatabaseState) => T | Promise<T>): Promise<T> {
  let result!: T;
  const next = writeQueue.then(async () => {
    const state = await readDb();
    result = await fn(state);
    await persistDb(state);
  });
  writeQueue = next.catch(() => {});
  await next;
  return result;
}

export function newId(prefix = ''): string {
  const raw = crypto.randomBytes(10).toString('hex');
  return prefix ? `${prefix}_${raw}` : raw;
}

export async function writePhysicalBackupFile(snapshotId: string, state: DatabaseState): Promise<void> {
  await ensureDir();
  const filePath = path.join(BACKUP_DIR, `${snapshotId}.json`);
  const safePayload = {
    exportedAt: new Date().toISOString(),
    categories: state.categories,
    coupons: state.coupons,
    settings: state.settings,
    products: state.products,
    orders: state.orders,
    customers: state.customers,
    payments: state.payments,
  };
  await fs.writeFile(filePath, JSON.stringify(safePayload, null, 2), 'utf8');
}
