import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type {
  AdminUser,
  BackupSnapshot,
  CustomerRecord,
  Order,
  PaymentRecord,
  Product,
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

const DEFAULT_STATE: DatabaseState = {
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
    products: state.products,
    orders: state.orders,
    customers: state.customers,
    payments: state.payments,
  };
  await fs.writeFile(filePath, JSON.stringify(safePayload, null, 2), 'utf8');
}
