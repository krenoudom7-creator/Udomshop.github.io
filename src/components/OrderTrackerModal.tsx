import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ChevronRight,
  History,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { Order } from '../types/shop.ts';
import { apiUrl, safeReadJson } from '../utils/api.ts';
import {
  formatDateTimeKm,
  formatDualMoney,
  getPaymentMethodLabel,
  ORDER_STATUS_LABELS,
} from '../utils/format.ts';
import { lookupOrderTrackingInFirestore } from '../services/firestoreShop.ts';
import {
  loadCustomerOrderHistory,
  ORDER_HISTORY_EVENT,
  removeOrderFromCustomerHistory,
  saveOrderToCustomerHistory,
  type CustomerOrderHistoryEntry,
} from '../utils/orderHistory.ts';
import { OrderProgressTimeline } from './OrderProgressTimeline.tsx';

interface OrderTrackerModalProps {
  open: boolean;
  khrRate: number;
  onClose: () => void;
}

type TrackerTab = 'history' | 'lookup';

async function fetchLiveOrder(orderNumInput: string, phoneInput: string): Promise<{
  order: Order | null;
  error?: string;
}> {
  const cleanOrderNum = orderNumInput.trim().toUpperCase();
  const cleanPhone = phoneInput.trim();
  const params = new URLSearchParams({
    orderNumber: cleanOrderNum,
    phone: cleanPhone,
  });

  try {
    const res = await fetch(apiUrl(`/api/orders/lookup?${params.toString()}`));
    const data = await safeReadJson<{ order?: Order; error?: string }>(res);
    if (!data) {
      const cloudMatch = await lookupOrderTrackingInFirestore(cleanOrderNum, cleanPhone);
      if (cloudMatch) {
        return { order: cloudMatch };
      }
      try {
        const raw = localStorage.getItem('oudom_static_orders');
        const list = raw ? (JSON.parse(raw) as Order[]) : [];
        const targetDigits = cleanPhone.replace(/\D/g, '');
        const match = list.find(
          (o) =>
            o.orderNumber.toUpperCase() === cleanOrderNum &&
            o.customerPhone.replace(/\D/g, '') === targetDigits
        );
        if (match) return { order: match };
      } catch {
        // Ignore storage error
      }
      return { order: null, error: 'រកមិនឃើញលេខកូដបញ្ជាទិញ ឬលេខទូរស័ព្ទនេះទេ។' };
    }
    if (!res.ok || !data.order) {
      return { order: null, error: data.error || 'រកមិនឃើញការបញ្ជាទិញទេ' };
    }
    return { order: data.order };
  } catch {
    return { order: null, error: 'មិនអាចភ្ជាប់ទៅប្រព័ន្ធបានទេ' };
  }
}

export function OrderTrackerModal({ open, khrRate, onClose }: OrderTrackerModalProps) {
  const [history, setHistory] = useState<CustomerOrderHistoryEntry[]>(() =>
    loadCustomerOrderHistory()
  );
  const [activeTab, setActiveTab] = useState<TrackerTab>(() =>
    loadCustomerOrderHistory().length > 0 ? 'history' : 'lookup'
  );
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>('');
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [syncingKey, setSyncingKey] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  // Manual Lookup state
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const syncHistoryEntry = useCallback(async (entry: CustomerOrderHistoryEntry) => {
    setSyncingKey(entry.orderNumber);
    setError('');
    try {
      const result = await fetchLiveOrder(entry.orderNumber, entry.customerPhone);
      if (result.order) {
        const updatedHistory = saveOrderToCustomerHistory(result.order);
        setHistory(updatedHistory);
        setActiveOrder(result.order);
        setSelectedOrderNumber(result.order.orderNumber);
      } else {
        setSelectedOrderNumber(entry.orderNumber);
        setError(result.error || 'មិនអាចទាញស្ថានភាពថ្មីបានទេ');
      }
    } finally {
      setSyncingKey(null);
    }
  }, []);

  const syncAllHistory = useCallback(async () => {
    const current = loadCustomerOrderHistory();
    setHistory(current);
    if (current.length === 0) return;

    setSyncingAll(true);
    try {
      const updates = await Promise.all(
        current.slice(0, 8).map((entry) => fetchLiveOrder(entry.orderNumber, entry.customerPhone))
      );
      let latestList = current;
      let firstFetchedOrder: Order | null = null;

      updates.forEach((res) => {
        if (res.order) {
          latestList = saveOrderToCustomerHistory(res.order);
          if (!firstFetchedOrder) firstFetchedOrder = res.order;
        }
      });

      setHistory(latestList);
      if (firstFetchedOrder && !selectedOrderNumber) {
        const chosen = firstFetchedOrder as Order;
        setSelectedOrderNumber(chosen.orderNumber);
        setActiveOrder(chosen);
      } else if (selectedOrderNumber) {
        const matchedUpdate = updates.find(
          (u) => u.order && u.order.orderNumber === selectedOrderNumber
        );
        if (matchedUpdate?.order) {
          setActiveOrder(matchedUpdate.order);
        }
      }
    } finally {
      setSyncingAll(false);
    }
  }, [selectedOrderNumber]);

  useEffect(() => {
    const reload = () => {
      const latest = loadCustomerOrderHistory();
      setHistory(latest);
    };
    window.addEventListener(ORDER_HISTORY_EVENT, reload);
    return () => window.removeEventListener(ORDER_HISTORY_EVENT, reload);
  }, []);

  useEffect(() => {
    if (!open) return;
    const current = loadCustomerOrderHistory();
    setHistory(current);
    if (current.length > 0) {
      setActiveTab('history');
      void syncAllHistory();
    } else {
      setActiveTab('lookup');
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  if (!open) return null;

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setActiveOrder(null);
    setLoading(true);
    try {
      const res = await fetchLiveOrder(orderNumber, phone);
      if (res.order) {
        const updated = saveOrderToCustomerHistory(res.order);
        setHistory(updated);
        setActiveOrder(res.order);
        setSelectedOrderNumber(res.order.orderNumber);
      } else {
        setError(res.error || 'រកមិនឃើញការបញ្ជាទិញទេ');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveEntry = (orderNum: string) => {
    const next = removeOrderFromCustomerHistory(orderNum);
    setHistory(next);
    if (selectedOrderNumber === orderNum) {
      setSelectedOrderNumber('');
      setActiveOrder(null);
    }
    if (next.length === 0) {
      setActiveTab('lookup');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="ប្រវត្តិទិញ និងតាមដានការបញ្ជាទិញ"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#ECE8DF] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <PackageCheck className="h-5 w-5 text-[#B8860B]" />
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-[#111111]">
                ប្រវត្តិអ្នកទិញ & តាមដានទំនិញ
              </h3>
              <p className="text-[11px] text-[#6B6559]">
                ពិនិត្យមើលថាទំនិញរបស់អ្នកបានដល់ចំណុចណាហើយ
              </p>
            </div>
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

        {/* Mode Tabs */}
        <div className="flex shrink-0 gap-2 border-b border-[#ECE8DF] bg-[#FAF9F6] px-5 py-2.5">
          <button
            type="button"
            onClick={() => {
              setError('');
              setActiveTab('history');
            }}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'history'
                ? 'bg-[#111111] text-white shadow-sm'
                : 'text-[#6B6559] hover:text-[#111111] hover:bg-white'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>ប្រវត្តិទិញរបស់ខ្ញុំ ({history.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setError('');
              setActiveTab('lookup');
            }}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'lookup'
                ? 'bg-[#111111] text-white shadow-sm'
                : 'text-[#6B6559] hover:text-[#111111] hover:bg-white'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>ស្វែងរកតាមលេខ Order</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'history' && (
            <>
              {history.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#E2DDD3] bg-[#FAF9F6] p-6 text-center space-y-2.5">
                  <History className="mx-auto h-8 w-8 text-[#B8860B]/70" />
                  <p className="text-sm font-semibold text-[#111111]">
                    មិនទាន់មានប្រវត្តិការបញ្ជាទិញលើឧបករណ៍នេះទេ
                  </p>
                  <p className="text-xs text-[#6B6559] leading-relaxed">
                    រាល់ការបញ្ជាទិញថ្មី ឬការស្វែងរកលេខ Order នឹងត្រូវរក្សាទុកទីនេះដោយស្វ័យប្រវត្តិ ដើម្បីងាយស្រួលតាមដានទំនិញ។
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('lookup')}
                    className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#111111] px-4 text-xs font-semibold text-white"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>ស្វែងរកតាមលេខ Order</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-[#6B6559]">
                      ចុចលើការបញ្ជាទិញដើម្បីមើលដំណាក់កាលដឹកជញ្ជូន
                    </p>
                    <button
                      type="button"
                      onClick={() => void syncAllHistory()}
                      disabled={syncingAll}
                      className="flex h-8 items-center gap-1 rounded-lg border border-[#E2DDD3] bg-[#FAF9F6] px-2.5 text-[11px] font-semibold text-[#111111] hover:border-[#111111] disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${syncingAll ? 'animate-spin' : ''}`} />
                      <span>ធ្វើបច្ចុប្បន្នភាព</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                    {history.map((entry) => {
                      const isSelected = selectedOrderNumber === entry.orderNumber;
                      const badge =
                        ORDER_STATUS_LABELS[entry.orderStatus] || ORDER_STATUS_LABELS.pending;
                      const isSyncingThis = syncingKey === entry.orderNumber;

                      return (
                        <div
                          key={entry.orderNumber}
                          className={`flex items-center justify-between gap-2 rounded-xl border p-3 transition ${
                            isSelected
                              ? 'border-[#111111] bg-[#FAF9F6] ring-1 ring-[#111111]'
                              : 'border-[#E2DDD3] bg-white hover:border-[#111111]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void syncHistoryEntry(entry)}
                            className="flex flex-1 items-center justify-between gap-2 text-left min-w-0"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono-num text-xs font-bold text-[#111111]">
                                  {entry.orderNumber}
                                </span>
                                <span
                                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badge.tone}`}
                                >
                                  {badge.km}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#6B6559] truncate">
                                {entry.firstItemName ? `${entry.firstItemName} · ` : ''}
                                {entry.itemCount} មុខ ·{' '}
                                <b className="font-mono-num text-[#111111]">
                                  ${entry.totalUsd.toFixed(2)}
                                </b>
                              </p>
                              <p className="text-[10px] text-[#8A8478]">
                                {formatDateTimeKm(entry.createdAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 text-[#6B6559]">
                              {isSyncingThis ? (
                                <Loader2 className="h-4 w-4 animate-spin text-[#B8860B]" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </div>
                          </button>

                          <button
                            type="button"
                            aria-label="លុបពីប្រវត្តិ"
                            onClick={() => handleRemoveEntry(entry.orderNumber)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#8A8478] hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'lookup' && (
            <form onSubmit={handleLookup} className="space-y-3">
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

              <button
                type="submit"
                disabled={loading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#111111] text-sm font-semibold text-white transition hover:bg-[#262626] disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span>ស្វែងរក និងរក្សាទុកក្នុងប្រវត្តិ</span>
              </button>
            </form>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs text-red-700 border border-red-200">
              {error}
            </p>
          )}

          {/* Detailed Shipment Timeline + Order Details */}
          {activeOrder && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-[#6B6559]">
                    ព័ត៌មានតាមដានលម្អិត
                  </p>
                  <p className="font-mono-num text-sm font-bold text-[#111111]">
                    {activeOrder.orderNumber}
                  </p>
                </div>
                <span
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    ORDER_STATUS_LABELS[activeOrder.orderStatus].tone
                  }`}
                >
                  {ORDER_STATUS_LABELS[activeOrder.orderStatus].km}
                </span>
              </div>

              {/* 5-Stage Progress Timeline */}
              <OrderProgressTimeline order={activeOrder} />

              {/* Order Items & Payment Breakdown */}
              <div className="rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] p-4 space-y-2.5 text-xs">
                <p className="text-[11px] text-[#6B6559]">
                  កាលបរិច្ឆេទបញ្ជាទិញ៖ {formatDateTimeKm(activeOrder.createdAt)}
                </p>
                <div className="border-t border-[#E2DDD3] pt-2 space-y-1">
                  {activeOrder.items.map((item, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="truncate pr-2 text-[#111111]">
                        {item.name} × {item.quantity}
                      </span>
                      <span className="font-mono-num shrink-0 font-medium">
                        ${item.lineTotalUsd.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#E2DDD3] pt-2 space-y-1">
                  <div className="flex justify-between text-[#6B6559]">
                    <span>វិធីទូទាត់</span>
                    <span className="font-medium text-[#111111]">
                      {getPaymentMethodLabel(activeOrder.paymentMethod)}
                    </span>
                  </div>
                  {activeOrder.paymentSubmittedAt && (
                    <div className="flex justify-between text-emerald-800">
                      <span>ភស្តុតាងទូទាត់</span>
                      <span className="font-medium">បានផ្ញើទៅហាងរួចរាល់</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-[#111111] pt-1">
                    <span>សរុប ({activeOrder.paymentStatus.toUpperCase()})</span>
                    <span className="font-mono-num">
                      {formatDualMoney(activeOrder.totalUsd, khrRate)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
