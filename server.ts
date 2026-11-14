import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { adminAuth, adminStorage, firebaseConfig } from './src/server/firebaseAdmin.ts';
import { mutateDb, newId, readDb, writePhysicalBackupFile } from './src/server/db.ts';
import { ensureInitialDataSeeded } from './src/server/seedCatalog.ts';
import { createAbaPayWayPurchase, getAbaConfig, verifyAbaTransaction } from './src/server/abaPayWay.ts';
import { isTelegramConfigured, sendOrderTelegramNotification, sendRawTelegramMessage } from './src/server/telegram.ts';
import type {
  AdminRole,
  BackupSnapshot,
  Category,
  Coupon,
  CurrencyCode,
  DashboardStats,
  DeliveryZone,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductCategory,
  StoreSettings,
} from './src/types/shop.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() ||
  crypto.createHash('sha256').update(`${firebaseConfig.projectId}-oudom-shop-session`).digest('hex');

const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE?.trim() || 'OUDOM-2026-SEC';
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL?.trim() || 'krenoudom7@gmail.com').toLowerCase();

interface AdminJwtPayload {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  email?: string;
}

interface AdminRequest extends Request {
  admin?: AdminJwtPayload;
}

function getAppBaseUrl(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

function signAdminToken(payload: AdminJwtPayload): string {
  return jwt.sign(payload, SESSION_SECRET, { expiresIn: '12h' });
}

function setSessionCookie(res: Response, token: string) {
  res.cookie('oudom_admin_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

function requireAdminAuth(req: AdminRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const cookieToken = req.cookies?.oudom_admin_session as string | undefined;
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'សូមចូលគណនី Admin ជាមុនសិន (Unauthorized)' });
  }

  try {
    const decoded = jwt.verify(token, SESSION_SECRET) as AdminJwtPayload;
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Session ផុតកំណត់ ឬមិនត្រឹមត្រូវ។ សូម Login ម្តងទៀត។' });
  }
}

function requireRole(allowedRoles: AdminRole[]) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    if (!req.admin || !allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({
        error: 'អ្នកមិនមានសិទ្ធិគ្រប់គ្រាន់សម្រាប់ប្រតិបត្តិការនេះទេ (Forbidden)',
      });
    }
    next();
  };
}

function evaluateCoupon(
  coupons: Coupon[],
  rawCode: string | undefined,
  subtotalUsd: number
): { valid: boolean; coupon?: Coupon; discountUsd: number; error?: string } {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { valid: false, discountUsd: 0 };

  const coupon = coupons.find((c) => c.code === code);
  if (!coupon || !coupon.active) {
    return { valid: false, discountUsd: 0, error: 'កូដបញ្ចុះតម្លៃមិនត្រឹមត្រូវ ឬត្រូវបានបិទ' };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { valid: false, discountUsd: 0, error: 'កូដបញ្ចុះតម្លៃនេះផុតកំណត់ហើយ' };
  }
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, discountUsd: 0, error: 'កូដបញ្ចុះតម្លៃនេះត្រូវបានប្រើអស់ចំនួនកំណត់ហើយ' };
  }
  if (subtotalUsd < coupon.minOrderUsd) {
    return {
      valid: false,
      discountUsd: 0,
      error: `កូដនេះតម្រូវឱ្យទិញចាប់ពី $${coupon.minOrderUsd.toFixed(2)} ឡើងទៅ`,
    };
  }

  const rawDiscount =
    coupon.discountType === 'percent'
      ? (subtotalUsd * coupon.discountValue) / 100
      : coupon.discountValue;

  const discountUsd = Number(Math.min(subtotalUsd, Math.max(0, rawDiscount)).toFixed(2));
  return { valid: true, coupon, discountUsd };
}

async function runPeriodicBackupIfNeeded(
  trigger: 'manual' | 'auto_scheduled',
  createdBy: string
): Promise<BackupSnapshot | null> {
  try {
    const current = await readDb();
    if (trigger === 'auto_scheduled' && current.backups.length > 0) {
      const latest = current.backups[0];
      if (Date.now() - new Date(latest.createdAt).getTime() < 24 * 60 * 60 * 1000) {
        return null;
      }
    }

    const snapshot = await mutateDb(async (db) => {
      const snap: BackupSnapshot = {
        id: newId('bkp'),
        createdBy,
        productCount: db.products.length,
        orderCount: db.orders.length,
        customerCount: db.customers.length,
        paymentCount: db.payments.length,
        trigger,
        createdAt: new Date().toISOString(),
      };
      db.backups.unshift(snap);
      if (db.backups.length > 50) {
        db.backups = db.backups.slice(0, 50);
      }
      await writePhysicalBackupFile(snap.id, db);
      return snap;
    });

    return snapshot;
  } catch (error) {
    console.error('Backup snapshot failed:', error);
    return null;
  }
}

async function finalizePaidOrder(
  orderId: string,
  apv?: string,
  statusDetail?: string
): Promise<Order | null> {
  const outcome = await mutateDb((db) => {
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) return { order: null, becamePaidNow: false };
    if (order.paymentStatus === 'paid') {
      return { order, becamePaidNow: false };
    }

    const now = new Date().toISOString();

    for (const item of order.items) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod) {
        const nextStock = Math.max(0, Number(prod.stock || 0) - item.quantity);
        prod.stock = nextStock;
        prod.status = nextStock <= 0 ? 'out_of_stock' : prod.status;
        prod.soldCount = Number(prod.soldCount || 0) + item.quantity;
        prod.updatedAt = now;
      }
    }

    const cust = db.customers.find((c) => c.id === order.customerId);
    if (cust) {
      cust.totalSpentUsd = Number((Number(cust.totalSpentUsd || 0) + order.totalUsd).toFixed(2));
    }

    order.paymentStatus = 'paid';
    if (order.orderStatus === 'pending') {
      order.orderStatus = 'paid';
    }
    order.updatedAt = now;

    db.payments.unshift({
      id: newId('pay'),
      orderId: order.id,
      orderNumber: order.orderNumber,
      tranId: order.abaTranId,
      amountUsd: order.totalUsd,
      amountKhr: order.totalKhr,
      currency: order.currency,
      method: order.paymentMethod,
      status: 'paid',
      provider: 'ABA PayWay',
      verifiedByServer: true,
      apv: apv || '',
      statusDetail: statusDetail || 'Payment confirmed',
      createdAt: now,
    });

    return { order: { ...order }, becamePaidNow: true };
  });

  if (outcome.order && outcome.becamePaidNow) {
    await sendOrderTelegramNotification(outcome.order, 'payment_paid');
  }

  return outcome.order;
}

async function startServer() {
  await ensureInitialDataSeeded();
  const app = express();
  app.set('trust proxy', 1);

  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedEnvOrigin = process.env.ALLOWED_ORIGIN?.trim();
    if (
      origin &&
      (origin.endsWith('.github.io') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        (allowedEnvOrigin && origin === allowedEnvOrigin))
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 180,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'សំណើច្រើនពេក សូមរង់ចាំបន្តិច។' },
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'ការព្យាយាមចូលគណនីច្រើនពេក។ សូមព្យាយាមម្តងទៀតក្រោយ ១៥ នាទី។' },
  });

  app.use('/api', apiLimiter);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 6 * 1024 * 1024 },
  });

  // Public storefront config, categories & settings
  app.get('/api/config/public', async (_req, res) => {
    await ensureInitialDataSeeded();
    const db = await readDb();
    const categories = [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
    res.json({
      khrRate: db.settings.khrRate,
      freeShippingThresholdUsd: db.settings.freeShippingThresholdUsd,
      standardShippingFeeUsd: db.settings.phnomPenhShippingUsd,
      phnomPenhShippingUsd: db.settings.phnomPenhShippingUsd,
      provinceShippingUsd: db.settings.provinceShippingUsd,
      settings: db.settings,
      categories,
      abaConfigured: Boolean(getAbaConfig()),
      telegramConfigured: isTelegramConfigured(),
    });
  });

  // Public: list dynamic categories
  app.get('/api/categories', async (_req, res) => {
    await ensureInitialDataSeeded();
    const db = await readDb();
    const categories = [...db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
    res.json({ categories });
  });

  // Public: validate promo coupon code
  app.post('/api/coupons/validate', async (req, res) => {
    try {
      await ensureInitialDataSeeded();
      const code = String(req.body?.code || '').trim().toUpperCase();
      const subtotalUsd = Number(req.body?.subtotalUsd || 0);
      const db = await readDb();
      const check = evaluateCoupon(db.coupons, code, subtotalUsd);
      if (!check.valid || !check.coupon) {
        return res.status(400).json({ error: check.error || 'កូដបញ្ចុះតម្លៃមិនត្រឹមត្រូវទេ' });
      }
      res.json({
        coupon: {
          code: check.coupon.code,
          discountType: check.coupon.discountType,
          discountValue: check.coupon.discountValue,
          discountUsd: check.discountUsd,
        },
      });
    } catch {
      res.status(500).json({ error: 'មិនអាចផ្ទៀងផ្ទាត់កូដបញ្ចុះតម្លៃបានទេ' });
    }
  });

  // Public: list products (with dynamic categories & sorting)
  app.get('/api/products', async (req, res) => {
    try {
      await ensureInitialDataSeeded();
      const db = await readDb();
      let items = [...db.products].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const category = String(req.query.category || '').trim();
      const search = String(req.query.search || '').trim().toLowerCase();
      const filter = String(req.query.filter || '').trim();
      const sort = String(req.query.sort || '').trim();

      if (category && category !== 'all') {
        items = items.filter((p) => p.category === category);
      }

      if (filter === 'new') {
        items = items.filter((p) => p.isNew);
      } else if (filter === 'popular') {
        items = items.filter((p) => p.isPopular || p.soldCount > 0);
      } else if (filter === 'sale') {
        items = items.filter(
          (p) => p.discountPriceUsd !== null && p.discountPriceUsd < p.priceUsd
        );
      }

      if (search) {
        items = items.filter(
          (p) =>
            p.name.toLowerCase().includes(search) ||
            p.sku.toLowerCase().includes(search) ||
            p.description.toLowerCase().includes(search)
        );
      }

      const activePrice = (p: Product) =>
        p.discountPriceUsd !== null && p.discountPriceUsd < p.priceUsd
          ? p.discountPriceUsd
          : p.priceUsd;

      if (sort === 'price_asc') {
        items.sort((a, b) => activePrice(a) - activePrice(b));
      } else if (sort === 'price_desc') {
        items.sort((a, b) => activePrice(b) - activePrice(a));
      } else if (sort === 'bestselling') {
        items.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
      }

      res.json({ products: items });
    } catch (error) {
      console.error('Failed to fetch products:', error);
      res.status(500).json({ error: 'មិនអាចទាញយកបញ្ជីផលិតផលបានទេ' });
    }
  });

  // Public: serve uploaded product media
  app.get('/api/media/:id', async (req, res) => {
    try {
      const db = await readDb();
      const media = db.media.find((m) => m.id === req.params.id);
      if (!media) {
        return res.status(404).send('Not found');
      }
      const buffer = Buffer.from(media.base64Data, 'base64');
      res.setHeader('Content-Type', media.mimeType || 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(buffer);
    } catch (error) {
      console.error('Failed to serve media:', error);
      res.status(500).send('Error serving media');
    }
  });

  // Public: Create Order & Initiate ABA PayWay (supports Delivery Zone + Coupon Code)
  app.post('/api/orders', async (req, res) => {
    try {
      await ensureInitialDataSeeded();
      const body = req.body as {
        customerName?: string;
        customerPhone?: string;
        shippingAddress?: string;
        deliveryZone?: DeliveryZone;
        couponCode?: string;
        notes?: string;
        currency?: CurrencyCode;
        paymentMethod?: PaymentMethod;
        items?: Array<{
          productId: string;
          quantity: number;
          selectedSize?: string;
          selectedColor?: string;
        }>;
      };

      const customerName = String(body.customerName || '').trim();
      const customerPhone = String(body.customerPhone || '').trim();
      const shippingAddress = String(body.shippingAddress || '').trim();
      const deliveryZone: DeliveryZone =
        body.deliveryZone === 'province' ? 'province' : 'phnom_penh';
      const notes = String(body.notes || '').trim().slice(0, 300);
      const currency: CurrencyCode = body.currency === 'KHR' ? 'KHR' : 'USD';
      const allowedMethods: PaymentMethod[] = ['bank_qr', 'cod', 'aba_payway', 'aba_khqr'];
      const paymentMethod: PaymentMethod = allowedMethods.includes(body.paymentMethod as PaymentMethod)
        ? (body.paymentMethod as PaymentMethod)
        : 'bank_qr';
      const reqItems = Array.isArray(body.items) ? body.items : [];

      if (customerName.length < 2 || customerName.length > 120) {
        return res.status(400).json({ error: 'សូមបញ្ចូលឈ្មោះអតិថិជនឱ្យបានត្រឹមត្រូវ' });
      }
      if (!/^[0-9+\-\s]{7,20}$/.test(customerPhone)) {
        return res.status(400).json({ error: 'សូមបញ្ចូលលេខទូរស័ព្ទឱ្យបានត្រឹមត្រូវ' });
      }
      if (shippingAddress.length < 5 || shippingAddress.length > 400) {
        return res.status(400).json({ error: 'សូមបញ្ចូលអាសយដ្ឋានដឹកជញ្ជូនឱ្យបានច្បាស់លាស់' });
      }
      if (reqItems.length === 0 || reqItems.length > 30) {
        return res.status(400).json({ error: 'កន្ត្រកទំនិញទទេ ឬលើសចំនួនកំណត់' });
      }

      const db = await readDb();
      const orderItems: OrderItem[] = [];
      let subtotalUsd = 0;
      let productDiscountUsd = 0;

      for (const reqItem of reqItems) {
        const qty = Math.floor(Number(reqItem.quantity));
        if (!reqItem.productId || !Number.isFinite(qty) || qty < 1 || qty > 99) {
          return res.status(400).json({ error: 'ចំនួនទំនិញមិនត្រឹមត្រូវ' });
        }

        const product = db.products.find((p) => p.id === reqItem.productId);
        if (!product) {
          return res.status(404).json({ error: 'រកមិនឃើញផលិតផលក្នុងប្រព័ន្ធទេ' });
        }

        if (product.status === 'out_of_stock' || product.stock < qty) {
          return res.status(400).json({
            error: `ផលិតផល "${product.name}" អស់ពីស្តុក ឬសល់មិនគ្រប់ចំនួន (សល់ ${product.stock})`,
          });
        }

        const effectivePrice =
          product.discountPriceUsd !== null &&
          product.discountPriceUsd >= 0 &&
          product.discountPriceUsd < product.priceUsd
            ? product.discountPriceUsd
            : product.priceUsd;

        const lineTotal = Number((effectivePrice * qty).toFixed(2));
        subtotalUsd += lineTotal;
        if (effectivePrice < product.priceUsd) {
          productDiscountUsd += (product.priceUsd - effectivePrice) * qty;
        }

        orderItems.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          imageUrl: product.imageUrl,
          quantity: qty,
          unitPriceUsd: effectivePrice,
          originalPriceUsd: product.priceUsd,
          lineTotalUsd: lineTotal,
          selectedSize: reqItem.selectedSize ? String(reqItem.selectedSize).slice(0, 32) : undefined,
          selectedColor: reqItem.selectedColor ? String(reqItem.selectedColor).slice(0, 32) : undefined,
        });
      }

      subtotalUsd = Number(subtotalUsd.toFixed(2));
      productDiscountUsd = Number(productDiscountUsd.toFixed(2));

      // Validate optional Promo Coupon on Server
      let appliedCouponCode: string | undefined;
      let couponDiscountUsd = 0;
      if (body.couponCode && String(body.couponCode).trim()) {
        const couponCheck = evaluateCoupon(db.coupons, body.couponCode, subtotalUsd);
        if (!couponCheck.valid || !couponCheck.coupon) {
          return res.status(400).json({ error: couponCheck.error || 'កូដបញ្ចុះតម្លៃមិនត្រឹមត្រូវទេ' });
        }
        appliedCouponCode = couponCheck.coupon.code;
        couponDiscountUsd = couponCheck.discountUsd;
      }

      const netSubtotalUsd = Math.max(0, Number((subtotalUsd - couponDiscountUsd).toFixed(2)));
      const zoneFee =
        deliveryZone === 'province'
          ? db.settings.provinceShippingUsd
          : db.settings.phnomPenhShippingUsd;
      const shippingFeeUsd =
        netSubtotalUsd >= db.settings.freeShippingThresholdUsd ? 0 : zoneFee;
      const totalUsd = Number((netSubtotalUsd + shippingFeeUsd).toFixed(2));
      const totalKhr = Math.round(totalUsd * db.settings.khrRate);

      const now = new Date().toISOString();
      const shortCode = crypto.randomBytes(3).toString('hex').toUpperCase();
      const orderNumber = `ODS-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${shortCode}`;
      const abaTranId = `OD${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
      const normalizedPhone = customerPhone.replace(/\s+/g, '');

      const isPayWayApi = paymentMethod === 'aba_payway' || paymentMethod === 'aba_khqr';
      const baseUrl = getAppBaseUrl(req);
      const abaResult = isPayWayApi
        ? await createAbaPayWayPurchase({
            tranId: abaTranId,
            amount: totalUsd.toFixed(2),
            currency: 'USD',
            items: orderItems,
            shipping: shippingFeeUsd.toFixed(2),
            customerName,
            customerPhone: normalizedPhone,
            paymentMethod,
            returnUrl: `${baseUrl}/?order=${encodeURIComponent(orderNumber)}`,
            continueSuccessUrl: `${baseUrl}/?order=${encodeURIComponent(orderNumber)}&aba_return=1`,
            callbackUrl: `${baseUrl}/api/payments/aba-callback`,
          })
        : {
            configured: false,
            qrString: undefined,
            qrImage: undefined,
            abapayDeeplink: undefined,
            checkoutUrl: undefined,
            payload: undefined,
            rawError: undefined,
          };

      const resolvedMode: Order['abaMode'] =
        paymentMethod === 'cod'
          ? 'cod'
          : paymentMethod === 'bank_qr'
          ? 'direct_qr'
          : abaResult.configured
          ? 'live'
          : 'unconfigured';

      const createdOrder = await mutateDb((state) => {
        if (appliedCouponCode) {
          const targetCoupon = state.coupons.find((c) => c.code === appliedCouponCode);
          if (targetCoupon) targetCoupon.usedCount += 1;
        }

        let cust = state.customers.find((c) => c.phone === normalizedPhone);
        if (!cust) {
          cust = {
            id: newId('cust'),
            name: customerName,
            phone: normalizedPhone,
            address: shippingAddress,
            totalOrders: 1,
            totalSpentUsd: 0,
            lastOrderAt: now,
            createdAt: now,
          };
          state.customers.unshift(cust);
        } else {
          cust.name = customerName;
          cust.address = shippingAddress;
          cust.totalOrders += 1;
          cust.lastOrderAt = now;
        }

        const newOrder: Order = {
          id: newId('ord'),
          orderNumber,
          customerId: cust.id,
          customerName,
          customerPhone: normalizedPhone,
          shippingAddress,
          deliveryZone,
          notes,
          items: orderItems,
          subtotalUsd,
          shippingFeeUsd,
          discountUsd: productDiscountUsd,
          ...(appliedCouponCode ? { couponCode: appliedCouponCode, couponDiscountUsd } : {}),
          totalUsd,
          totalKhr,
          currency,
          paymentMethod,
          paymentStatus: 'pending',
          orderStatus: 'pending',
          abaTranId,
          ...(abaResult.qrString ? { abaQrString: abaResult.qrString } : {}),
          ...(abaResult.qrImage ? { abaQrImage: abaResult.qrImage } : {}),
          ...(abaResult.abapayDeeplink ? { abaDeeplink: abaResult.abapayDeeplink } : {}),
          ...(abaResult.checkoutUrl ? { abaCheckoutUrl: abaResult.checkoutUrl } : {}),
          ...(abaResult.payload ? { abaPayload: abaResult.payload } : {}),
          abaMode: resolvedMode,
          telegramNotified: false,
          createdAt: now,
          updatedAt: now,
        };

        state.orders.unshift(newOrder);

        state.payments.unshift({
          id: newId('pay'),
          orderId: newOrder.id,
          orderNumber,
          tranId: abaTranId,
          amountUsd: totalUsd,
          amountKhr: totalKhr,
          currency,
          method: paymentMethod,
          status: 'pending',
          provider:
            paymentMethod === 'cod'
              ? 'Cash on Delivery (COD)'
              : paymentMethod === 'bank_qr'
              ? 'Direct KHQR / ABA Transfer'
              : 'ABA PayWay',
          verifiedByServer: false,
          statusDetail:
            paymentMethod === 'cod'
              ? 'Cash on Delivery — collect payment upon delivery'
              : paymentMethod === 'bank_qr'
              ? 'Awaiting direct KHQR/ABA transfer & proof verification'
              : abaResult.rawError
              ? `ABA PayWay notice: ${abaResult.rawError}`
              : abaResult.configured
              ? 'Awaiting ABA PayWay completion'
              : 'Awaiting Merchant ABA PayWay credentials configuration',
          createdAt: now,
        });

        return { ...newOrder };
      });

      const telegramSent = await sendOrderTelegramNotification(createdOrder, 'new_order');
      if (telegramSent) {
        await mutateDb((state) => {
          const target = state.orders.find((o) => o.id === createdOrder.id);
          if (target) target.telegramNotified = true;
        });
        createdOrder.telegramNotified = true;
      }

      res.status(201).json({
        order: createdOrder,
        abaError: abaResult.rawError,
      });
    } catch (error) {
      console.error('Order creation failed:', error);
      res.status(500).json({ error: 'មានបញ្ហាក្នុងការបង្កើតការបញ្ជាទិញ។ សូមព្យាយាមម្តងទៀត។' });
    }
  });

  // Public: Customer Order Lookup
  app.get('/api/orders/lookup', async (req, res) => {
    try {
      const orderNumber = String(req.query.orderNumber || '').trim().toUpperCase();
      const phone = String(req.query.phone || '').trim().replace(/\s+/g, '');
      if (!orderNumber || !phone) {
        return res.status(400).json({ error: 'សូមបញ្ចូលលេខកូដបញ្ជាទិញ និងលេខទូរស័ព្ទ' });
      }

      const db = await readDb();
      const order = db.orders.find((o) => o.orderNumber === orderNumber);
      if (!order) {
        return res.status(404).json({ error: 'រកមិនឃើញការបញ្ជាទិញនេះទេ' });
      }
      if (order.customerPhone !== phone) {
        return res.status(403).json({ error: 'លេខទូរស័ព្ទមិនត្រូវគ្នានឹងការបញ្ជាទិញនេះទេ' });
      }

      res.json({ order });
    } catch (error) {
      console.error('Order lookup error:', error);
      res.status(500).json({ error: 'មិនអាចស្វែងរកការបញ្ជាទិញបានទេ' });
    }
  });

  // Public: Customer submits Payment Slip Image &/or Transfer Reference (for Admin verification)
  app.post('/api/orders/:id/payment-proof', async (req, res) => {
    try {
      const reference = String(req.body?.reference || '').trim().slice(0, 120);
      const rawSlipDataUrl = typeof req.body?.slipDataUrl === 'string' ? req.body.slipDataUrl.trim() : '';

      if (!reference && !rawSlipDataUrl) {
        return res.status(400).json({ error: 'សូមភ្ជាប់រូបភាពវិក្កយបត្រ ឬបញ្ចូលលេខយោងផ្ទេរប្រាក់' });
      }

      let storedSlipUrl = '';
      if (rawSlipDataUrl) {
        const dataMatch = /^data:(image\/(?:jpeg|jpg|png|webp|avif));base64,([A-Za-z0-9+/=]+)$/.exec(
          rawSlipDataUrl
        );
        if (!dataMatch) {
          return res.status(400).json({ error: 'ទម្រង់រូបភាពវិក្កយបត្រមិនត្រឹមត្រូវទេ (JPG, PNG, WebP)' });
        }
        const mimeType = dataMatch[1] === 'image/jpg' ? 'image/jpeg' : dataMatch[1];
        const base64Body = dataMatch[2];
        const buffer = Buffer.from(base64Body, 'base64');
        if (buffer.byteLength > 2.5 * 1024 * 1024) {
          return res.status(400).json({ error: 'ទំហំរូបភាពវិក្កយបត្រធំពេក (អតិបរមា 2.5MB)' });
        }

        const mediaId = await mutateDb((state) => {
          const id = newId('slip');
          state.media.push({
            id,
            mimeType,
            sizeBytes: buffer.byteLength,
            base64Data: buffer.toString('base64'),
            uploadedBy: `customer_order_${req.params.id}`,
            createdAt: new Date().toISOString(),
          });
          return id;
        });
        storedSlipUrl = `/api/media/${mediaId}`;
      }

      const now = new Date().toISOString();
      const updated = await mutateDb((state) => {
        const order = state.orders.find((o) => o.id === req.params.id);
        if (!order) return null;

        if (reference) {
          order.paymentReference = reference;
        }
        if (storedSlipUrl) {
          order.paymentSlipUrl = storedSlipUrl;
        }
        order.paymentSubmittedAt = now;
        order.updatedAt = now;

        const payment = state.payments.find((p) => p.orderId === order.id);
        if (payment && payment.status === 'pending') {
          payment.statusDetail = `អតិថិជនបានផ្ញើភស្តុតាងទូទាត់${reference ? ` (Ref: ${reference})` : ''}${storedSlipUrl ? ' + រូបភាពវិក្កយបត្រ' : ''} — រង់ចាំ Admin ពិនិត្យ`;
        }
        return { ...order };
      });

      if (!updated) {
        return res.status(404).json({ error: 'រកមិនឃើញការបញ្ជាទិញទេ' });
      }

      await sendRawTelegramMessage(
        `🧾 <b>អតិថិជនបានផ្ញើភស្តុតាងបង់ប្រាក់!</b>\n• Order: <code>${updated.orderNumber}</code>\n• អតិថិជន: ${updated.customerName} (${updated.customerPhone})\n• ចំនួន: $${updated.totalUsd.toFixed(2)} (${updated.totalKhr.toLocaleString('en-US')} ៛)\n• លេខយោង: ${reference || 'មិនបានបញ្ចូល'}\n• រូបភាពវិក្កយបត្រ: ${storedSlipUrl ? 'បានភ្ជាប់រួចរាល់ (មើលក្នុង Admin Dashboard)' : 'គ្មាន'}\nសូមពិនិត្យ រួចចុច Confirm Paid ក្នុង Admin Dashboard។`
      );

      res.json({
        order: updated,
        message: 'បានផ្ញើភស្តុតាងបង់ប្រាក់ទៅហាងរួចរាល់! ក្រុមការងារនឹងពិនិត្យ និងបញ្ជាក់ជូនលោកអ្នកឆាប់ៗ។',
      });
    } catch (error) {
      console.error('Payment proof upload failed:', error);
      res.status(500).json({ error: 'មិនអាចផ្ញើភស្តុតាងបង់ប្រាក់បានទេ' });
    }
  });

  // Public: Customer reports ABA Bank Transfer reference for Admin verification (does NOT mark Paid)
  app.post('/api/orders/:id/transfer-note', async (req, res) => {
    try {
      const reference = String(req.body?.reference || '').trim().slice(0, 120);
      const now = new Date().toISOString();
      const updated = await mutateDb((state) => {
        const order = state.orders.find((o) => o.id === req.params.id);
        if (!order) return null;
        if (reference) {
          order.paymentReference = reference;
        }
        order.paymentSubmittedAt = now;
        const noteTag = reference ? `[ABA Ref: ${reference}]` : '[អតិថិជនជូនដំណឹងថាបានផ្ទេរប្រាក់ ABA]';
        order.notes = order.notes ? `${order.notes} · ${noteTag}` : noteTag;
        order.updatedAt = now;

        const payment = state.payments.find((p) => p.orderId === order.id);
        if (payment && payment.status === 'pending') {
          payment.statusDetail = `Customer reported transfer (${reference || 'no ref'}) — awaiting admin verification`;
        }
        return { ...order };
      });

      if (!updated) {
        return res.status(404).json({ error: 'រកមិនឃើញការបញ្ជាទិញទេ' });
      }

      await sendRawTelegramMessage(
        `💳 អតិថិជនជូនដំណឹងថាបានផ្ទេរប្រាក់!\nOrder: <code>${updated.orderNumber}</code>\nឈ្មោះ: ${updated.customerName} (${updated.customerPhone})\nចំនួន: $${updated.totalUsd.toFixed(2)} (${updated.totalKhr.toLocaleString('en-US')} ៛)\nកំណត់សម្គាល់: ${reference || 'មិនបានបញ្ចូលលេខយោង'}\nសូមពិនិត្យគណនី រួចចុច Confirm Paid ក្នុង Admin Dashboard។`
      );

      res.json({
        order: updated,
        message: 'បានផ្ញើដំណឹងទៅហាងរួចរាល់! ក្រុមការងារនឹងផ្ទៀងផ្ទាត់ការបង់ប្រាក់របស់លោកអ្នកក្នុងពេលឆាប់ៗ។',
      });
    } catch (error) {
      console.error('Transfer note failed:', error);
      res.status(500).json({ error: 'មិនអាចផ្ញើដំណឹងផ្ទេរប្រាក់បានទេ' });
    }
  });

  // Server-to-server ABA PayWay Pushback Callback
  app.post('/api/payments/aba-callback', async (req, res) => {
    try {
      const tranId = String(req.body?.tran_id || req.query?.tran_id || '').trim();
      if (!tranId) {
        return res.status(400).json({ error: 'Missing tran_id' });
      }

      const db = await readDb();
      const order = db.orders.find((o) => o.abaTranId === tranId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const verification = await verifyAbaTransaction(tranId);
      if (verification.verifiedPaid) {
        await finalizePaidOrder(order.id, verification.apv, verification.message);
        return res.json({ status: 'ok', paymentStatus: 'paid' });
      }

      if (verification.status === 'failed') {
        const failedOrder = await mutateDb((state) => {
          const target = state.orders.find((o) => o.id === order.id);
          if (!target) return null;
          target.paymentStatus = 'failed';
          target.orderStatus = 'failed';
          target.updatedAt = new Date().toISOString();
          return { ...target };
        });
        if (failedOrder) {
          await sendOrderTelegramNotification(failedOrder, 'order_failed');
        }
        return res.json({ status: 'ok', paymentStatus: 'failed' });
      }

      return res.json({ status: 'ok', paymentStatus: 'pending', message: verification.message });
    } catch (error) {
      console.error('ABA callback handling failed:', error);
      res.status(500).json({ error: 'Callback verification error' });
    }
  });

  // Public: Server-side Payment Verification Check
  app.post('/api/payments/verify/:orderId', async (req, res) => {
    try {
      const db = await readDb();
      const order = db.orders.find((o) => o.id === req.params.orderId);
      if (!order) {
        return res.status(404).json({ error: 'រកមិនឃើញការបញ្ជាទិញទេ' });
      }

      if (order.paymentStatus === 'paid') {
        return res.json({
          order,
          verification: { verifiedPaid: true, status: 'paid', message: 'បានទូទាត់រួចរាល់' },
        });
      }

      const verification = await verifyAbaTransaction(order.abaTranId);
      if (verification.verifiedPaid) {
        const finalized = await finalizePaidOrder(order.id, verification.apv, verification.message);
        return res.json({ order: finalized || order, verification });
      }

      if (verification.status === 'failed') {
        const failedOrder = await mutateDb((state) => {
          const target = state.orders.find((o) => o.id === order.id);
          if (!target) return null;
          target.paymentStatus = 'failed';
          target.orderStatus = 'failed';
          target.updatedAt = new Date().toISOString();
          return { ...target };
        });
        if (failedOrder) {
          await sendOrderTelegramNotification(failedOrder, 'order_failed');
        }
        return res.json({ order: failedOrder || order, verification });
      }

      res.json({ order, verification });
    } catch (error) {
      console.error('Payment verification error:', error);
      res.status(500).json({ error: 'មិនអាចផ្ទៀងផ្ទាត់ការទូទាត់បានទេ' });
    }
  });

  // ---------------- ADMIN AUTHENTICATION ----------------

  app.post('/api/admin/login', loginLimiter, async (req, res) => {
    try {
      await ensureInitialDataSeeded();
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');

      if (!username || !password) {
        return res.status(400).json({ error: 'សូមបំពេញ Username និង Password' });
      }

      const db = await readDb();
      const account = db.admin_accounts.find((a) => a.username === username);
      if (!account) {
        return res.status(401).json({ error: 'ឈ្មោះអ្នកប្រើប្រាស់ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ' });
      }

      if (!account.active) {
        return res.status(403).json({ error: 'គណនី Admin នេះត្រូវបានផ្អាកដំណើរការ' });
      }

      const passwordValid = await bcrypt.compare(password, account.passwordHash);
      if (!passwordValid) {
        return res.status(401).json({ error: 'ឈ្មោះអ្នកប្រើប្រាស់ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ' });
      }

      await mutateDb((state) => {
        const target = state.admin_accounts.find((a) => a.id === account.id);
        if (target) target.lastLoginAt = new Date().toISOString();
      });

      const userPayload: AdminJwtPayload = {
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        role: account.role,
        email: account.email,
      };

      const token = signAdminToken(userPayload);
      setSessionCookie(res, token);
      res.json({ user: userPayload, token });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: 'មានបញ្ហាក្នុងការចូលប្រើប្រព័ន្ធ Admin' });
    }
  });

  app.post('/api/admin/google-login', loginLimiter, async (req, res) => {
    try {
      await ensureInitialDataSeeded();
      const idToken = String(req.body?.idToken || '').trim();

      if (!idToken) {
        return res.status(400).json({ error: 'សូមផ្ទៀងផ្ទាត់គណនី Google ជាមុនសិន' });
      }

      const decoded = await adminAuth.verifyIdToken(idToken);
      const email = (decoded.email || '').toLowerCase();
      if (!decoded.email_verified || !email) {
        return res.status(403).json({ error: 'អ៊ីមែល Google មិនទាន់បានផ្ទៀងផ្ទាត់ទេ' });
      }

      const db = await readDb();
      let role: AdminRole | null = null;
      if (email === SUPER_ADMIN_EMAIL) {
        role = 'super_admin';
        await mutateDb((state) => {
          const existing = state.admin_roles.find((r) => r.uid === decoded.uid);
          if (!existing) {
            state.admin_roles.push({
              uid: decoded.uid,
              email,
              role: 'super_admin',
              active: true,
              updatedAt: new Date().toISOString(),
            });
          }
        });
      } else {
        const matched = db.admin_roles.find((r) => r.uid === decoded.uid && r.active);
        if (matched) role = matched.role as AdminRole;
      }

      if (!role) {
        return res.status(403).json({ error: 'គណនី Google នេះមិនមានសិទ្ធិ Admin ទេ' });
      }

      const userPayload: AdminJwtPayload = {
        id: decoded.uid,
        username: email.split('@')[0],
        displayName: decoded.name || email,
        role,
        email,
      };

      const token = signAdminToken(userPayload);
      setSessionCookie(res, token);
      res.json({ user: userPayload, token });
    } catch (error) {
      console.error('Google admin login error:', error);
      res.status(401).json({ error: 'ការផ្ទៀងផ្ទាត់ Google Sign-In បរាជ័យ' });
    }
  });

  app.post('/api/admin/logout', (_req, res) => {
    res.clearCookie('oudom_admin_session', { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/admin/me', requireAdminAuth, (req: AdminRequest, res) => {
    res.json({ user: req.admin });
  });

  // ---------------- ADMIN STATS & DASHBOARD ----------------

  app.get('/api/admin/stats', requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      await ensureInitialDataSeeded();
      void runPeriodicBackupIfNeeded('auto_scheduled', req.admin?.username || 'system');

      const db = await readDb();
      const products = db.products;
      const orders = db.orders;
      const outOfStockCount = products.filter(
        (p) => p.status === 'out_of_stock' || p.stock <= 0
      ).length;

      const paidOrders = orders.filter((o) => o.paymentStatus === 'paid');
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10);
      const monthKey = now.toISOString().slice(0, 7);

      let dailyRevenueUsd = 0;
      let monthlyRevenueUsd = 0;
      let totalRevenueUsd = 0;

      for (const order of paidOrders) {
        const amt = Number(order.totalUsd || 0);
        totalRevenueUsd += amt;
        if (order.createdAt.startsWith(todayKey)) {
          dailyRevenueUsd += amt;
        }
        if (order.createdAt.startsWith(monthKey)) {
          monthlyRevenueUsd += amt;
        }
      }

      const salesChart: DashboardStats['salesChart'] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayPaid = paidOrders.filter((o) => o.createdAt.startsWith(dateStr));
        const dayAll = orders.filter((o) => o.createdAt.startsWith(dateStr));
        salesChart.push({
          date: dateStr,
          label: `${d.getDate()}/${d.getMonth() + 1}`,
          revenueUsd: Number(dayPaid.reduce((acc, o) => acc + o.totalUsd, 0).toFixed(2)),
          orders: dayAll.length,
        });
      }

      const productSalesMap = new Map<
        string,
        { id: string; name: string; sku: string; imageUrl: string; soldCount: number; revenueUsd: number }
      >();
      for (const order of paidOrders) {
        for (const item of order.items) {
          const entry = productSalesMap.get(item.productId) || {
            id: item.productId,
            name: item.name,
            sku: item.sku,
            imageUrl: item.imageUrl,
            soldCount: 0,
            revenueUsd: 0,
          };
          entry.soldCount += item.quantity;
          entry.revenueUsd = Number((entry.revenueUsd + item.lineTotalUsd).toFixed(2));
          productSalesMap.set(item.productId, entry);
        }
      }

      const topProducts = Array.from(productSalesMap.values())
        .sort((a, b) => b.revenueUsd - a.revenueUsd || b.soldCount - a.soldCount)
        .slice(0, 5);

      const stats: DashboardStats = {
        totalProducts: products.length,
        totalOrders: orders.length,
        totalCustomers: db.customers.length,
        outOfStockCount,
        dailyRevenueUsd: Number(dailyRevenueUsd.toFixed(2)),
        monthlyRevenueUsd: Number(monthlyRevenueUsd.toFixed(2)),
        totalRevenueUsd: Number(totalRevenueUsd.toFixed(2)),
        khrRate: db.settings.khrRate,
        topProducts,
        salesChart,
        integrations: {
          abaConfigured: Boolean(getAbaConfig()),
          telegramConfigured: isTelegramConfigured(),
          databaseConnected: true,
        },
      };

      res.json({ stats });
    } catch (error) {
      console.error('Failed to compute dashboard stats:', error);
      res.status(500).json({ error: 'មិនអាចទាញយកស្ថិតិ Dashboard បានទេ' });
    }
  });

  // ---------------- ADMIN DYNAMIC CATEGORIES ----------------

  app.post(
    '/api/admin/categories',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (req, res) => {
      try {
        const nameKm = String(req.body?.nameKm || '').trim();
        const nameEn = String(req.body?.nameEn || '').trim();
        let slug = String(req.body?.slug || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        if (!slug && nameEn) {
          slug = nameEn
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
        if (!slug) {
          slug = `cat-${crypto.randomBytes(3).toString('hex')}`;
        }

        if (!nameKm || nameKm.length > 80) {
          return res.status(400).json({ error: 'សូមបញ្ចូលឈ្មោះប្រភេទទំនិញជាភាសាខ្មែរ' });
        }
        if (slug === 'all') {
          return res.status(400).json({ error: 'មិនអាចប្រើ slug "all" បានទេ' });
        }

        const db = await readDb();
        if (db.categories.some((c) => c.slug === slug)) {
          return res.status(409).json({ error: `កូដប្រភេទ "${slug}" មានរួចហើយ` });
        }

        const now = new Date().toISOString();
        const sortOrder = Number.isFinite(Number(req.body?.sortOrder))
          ? Number(req.body.sortOrder)
          : db.categories.length + 1;

        const category = await mutateDb((state) => {
          const item: Category = {
            id: newId('cat'),
            slug,
            nameKm,
            nameEn: nameEn || undefined,
            sortOrder,
            createdAt: now,
            updatedAt: now,
          };
          state.categories.push(item);
          return item;
        });

        res.status(201).json({ category });
      } catch (error) {
        console.error('Create category failed:', error);
        res.status(500).json({ error: 'មិនអាចបន្ថែមប្រភេទទំនិញបានទេ' });
      }
    }
  );

  app.put(
    '/api/admin/categories/:id',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (req, res) => {
      try {
        const nameKm = String(req.body?.nameKm || '').trim();
        const nameEn = String(req.body?.nameEn || '').trim();
        const sortOrder = Number(req.body?.sortOrder);

        if (!nameKm) {
          return res.status(400).json({ error: 'សូមបញ្ចូលឈ្មោះប្រភេទទំនិញ' });
        }

        const updated = await mutateDb((state) => {
          const target = state.categories.find((c) => c.id === req.params.id);
          if (!target) return null;
          target.nameKm = nameKm;
          target.nameEn = nameEn || undefined;
          if (Number.isFinite(sortOrder)) target.sortOrder = sortOrder;
          target.updatedAt = new Date().toISOString();
          return { ...target };
        });

        if (!updated) {
          return res.status(404).json({ error: 'រកមិនឃើញប្រភេទទំនិញទេ' });
        }
        res.json({ category: updated });
      } catch {
        res.status(500).json({ error: 'មិនអាចកែប្រែប្រភេទទំនិញបានទេ' });
      }
    }
  );

  app.delete(
    '/api/admin/categories/:id',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (req, res) => {
      try {
        const db = await readDb();
        const target = db.categories.find((c) => c.id === req.params.id);
        if (!target) {
          return res.status(404).json({ error: 'រកមិនឃើញប្រភេទទំនិញទេ' });
        }

        const inUseCount = db.products.filter((p) => p.category === target.slug).length;
        if (inUseCount > 0) {
          return res.status(400).json({
            error: `មិនអាចលុបបានទេ ព្រោះមានផលិតផលចំនួន ${inUseCount} កំពុងប្រើប្រភេទ "${target.nameKm}" នេះ`,
          });
        }

        await mutateDb((state) => {
          state.categories = state.categories.filter((c) => c.id !== req.params.id);
        });
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'មិនអាចលុបប្រភេទទំនិញបានទេ' });
      }
    }
  );

  // ---------------- ADMIN PROMO COUPONS ----------------

  app.get('/api/admin/coupons', requireAdminAuth, async (_req, res) => {
    const db = await readDb();
    res.json({ coupons: db.coupons });
  });

  app.post(
    '/api/admin/coupons',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (req, res) => {
      try {
        const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        const discountType = req.body?.discountType === 'fixed' ? 'fixed' : 'percent';
        const discountValue = Number(req.body?.discountValue);
        const minOrderUsd = Math.max(0, Number(req.body?.minOrderUsd || 0));
        const maxUses = Math.max(0, Math.floor(Number(req.body?.maxUses || 0)));

        if (!code || code.length < 2 || code.length > 32) {
          return res.status(400).json({ error: 'កូដបញ្ចុះតម្លៃត្រូវមាន ២-៣២ តួអក្សរឡាតាំង ឬលេខ' });
        }
        if (!Number.isFinite(discountValue) || discountValue <= 0) {
          return res.status(400).json({ error: 'ចំនួនបញ្ចុះតម្លៃត្រូវតែធំជាង ០' });
        }
        if (discountType === 'percent' && discountValue > 90) {
          return res.status(400).json({ error: 'ភាគរយបញ្ចុះតម្លៃមិនអាចលើស 90% បានទេ' });
        }

        const db = await readDb();
        if (db.coupons.some((c) => c.code === code)) {
          return res.status(409).json({ error: `កូដ "${code}" មានរួចហើយ` });
        }

        const coupon = await mutateDb((state) => {
          const item: Coupon = {
            id: newId('cpn'),
            code,
            discountType,
            discountValue: Number(discountValue.toFixed(2)),
            minOrderUsd: Number(minOrderUsd.toFixed(2)),
            maxUses,
            usedCount: 0,
            active: true,
            expiresAt: req.body?.expiresAt ? String(req.body.expiresAt) : null,
            createdAt: new Date().toISOString(),
          };
          state.coupons.unshift(item);
          return item;
        });

        res.status(201).json({ coupon });
      } catch {
        res.status(500).json({ error: 'មិនអាចបង្កើតកូដបញ្ចុះតម្លៃបានទេ' });
      }
    }
  );

  app.patch(
    '/api/admin/coupons/:id',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (req, res) => {
      const updated = await mutateDb((state) => {
        const target = state.coupons.find((c) => c.id === req.params.id);
        if (!target) return null;
        if (typeof req.body?.active === 'boolean') target.active = req.body.active;
        return { ...target };
      });
      if (!updated) return res.status(404).json({ error: 'រកមិនឃើញកូដនេះទេ' });
      res.json({ coupon: updated });
    }
  );

  app.delete(
    '/api/admin/coupons/:id',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (req, res) => {
      await mutateDb((state) => {
        state.coupons = state.coupons.filter((c) => c.id !== req.params.id);
      });
      res.json({ ok: true });
    }
  );

  // ---------------- ADMIN STORE SETTINGS ----------------

  app.get('/api/admin/settings', requireAdminAuth, async (_req, res) => {
    const db = await readDb();
    res.json({ settings: db.settings });
  });

  app.put(
    '/api/admin/settings',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (req, res) => {
      try {
        const b = req.body as Partial<StoreSettings>;
        const settings = await mutateDb((state) => {
          state.settings = {
            ...state.settings,
            shopName: b.shopName !== undefined ? String(b.shopName).trim() || state.settings.shopName : state.settings.shopName,
            heroEyebrow: b.heroEyebrow !== undefined ? String(b.heroEyebrow).trim() : state.settings.heroEyebrow,
            heroTitle: b.heroTitle !== undefined ? String(b.heroTitle).trim() : state.settings.heroTitle,
            heroSubtitle: b.heroSubtitle !== undefined ? String(b.heroSubtitle).trim() : state.settings.heroSubtitle,
            announcementText: b.announcementText !== undefined ? String(b.announcementText).trim() : state.settings.announcementText,
            contactPhone: b.contactPhone !== undefined ? String(b.contactPhone).trim() : state.settings.contactPhone,
            contactAddress: b.contactAddress !== undefined ? String(b.contactAddress).trim() : state.settings.contactAddress,
            telegramContact: b.telegramContact !== undefined ? String(b.telegramContact).trim() : state.settings.telegramContact,
            abaAccountName: b.abaAccountName !== undefined ? String(b.abaAccountName).trim() : state.settings.abaAccountName,
            abaAccountId: b.abaAccountId !== undefined ? String(b.abaAccountId).trim() : state.settings.abaAccountId,
            abaAccountUsd: b.abaAccountUsd !== undefined ? String(b.abaAccountUsd).trim() : state.settings.abaAccountUsd,
            abaAccountKhr: b.abaAccountKhr !== undefined ? String(b.abaAccountKhr).trim() : state.settings.abaAccountKhr,
            abaQrUsdImage: b.abaQrUsdImage !== undefined ? String(b.abaQrUsdImage).trim().slice(0, 2000) : state.settings.abaQrUsdImage || '',
            abaQrKhrImage: b.abaQrKhrImage !== undefined ? String(b.abaQrKhrImage).trim().slice(0, 2000) : state.settings.abaQrKhrImage || '',
            khrRate: Number.isFinite(Number(b.khrRate)) && Number(b.khrRate) >= 1000 ? Math.round(Number(b.khrRate)) : state.settings.khrRate,
            freeShippingThresholdUsd:
              Number.isFinite(Number(b.freeShippingThresholdUsd)) && Number(b.freeShippingThresholdUsd) >= 0
                ? Number(Number(b.freeShippingThresholdUsd).toFixed(2))
                : state.settings.freeShippingThresholdUsd,
            phnomPenhShippingUsd:
              Number.isFinite(Number(b.phnomPenhShippingUsd)) && Number(b.phnomPenhShippingUsd) >= 0
                ? Number(Number(b.phnomPenhShippingUsd).toFixed(2))
                : state.settings.phnomPenhShippingUsd,
            provinceShippingUsd:
              Number.isFinite(Number(b.provinceShippingUsd)) && Number(b.provinceShippingUsd) >= 0
                ? Number(Number(b.provinceShippingUsd).toFixed(2))
                : state.settings.provinceShippingUsd,
            updatedAt: new Date().toISOString(),
          };
          return state.settings;
        });

        res.json({ settings });
      } catch {
        res.status(500).json({ error: 'មិនអាចរក្សាទុកការកំណត់ហាងបានទេ' });
      }
    }
  );

  // ---------------- ADMIN PRODUCT MANAGEMENT ----------------

  app.post(
    '/api/admin/upload',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    upload.single('image'),
    async (req: AdminRequest, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'សូមជ្រើសរើសរូបភាពជាមុនសិន' });
        }

        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
        if (!allowedMimes.includes(req.file.mimetype)) {
          return res.status(400).json({ error: 'គាំទ្រតែរូបភាព JPG, PNG, WebP ឬ AVIF ប៉ុណ្ណោះ' });
        }

        try {
          const bucket = adminStorage.bucket();
          const ext = req.file.mimetype.split('/')[1] || 'webp';
          const fileName = `products/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
          const file = bucket.file(fileName);
          await file.save(req.file.buffer, {
            metadata: { contentType: req.file.mimetype },
          });
          await file.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
          return res.json({ imageUrl: publicUrl, storage: 'cloud_storage' });
        } catch {
          const mediaId = await mutateDb((db) => {
            const id = newId('img');
            db.media.push({
              id,
              mimeType: req.file!.mimetype,
              sizeBytes: req.file!.size,
              base64Data: req.file!.buffer.toString('base64'),
              uploadedBy: req.admin?.username || 'admin',
              createdAt: new Date().toISOString(),
            });
            return id;
          });
          return res.json({ imageUrl: `/api/media/${mediaId}`, storage: 'persistent_media' });
        }
      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'បរាជ័យក្នុងការ Upload រូបភាព' });
      }
    }
  );

  app.post(
    '/api/admin/products',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (req: AdminRequest, res) => {
      try {
        const db = await readDb();
        const body = req.body as Partial<Product>;
        const name = String(body.name || '').trim();
        const sku = String(body.sku || '').trim().toUpperCase();
        const category = String(body.category || '').trim() as ProductCategory;
        const priceUsd = Number(body.priceUsd);
        const discountPriceUsd =
          body.discountPriceUsd !== null &&
          body.discountPriceUsd !== undefined &&
          String(body.discountPriceUsd) !== ''
            ? Number(body.discountPriceUsd)
            : null;
        const stock = Math.max(0, Math.floor(Number(body.stock || 0)));
        const description = String(body.description || '').trim();
        const imageUrl = String(body.imageUrl || '').trim();
        const status = body.status === 'out_of_stock' || stock <= 0 ? 'out_of_stock' : 'available';
        const sizes = Array.isArray(body.sizes) ? body.sizes.map((s) => String(s).trim()).filter(Boolean) : [];
        const colors = Array.isArray(body.colors) ? body.colors.map((c) => String(c).trim()).filter(Boolean) : [];

        if (!name || name.length > 160) {
          return res.status(400).json({ error: 'ឈ្មោះផលិតផលមិនត្រឹមត្រូវ' });
        }
        if (!sku || sku.length < 2) {
          return res.status(400).json({ error: 'សូមបញ្ចូលលេខកូដ SKU' });
        }
        if (!category || !db.categories.some((c) => c.slug === category)) {
          return res.status(400).json({ error: 'សូមជ្រើសរើសប្រភេទផលិតផលដែលមានក្នុងប្រព័ន្ធ' });
        }
        if (!Number.isFinite(priceUsd) || priceUsd < 0) {
          return res.status(400).json({ error: 'តម្លៃលក់មិនត្រឹមត្រូវ' });
        }
        if (
          discountPriceUsd !== null &&
          (!Number.isFinite(discountPriceUsd) || discountPriceUsd < 0 || discountPriceUsd >= priceUsd)
        ) {
          return res.status(400).json({ error: 'តម្លៃបញ្ចុះតម្លៃត្រូវតែទាបជាងតម្លៃដើម' });
        }
        if (!imageUrl) {
          return res.status(400).json({ error: 'សូម Upload រូបភាពផលិតផល' });
        }

        const now = new Date().toISOString();
        const product = await mutateDb((state) => {
          const item: Product = {
            id: newId('prod'),
            sku,
            name,
            category,
            priceUsd: Number(priceUsd.toFixed(2)),
            discountPriceUsd: discountPriceUsd !== null ? Number(discountPriceUsd.toFixed(2)) : null,
            stock,
            status,
            description,
            imageUrl,
            sizes,
            colors,
            isNew: Boolean(body.isNew ?? true),
            isPopular: Boolean(body.isPopular ?? false),
            soldCount: 0,
            createdAt: now,
            updatedAt: now,
          };
          state.products.unshift(item);
          return item;
        });

        res.status(201).json({ product });
      } catch (error) {
        console.error('Create product failed:', error);
        res.status(500).json({ error: 'មិនអាចបន្ថែមផលិតផលបានទេ' });
      }
    }
  );

  app.put(
    '/api/admin/products/:id',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (req: AdminRequest, res) => {
      try {
        const db = await readDb();
        const existing = db.products.find((p) => p.id === req.params.id);
        if (!existing) {
          return res.status(404).json({ error: 'រកមិនឃើញផលិតផលទេ' });
        }

        const body = req.body as Partial<Product>;
        const name = body.name !== undefined ? String(body.name).trim() : existing.name;
        const sku = body.sku !== undefined ? String(body.sku).trim().toUpperCase() : existing.sku;
        const category = String(body.category || existing.category).trim();
        const priceUsd = body.priceUsd !== undefined ? Number(body.priceUsd) : existing.priceUsd;
        const discountPriceUsd =
          body.discountPriceUsd !== undefined
            ? body.discountPriceUsd === null || String(body.discountPriceUsd) === ''
              ? null
              : Number(body.discountPriceUsd)
            : existing.discountPriceUsd;
        const stock =
          body.stock !== undefined ? Math.max(0, Math.floor(Number(body.stock))) : existing.stock;
        const status =
          body.status !== undefined
            ? body.status
            : stock <= 0
            ? 'out_of_stock'
            : 'available';

        if (!name || !sku || !Number.isFinite(priceUsd) || priceUsd < 0) {
          return res.status(400).json({ error: 'ទិន្នន័យផលិតផលមិនត្រឹមត្រូវ' });
        }
        if (!db.categories.some((c) => c.slug === category)) {
          return res.status(400).json({ error: 'ប្រភេទផលិតផលមិនត្រឹមត្រូវ' });
        }
        if (discountPriceUsd !== null && (discountPriceUsd < 0 || discountPriceUsd >= priceUsd)) {
          return res.status(400).json({ error: 'តម្លៃបញ្ចុះតម្លៃត្រូវតែទាបជាងតម្លៃដើម' });
        }

        const updatedProduct = await mutateDb((state) => {
          const target = state.products.find((p) => p.id === req.params.id);
          if (!target) return null;
          target.sku = sku;
          target.name = name;
          target.category = category;
          target.priceUsd = Number(priceUsd.toFixed(2));
          target.discountPriceUsd =
            discountPriceUsd !== null ? Number(discountPriceUsd.toFixed(2)) : null;
          target.stock = stock;
          target.status = stock <= 0 ? 'out_of_stock' : status;
          if (body.description !== undefined) target.description = String(body.description).trim();
          if (body.imageUrl !== undefined) target.imageUrl = String(body.imageUrl).trim();
          if (Array.isArray(body.sizes)) {
            target.sizes = body.sizes.map((s) => String(s).trim()).filter(Boolean);
          }
          if (Array.isArray(body.colors)) {
            target.colors = body.colors.map((c) => String(c).trim()).filter(Boolean);
          }
          if (body.isNew !== undefined) target.isNew = Boolean(body.isNew);
          if (body.isPopular !== undefined) target.isPopular = Boolean(body.isPopular);
          target.updatedAt = new Date().toISOString();
          return { ...target };
        });

        res.json({ product: updatedProduct });
      } catch (error) {
        console.error('Update product failed:', error);
        res.status(500).json({ error: 'មិនអាចកែប្រែផលិតផលបានទេ' });
      }
    }
  );

  app.delete(
    '/api/admin/products/:id',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (req: AdminRequest, res) => {
      try {
        const removed = await mutateDb((db) => {
          const idx = db.products.findIndex((p) => p.id === req.params.id);
          if (idx === -1) return false;
          db.products.splice(idx, 1);
          return true;
        });

        if (!removed) {
          return res.status(404).json({ error: 'រកមិនឃើញផលិតផលទេ' });
        }
        res.json({ ok: true });
      } catch (error) {
        console.error('Delete product failed:', error);
        res.status(500).json({ error: 'មិនអាចលុបផលិតផលបានទេ' });
      }
    }
  );

  // ---------------- ADMIN ORDERS, CUSTOMERS & PAYMENTS ----------------

  app.get('/api/admin/orders', requireAdminAuth, async (req, res) => {
    try {
      const db = await readDb();
      let orders = [...db.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const status = String(req.query.status || '').trim();
      const search = String(req.query.search || '').trim().toLowerCase();

      if (status && status !== 'all') {
        orders = orders.filter((o) => o.orderStatus === status);
      }
      if (search) {
        orders = orders.filter(
          (o) =>
            o.orderNumber.toLowerCase().includes(search) ||
            o.customerName.toLowerCase().includes(search) ||
            o.customerPhone.toLowerCase().includes(search)
        );
      }

      res.json({ orders });
    } catch (error) {
      console.error('Fetch admin orders failed:', error);
      res.status(500).json({ error: 'មិនអាចទាញយកការបញ្ជាទិញបានទេ' });
    }
  });

  app.patch('/api/admin/orders/:id/status', requireAdminAuth, async (req: AdminRequest, res) => {
    try {
      const nextStatus = req.body?.orderStatus as OrderStatus;
      const validStatuses: OrderStatus[] = [
        'pending',
        'paid',
        'processing',
        'shipping',
        'completed',
        'cancelled',
        'failed',
      ];
      if (!validStatuses.includes(nextStatus)) {
        return res.status(400).json({ error: 'ស្ថានភាពការបញ្ជាទិញមិនត្រឹមត្រូវទេ' });
      }

      const db = await readDb();
      const existingOrder = db.orders.find((o) => o.id === req.params.id);
      if (!existingOrder) {
        return res.status(404).json({ error: 'រកមិនឃើញការបញ្ជាទិញទេ' });
      }

      if (nextStatus === 'paid' && existingOrder.paymentStatus !== 'paid') {
        if (!['super_admin', 'manager'].includes(req.admin!.role)) {
          return res.status(403).json({ error: 'មានតែ Manager ឬ Super Admin ប៉ុណ្ណោះដែលអាចបញ្ជាក់ការទូទាត់បាន' });
        }
        const paidOrder = await finalizePaidOrder(
          existingOrder.id,
          `ADMIN-${req.admin!.username}`,
          `Verified manually by ${req.admin!.username}`
        );
        return res.json({ order: paidOrder });
      }

      const updatedOrder = await mutateDb((state) => {
        const target = state.orders.find((o) => o.id === req.params.id);
        if (!target) return null;
        target.orderStatus = nextStatus;
        if (nextStatus === 'failed') target.paymentStatus = 'failed';
        target.updatedAt = new Date().toISOString();
        return { ...target };
      });

      if (updatedOrder) {
        if (nextStatus === 'cancelled') {
          await sendOrderTelegramNotification(updatedOrder, 'order_cancelled');
        } else if (nextStatus === 'failed') {
          await sendOrderTelegramNotification(updatedOrder, 'order_failed');
        }
      }

      res.json({ order: updatedOrder });
    } catch (error) {
      console.error('Update order status failed:', error);
      res.status(500).json({ error: 'មិនអាចកែប្រែស្ថានភាពការបញ្ជាទិញបានទេ' });
    }
  });

  app.get('/api/admin/customers', requireAdminAuth, async (_req, res) => {
    try {
      const db = await readDb();
      const customers = [...db.customers].sort((a, b) =>
        b.lastOrderAt.localeCompare(a.lastOrderAt)
      );
      res.json({ customers });
    } catch (error) {
      console.error('Fetch customers failed:', error);
      res.status(500).json({ error: 'មិនអាចទាញយកទិន្នន័យអតិថិជនបានទេ' });
    }
  });

  app.get('/api/admin/payments', requireAdminAuth, async (_req, res) => {
    try {
      const db = await readDb();
      const payments = [...db.payments].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      res.json({ payments });
    } catch (error) {
      console.error('Fetch payments failed:', error);
      res.status(500).json({ error: 'មិនអាចទាញយកប្រវត្តិទូទាត់បានទេ' });
    }
  });

  // ---------------- ADMIN USERS & RBAC ----------------

  app.get(
    '/api/admin/users',
    requireAdminAuth,
    requireRole(['super_admin']),
    async (_req, res) => {
      try {
        const db = await readDb();
        const users = db.admin_accounts.map((a) => ({
          id: a.id,
          username: a.username,
          email: a.email,
          displayName: a.displayName,
          role: a.role,
          active: a.active,
          createdAt: a.createdAt,
          lastLoginAt: a.lastLoginAt,
        }));
        res.json({ users });
      } catch (error) {
        console.error('Fetch admin users failed:', error);
        res.status(500).json({ error: 'មិនអាចទាញយកបញ្ជីអ្នកគ្រប់គ្រងបានទេ' });
      }
    }
  );

  app.post(
    '/api/admin/users',
    requireAdminAuth,
    requireRole(['super_admin']),
    async (req, res) => {
      try {
        const username = String(req.body?.username || '').trim();
        const displayName = String(req.body?.displayName || username).trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');
        const role = req.body?.role as AdminRole;

        if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) {
          return res.status(400).json({ error: 'Username ត្រូវមាន ៣-៤០ តួអក្សរ (អក្សរឡាតាំង លេខ ឬ _)' });
        }
        if (password.length < 8) {
          return res.status(400).json({ error: 'Password ត្រូវមានយ៉ាងតិច ៨ តួអក្សរ' });
        }
        if (!['super_admin', 'manager', 'staff'].includes(role)) {
          return res.status(400).json({ error: 'Role មិនត្រឹមត្រូវ' });
        }

        const db = await readDb();
        if (db.admin_accounts.some((a) => a.username === username)) {
          return res.status(409).json({ error: 'Username នេះមានរួចហើយ' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const now = new Date().toISOString();
        const created = await mutateDb((state) => {
          const acc = {
            id: newId('adm'),
            username,
            displayName,
            email,
            passwordHash,
            role,
            active: true,
            createdAt: now,
          };
          state.admin_accounts.push(acc);
          return {
            id: acc.id,
            username: acc.username,
            displayName: acc.displayName,
            email: acc.email,
            role: acc.role,
            active: acc.active,
            createdAt: acc.createdAt,
          };
        });

        res.status(201).json({ user: created });
      } catch (error) {
        console.error('Create admin user failed:', error);
        res.status(500).json({ error: 'មិនអាចបង្កើតគណនី Admin បានទេ' });
      }
    }
  );

  app.patch(
    '/api/admin/users/:id',
    requireAdminAuth,
    requireRole(['super_admin']),
    async (req: AdminRequest, res) => {
      try {
        if (req.params.id === req.admin?.id && req.body?.active === false) {
          return res.status(400).json({ error: 'មិនអាចបិទគណនីដែលកំពុងប្រើប្រាស់ផ្ទាល់បានទេ' });
        }

        const updated = await mutateDb((state) => {
          const target = state.admin_accounts.find((a) => a.id === req.params.id);
          if (!target) return false;
          if (req.body?.role && ['super_admin', 'manager', 'staff'].includes(req.body.role)) {
            target.role = req.body.role;
          }
          if (typeof req.body?.active === 'boolean') {
            target.active = req.body.active;
          }
          return true;
        });

        if (!updated) {
          return res.status(404).json({ error: 'រកមិនឃើញគណនីទេ' });
        }
        res.json({ ok: true });
      } catch (error) {
        console.error('Update admin user failed:', error);
        res.status(500).json({ error: 'មិនអាចកែប្រែសិទ្ធិអ្នកប្រើប្រាស់បានទេ' });
      }
    }
  );

  // ---------------- BACKUPS & TELEGRAM TEST ----------------

  app.get('/api/admin/backups', requireAdminAuth, async (_req, res) => {
    try {
      const db = await readDb();
      res.json({ backups: db.backups.slice(0, 20) });
    } catch (error) {
      console.error('Fetch backups failed:', error);
      res.status(500).json({ error: 'មិនអាចទាញយកបញ្ជី Backup បានទេ' });
    }
  });

  app.post(
    '/api/admin/backups',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (req: AdminRequest, res) => {
      const snapshot = await runPeriodicBackupIfNeeded('manual', req.admin?.username || 'admin');
      if (!snapshot) {
        return res.status(500).json({ error: 'ការបង្កើត Backup បរាជ័យ' });
      }
      res.status(201).json({ backup: snapshot });
    }
  );

  app.get(
    '/api/admin/backups/export',
    requireAdminAuth,
    requireRole(['super_admin', 'manager']),
    async (_req, res) => {
      try {
        const db = await readDb();
        const payload = {
          exportedAt: new Date().toISOString(),
          shop: 'Oudom Shop',
          categories: db.categories,
          coupons: db.coupons,
          settings: db.settings,
          products: db.products,
          orders: db.orders,
          customers: db.customers,
          payments: db.payments,
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="oudom-shop-backup-${new Date().toISOString().slice(0, 10)}.json"`
        );
        res.send(JSON.stringify(payload, null, 2));
      } catch (error) {
        console.error('Export backup failed:', error);
        res.status(500).json({ error: 'មិនអាចទាញយកឯកសារ Backup បានទេ' });
      }
    }
  );

  app.post(
    '/api/admin/telegram/test',
    requireAdminAuth,
    requireRole(['super_admin']),
    async (req: AdminRequest, res) => {
      const result = await sendRawTelegramMessage(
        `🔔 <b>ឧត្តម Shop — សារសាកល្បង Telegram Bot</b>\nការតភ្ជាប់ Telegram Notification ដំណើរការល្អប្រសើរ (ដោយ ${req.admin?.username})។`
      );
      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }
      res.json({ ok: true });
    }
  );

  // ---------------- VITE / STATIC SPA SERVING ----------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Oudom Shop server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
