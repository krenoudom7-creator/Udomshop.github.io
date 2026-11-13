import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, PackageCheck, Search, X } from 'lucide-react';
import type { Order } from '../types/shop.ts';
import { apiUrl, safeReadJson } from '../utils/api.ts';
import { formatDateTimeKm, formatDualMoney, ORDER_STATUS_LABELS } from '../utils/format.ts';

interface OrderTrackerModalProps {
  open: boolean;
  khrRate: number;
  onClose: () => void;
}

export function OrderTrackerModal({ open, khrRate, onClose }: OrderTrackerModalProps) {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOrder(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        orderNumber: orderNumber.trim().toUpperCase(),
        phone: phone.trim(),
      });
      const res = await fetch(apiUrl(`/api/orders/lookup?${params.toString()}`));
      const data = await safeReadJson<{ order?: Order; error?: string }>(res);
      if (!data) {
        setError('មុខងារតាមដាន Order ត្រូវការការតភ្ជាប់ Node.js Server។');
      } else if (!res.ok || !data.order) {
        setError(data.error || 'រកមិនឃើញការបញ្ជាទិញទេ');
      } else {
        setOrder(data.order);
      }
    } catch {
      setError('មិនអាចភ្ជាប់ទៅប្រព័ន្ធបានទេ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="តាមដានការបញ្ជាទិញ"
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PackageCheck className="h-5 w-5 text-[#B8860B]" />
            <h3 className="text-lg font-semibold text-[#111111]">តាមដានស្ថានភាពការបញ្ជាទិញ</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="បិទ"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#FAF9F6]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleLookup} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#6B6559] mb-1">
              លេខកូដបញ្ជាទិញ (Order ID)
            </label>
            <input
              type="text"
              required
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="ឧ. ODS-261113-A1B2C3"
              className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3.5 text-sm font-mono-num focus:border-[#111111] focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B6559] mb-1">
              លេខទូរស័ព្ទពេលបញ្ជាទិញ
            </label>
            <input
              type="tel"
              inputMode="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="012 345 678"
              className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-3.5 text-sm focus:border-[#111111] focus:bg-white focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#111111] text-sm font-semibold text-white transition hover:bg-[#262626] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span>ពិនិត្យស្ថានភាព</span>
          </button>
        </form>

        {order && (
          <div className="mt-5 rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] p-4 space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-mono-num text-xs font-semibold text-[#111111]">
                {order.orderNumber}
              </span>
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                  ORDER_STATUS_LABELS[order.orderStatus].tone
                }`}
              >
                {ORDER_STATUS_LABELS[order.orderStatus].km}
              </span>
            </div>
            <p className="text-xs text-[#6B6559]">
              កាលបរិច្ឆេទ៖ {formatDateTimeKm(order.createdAt)}
            </p>
            <div className="border-t border-[#E2DDD3] pt-2 space-y-1">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="truncate pr-2">
                    {item.name} × {item.quantity}
                  </span>
                  <span className="font-mono-num shrink-0">${item.lineTotalUsd.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-[#E2DDD3] pt-2 flex justify-between font-semibold text-xs">
              <span>សរុបត្រូវបង់ ({order.paymentStatus.toUpperCase()})</span>
              <span className="font-mono-num">{formatDualMoney(order.totalUsd, khrRate)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
