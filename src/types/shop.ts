export type ProductCategory = 'shoes' | 'clothing' | 'bags' | 'watches' | 'accessories';

export type ProductStatus = 'available' | 'out_of_stock';

export type CurrencyCode = 'USD' | 'KHR';

export type PaymentMethod = 'aba_payway' | 'aba_khqr';

export type PaymentStatus = 'pending' | 'paid' | 'failed';

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'processing'
  | 'shipping'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type AdminRole = 'super_admin' | 'manager' | 'staff';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  priceUsd: number;
  discountPriceUsd: number | null;
  stock: number;
  status: ProductStatus;
  description: string;
  imageUrl: string;
  sizes: string[];
  colors: string[];
  isNew: boolean;
  isPopular: boolean;
  soldCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
}

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPriceUsd: number;
  originalPriceUsd: number;
  lineTotalUsd: number;
  selectedSize?: string;
  selectedColor?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  notes?: string;
  items: OrderItem[];
  subtotalUsd: number;
  shippingFeeUsd: number;
  discountUsd: number;
  totalUsd: number;
  totalKhr: number;
  currency: CurrencyCode;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  abaTranId: string;
  abaQrString?: string;
  abaCheckoutUrl?: string;
  abaPayload?: Record<string, string>;
  abaMode: 'live' | 'unconfigured';
  telegramNotified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerRecord {
  id: string;
  name: string;
  phone: string;
  address: string;
  totalOrders: number;
  totalSpentUsd: number;
  lastOrderAt: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  tranId: string;
  amountUsd: number;
  amountKhr: number;
  currency: CurrencyCode;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string;
  verifiedByServer: boolean;
  apv?: string;
  statusDetail?: string;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface DashboardStats {
  totalProducts: number;
  totalOrders: number;
  totalCustomers: number;
  outOfStockCount: number;
  dailyRevenueUsd: number;
  monthlyRevenueUsd: number;
  totalRevenueUsd: number;
  khrRate: number;
  topProducts: Array<{
    id: string;
    name: string;
    sku: string;
    imageUrl: string;
    soldCount: number;
    revenueUsd: number;
  }>;
  salesChart: Array<{
    date: string;
    label: string;
    revenueUsd: number;
    orders: number;
  }>;
  integrations: {
    abaConfigured: boolean;
    telegramConfigured: boolean;
    databaseConnected: boolean;
  };
}

export interface BackupSnapshot {
  id: string;
  createdBy: string;
  productCount: number;
  orderCount: number;
  customerCount: number;
  paymentCount: number;
  trigger: 'manual' | 'auto_scheduled';
  createdAt: string;
}
