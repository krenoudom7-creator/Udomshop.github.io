import type { Order, OrderStatus, PaymentMethod } from '../types/shop.ts';

export interface CustomerOrderHistoryEntry {
  orderNumber: string;
  customerPhone: string;
  customerName?: string;
  totalUsd: number;
  paymentMethod: PaymentMethod;
  orderStatus: OrderStatus;
  paymentStatus: 'pending' | 'paid' | 'failed';
  paymentSubmittedAt?: string;
  itemCount: number;
  firstItemName?: string;
  firstItemImage?: string;
  createdAt: string;
  updatedAt: string;
}

const HISTORY_STORAGE_KEY = 'oudom_customer_order_history';
export const ORDER_HISTORY_EVENT = 'oudom_order_history_updated';

export function loadCustomerOrderHistory(): CustomerOrderHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as CustomerOrderHistoryEntry[])
      .filter((e) => e && typeof e.orderNumber === 'string' && typeof e.customerPhone === 'string')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch {
    return [];
  }
}

export function saveOrderToCustomerHistory(order: Order): CustomerOrderHistoryEntry[] {
  const existing = loadCustomerOrderHistory();
  const normalizedNum = order.orderNumber.trim().toUpperCase();
  const prevMatch = existing.find((e) => e.orderNumber.toUpperCase() === normalizedNum);

  const entry: CustomerOrderHistoryEntry = {
    orderNumber: normalizedNum,
    customerPhone: order.customerPhone || prevMatch?.customerPhone || '',
    customerName: order.customerName || prevMatch?.customerName || '',
    totalUsd: order.totalUsd,
    paymentMethod: order.paymentMethod,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentSubmittedAt: order.paymentSubmittedAt || prevMatch?.paymentSubmittedAt,
    itemCount:
      order.items?.reduce((acc, it) => acc + (it.quantity || 1), 0) ||
      prevMatch?.itemCount ||
      1,
    firstItemName: order.items?.[0]?.name || prevMatch?.firstItemName,
    firstItemImage: order.items?.[0]?.imageUrl || prevMatch?.firstItemImage,
    createdAt: order.createdAt || prevMatch?.createdAt || new Date().toISOString(),
    updatedAt: order.updatedAt || new Date().toISOString(),
  };

  const next = [
    entry,
    ...existing.filter((e) => e.orderNumber.toUpperCase() !== normalizedNum),
  ].slice(0, 25);

  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(ORDER_HISTORY_EVENT));
  } catch {
    // Ignore storage quota errors
  }

  return next;
}

export function removeOrderFromCustomerHistory(orderNumber: string): CustomerOrderHistoryEntry[] {
  const target = orderNumber.trim().toUpperCase();
  const next = loadCustomerOrderHistory().filter((e) => e.orderNumber.toUpperCase() !== target);
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(ORDER_HISTORY_EVENT));
  } catch {
    // Ignore storage errors
  }
  return next;
}

export function playOrderAlertChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.03);
    };

    // Crisp dual bell chime (C6 -> E6 -> G6)
    playTone(1046.5, 0, 0.22);
    playTone(1318.5, 0.14, 0.26);
    playTone(1567.98, 0.28, 0.36);

    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 900);
  } catch {
    // Ignore browser autoplay restrictions before user gesture
  }
}
