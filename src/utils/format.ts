import type {
  Category,
  CurrencyCode,
  OrderStatus,
  PaymentMethod,
  ProductCategory,
} from '../types/shop.ts';

export const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  all: 'ទាំងអស់',
  shoes: 'ស្បែកជើង',
  clothing: 'សម្លៀកបំពាក់',
  bags: 'កាបូប',
  watches: 'នាឡិកា',
  accessories: 'សម្ភារៈប្រើប្រាស់',
};

export function getCategoryLabel(
  slug: ProductCategory,
  categories: Category[] = []
): string {
  if (slug === 'all') return 'ទាំងអស់';
  const match = categories.find((c) => c.slug === slug);
  if (match) return match.nameKm;
  return DEFAULT_CATEGORY_LABELS[slug] || slug;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, { km: string; en: string; tone: string }> = {
  pending: {
    km: 'រង់ចាំទូទាត់',
    en: 'Pending',
    tone: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  paid: {
    km: 'បានទូទាត់',
    en: 'Paid',
    tone: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  processing: {
    km: 'កំពុងរៀបចំ',
    en: 'Processing',
    tone: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  shipping: {
    km: 'កំពុងដឹកជញ្ជូន',
    en: 'Shipping',
    tone: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  completed: {
    km: 'បានបញ្ចប់',
    en: 'Completed',
    tone: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  cancelled: {
    km: 'បានលុបចោល',
    en: 'Cancelled',
    tone: 'bg-neutral-100 text-neutral-700 border-neutral-300',
  },
  failed: {
    km: 'បរាជ័យ',
    en: 'Failed',
    tone: 'bg-red-50 text-red-800 border-red-200',
  },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_qr: 'ស្កេន KHQR / ផ្ទេរ ABA ផ្ទាល់',
  cod: 'បង់ពេលទទួលទំនិញ (COD)',
  aba_payway: 'ABA PayWay API',
  aba_khqr: 'ABA KHQR',
};

export function getPaymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] || method;
}

export function formatMoney(amountUsd: number, currency: CurrencyCode, khrRate = 4100): string {
  if (currency === 'KHR') {
    const khr = Math.round(amountUsd * khrRate);
    return `${khr.toLocaleString('en-US')} ៛`;
  }
  return `$${amountUsd.toFixed(2)}`;
}

export function formatDualMoney(amountUsd: number, khrRate = 4100): string {
  const khr = Math.round(amountUsd * khrRate);
  return `$${amountUsd.toFixed(2)} (${khr.toLocaleString('en-US')} ៛)`;
}

export function formatDateTimeKm(iso: string): string {
  try {
    return new Intl.DateTimeFormat('km-KH', {
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function compressImageToWebP(file: File, maxWidth = 1100): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const targetWidth = Math.round(img.width * scale);
      const targetHeight = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const webpName = file.name.replace(/\.[^.]+$/, '') + '.webp';
          resolve(new File([blob], webpName, { type: 'image/webp' }));
        },
        'image/webp',
        0.84
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
