import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Tag,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import type {
  CartItem,
  CurrencyCode,
  DeliveryZone,
  Order,
  PaymentMethod,
} from '../types/shop.ts';
import { apiUrl, safeReadJson } from '../utils/api.ts';
import {
  compressImageToWebP,
  fileToDataUrl,
  formatDateTimeKm,
  formatDualMoney,
  formatMoney,
  getPaymentMethodLabel,
} from '../utils/format.ts';
import { SafeImage } from './SafeImage.tsx';

export interface AbaBankInfo {
  accountName: string;
  accountId: string;
  accountUsd: string;
  accountKhr: string;
  qrUsdImage?: string;
  qrKhrImage?: string;
}

interface CartCheckoutDrawerProps {
  open: boolean;
  items: CartItem[];
  currency: CurrencyCode;
  khrRate: number;
  freeShippingThresholdUsd: number;
  phnomPenhShippingUsd: number;
  provinceShippingUsd: number;
  abaBankInfo?: AbaBankInfo;
  initialStep?: 'cart' | 'checkout';
  onClose: () => void;
  onUpdateQty: (index: number, delta: number) => void;
  onRemoveItem: (index: number) => void;
  onClearCart: () => void;
}

export function CartCheckoutDrawer({
  open,
  items,
  currency,
  khrRate,
  freeShippingThresholdUsd,
  phnomPenhShippingUsd,
  provinceShippingUsd,
  abaBankInfo = {
    accountName: 'UDOM KREN',
    accountId: '3609517',
    accountUsd: '009 338 762',
    accountKhr: '009 338 764',
  },
  initialStep = 'cart',
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
}: CartCheckoutDrawerProps) {
  const [step, setStep] = useState<'cart' | 'checkout' | 'payment'>(initialStep);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryZone, setDeliveryZone] = useState<DeliveryZone>('phnom_penh');
  const [shippingAddress, setShippingAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_qr');
  const [qrCurrency, setQrCurrency] = useState<CurrencyCode>(currency);

  // Promo coupon state
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
  } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponChecking, setCouponChecking] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [abaNotice, setAbaNotice] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [slipDataUrl, setSlipDataUrl] = useState('');
  const [sendingTransferNote, setSendingTransferNote] = useState(false);
  const [transferNoteSent, setTransferNoteSent] = useState('');

  useEffect(() => {
    setQrCurrency(currency);
  }, [currency]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (createdOrder) {
          setCreatedOrder(null);
          setStep('cart');
          setTransferRef('');
          setSlipDataUrl('');
          setTransferNoteSent('');
        }
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, createdOrder, onClose]);

  if (!open) return null;

  const effectiveStep = createdOrder
    ? 'payment'
    : step === 'cart' && initialStep === 'checkout' && items.length > 0
    ? 'checkout'
    : step;

  const subtotalUsd = items.reduce((acc, item) => {
    const unit =
      item.product.discountPriceUsd !== null &&
      item.product.discountPriceUsd < item.product.priceUsd
        ? item.product.discountPriceUsd
        : item.product.priceUsd;
    return acc + unit * item.quantity;
  }, 0);

  const discountSavingsUsd = items.reduce((acc, item) => {
    if (
      item.product.discountPriceUsd !== null &&
      item.product.discountPriceUsd < item.product.priceUsd
    ) {
      return acc + (item.product.priceUsd - item.product.discountPriceUsd) * item.quantity;
    }
    return acc;
  }, 0);

  const couponDiscountUsd = appliedCoupon
    ? appliedCoupon.discountType === 'percent'
      ? Number(((subtotalUsd * appliedCoupon.discountValue) / 100).toFixed(2))
      : Math.min(subtotalUsd, appliedCoupon.discountValue)
    : 0;

  const netSubtotalUsd = Math.max(0, subtotalUsd - couponDiscountUsd);
  const zoneFee = deliveryZone === 'province' ? provinceShippingUsd : phnomPenhShippingUsd;
  const shippingFeeUsd =
    items.length === 0 ? 0 : netSubtotalUsd >= freeShippingThresholdUsd ? 0 : zoneFee;
  const totalUsd = netSubtotalUsd + shippingFeeUsd;

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponError('');
    setCouponChecking(true);
    try {
      const res = await fetch(apiUrl('/api/coupons/validate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotalUsd }),
      });
      const data = await safeReadJson<{
        coupon?: {
          code: string;
          discountType: 'percent' | 'fixed';
          discountValue: number;
          discountUsd: number;
        };
        error?: string;
      }>(res);
      if (!data) {
        setCouponError('មុខងារកូដបញ្ចុះតម្លៃត្រូវការការតភ្ជាប់ Server។');
      } else if (!res.ok || !data.coupon) {
        setAppliedCoupon(null);
        setCouponError(data.error || 'កូដបញ្ចុះតម្លៃមិនត្រឹមត្រូវទេ');
      } else {
        setAppliedCoupon({
          code: data.coupon.code,
          discountType: data.coupon.discountType,
          discountValue: data.coupon.discountValue,
        });
      }
    } catch {
      setCouponError('មិនអាចផ្ទៀងផ្ទាត់កូដបានទេ');
    } finally {
      setCouponChecking(false);
    }
  };

  const handleCheckoutSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setAbaNotice('');
    setVerifyMessage('');
    setSubmitting(true);

    try {
      const response = await fetch(apiUrl('/api/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          deliveryZone,
          shippingAddress: shippingAddress.trim(),
          couponCode: appliedCoupon?.code,
          notes: notes.trim(),
          currency,
          paymentMethod,
          items: items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            selectedSize: item.selectedSize,
            selectedColor: item.selectedColor,
          })),
        }),
      });

      const data = await safeReadJson<{
        order?: Order;
        abaError?: string;
        error?: string;
      }>(response);

      if (!data) {
        const now = new Date().toISOString();
        const staticOrderNumber = `ODS-${Date.now().toString().slice(-6)}`;
        const staticOrder: Order = {
          id: `static_${Date.now()}`,
          orderNumber: staticOrderNumber,
          customerId: 'static_customer',
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          shippingAddress: shippingAddress.trim(),
          deliveryZone,
          notes: notes.trim() || undefined,
          items: items.map((item) => {
            const unitPrice =
              item.product.discountPriceUsd !== null &&
              item.product.discountPriceUsd < item.product.priceUsd
                ? item.product.discountPriceUsd
                : item.product.priceUsd;
            return {
              productId: item.product.id,
              sku: item.product.sku,
              name: item.product.name,
              imageUrl: item.product.imageUrl,
              quantity: item.quantity,
              unitPriceUsd: unitPrice,
              originalPriceUsd: item.product.priceUsd,
              lineTotalUsd: Number((unitPrice * item.quantity).toFixed(2)),
              selectedSize: item.selectedSize,
              selectedColor: item.selectedColor,
            };
          }),
          subtotalUsd: Number(subtotalUsd.toFixed(2)),
          shippingFeeUsd: Number(shippingFeeUsd.toFixed(2)),
          discountUsd: Number((discountSavingsUsd + couponDiscountUsd).toFixed(2)),
          totalUsd: Number(totalUsd.toFixed(2)),
          totalKhr: Math.round(totalUsd * khrRate),
          currency,
          paymentMethod,
          paymentStatus: 'pending',
          orderStatus: 'pending',
          abaTranId: staticOrderNumber,
          abaMode:
            paymentMethod === 'cod'
              ? 'cod'
              : paymentMethod === 'bank_qr'
              ? 'direct_qr'
              : 'unconfigured',
          telegramNotified: false,
          createdAt: now,
          updatedAt: now,
        };

        try {
          const prevRaw = localStorage.getItem('oudom_static_orders');
          const prevList = prevRaw ? (JSON.parse(prevRaw) as Order[]) : [];
          localStorage.setItem(
            'oudom_static_orders',
            JSON.stringify([staticOrder, ...prevList].slice(0, 20))
          );
        } catch {
          // Ignore storage quota errors
        }

        setCreatedOrder(staticOrder);
        if (paymentMethod === 'aba_payway' || paymentMethod === 'aba_khqr') {
          setAbaNotice(
            'កំពុងដំណើរការលើ GitHub Pages Static៖ មិនអាចបង្កើត ABA PayWay API បានទេ។ សូមផ្ទេរប្រាក់ផ្ទាល់តាមគណនី ABA ខាងក្រោម។'
          );
        }
        setStep('payment');
        setAppliedCoupon(null);
        setCouponInput('');
        onClearCart();
        return;
      }

      if (!response.ok || !data.order) {
        setError(data.error || 'មិនអាចបង្កើតការបញ្ជាទិញបានទេ');
        return;
      }

      setCreatedOrder(data.order);
      if (data.abaError) {
        setAbaNotice(data.abaError);
      }
      setStep('payment');
      setAppliedCoupon(null);
      setCouponInput('');
      onClearCart();
    } catch {
      setError('ការតភ្ជាប់មានបញ្ហា។ សូមព្យាយាមម្តងទៀត។');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyPayment = async () => {
    if (!createdOrder) return;
    setVerifying(true);
    setVerifyMessage('');
    try {
      const res = await fetch(apiUrl(`/api/payments/verify/${createdOrder.id}`), {
        method: 'POST',
      });
      const data = await safeReadJson<{
        order?: Order;
        verification?: { verifiedPaid: boolean; status: string; message: string };
        error?: string;
      }>(res);
      if (!data) {
        setVerifyMessage('មិនអាចភ្ជាប់ទៅ Server ដើម្បីផ្ទៀងផ្ទាត់បានទេ។');
        return;
      }
      if (data.order) {
        setCreatedOrder(data.order);
      }
      if (data.verification?.message) {
        setVerifyMessage(data.verification.message);
      } else if (data.error) {
        setVerifyMessage(data.error);
      }
    } catch {
      setVerifyMessage('មិនអាចផ្ទៀងផ្ទាត់ការទូទាត់បានទេ។');
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField(''), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleSlipFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTransferNoteSent('');
    try {
      const optimized = await compressImageToWebP(file, 900);
      const dataUrl = await fileToDataUrl(optimized);
      setSlipDataUrl(dataUrl);
    } catch {
      setTransferNoteSent('មិនអាចអានរូបភាពវិក្កយបត្រនេះបានទេ សូមសាកល្បងរូបភាពផ្សេង។');
    }
  };

  const handleReportTransfer = async () => {
    if (!createdOrder) return;
    if (!transferRef.trim() && !slipDataUrl) {
      setTransferNoteSent('សូមជ្រើសរើសរូបភាពវិក្កយបត្រ ឬបញ្ចូលលេខយោងផ្ទេរប្រាក់ជាមុនសិន។');
      return;
    }
    setSendingTransferNote(true);
    setTransferNoteSent('');
    try {
      const res = await fetch(apiUrl(`/api/orders/${createdOrder.id}/payment-proof`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: transferRef.trim(),
          ...(slipDataUrl ? { slipDataUrl } : {}),
        }),
      });
      const data = await safeReadJson<{ order?: Order; message?: string; error?: string }>(res);
      if (!data) {
        setTransferNoteSent('មិនអាចភ្ជាប់ទៅ Server បានទេ។');
        return;
      }
      if (!res.ok) {
        setTransferNoteSent(data.error || 'មិនអាចផ្ញើភស្តុតាងបង់ប្រាក់បានទេ');
        return;
      }
      if (data.order) setCreatedOrder(data.order);
      setSlipDataUrl('');
      setTransferNoteSent(
        data.message || 'បានផ្ញើភស្តុតាងបង់ប្រាក់ទៅហាងរួចរាល់!'
      );
    } catch {
      setTransferNoteSent('មិនអាចផ្ញើភស្តុតាងបានទេ សូមព្យាយាមម្តងទៀត។');
    } finally {
      setSendingTransferNote(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const handleClose = () => {
    if (createdOrder) {
      setCreatedOrder(null);
      setStep('cart');
      setTransferRef('');
      setSlipDataUrl('');
      setTransferNoteSent('');
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm print:static print:bg-white"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="កន្ត្រកទំនិញ និងការទូទាត់"
    >
      <div
        className="flex h-full w-full sm:max-w-lg flex-col bg-white shadow-2xl print:max-w-full print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#ECE8DF] px-5 print:hidden">
          <div className="flex items-center gap-2.5">
            {effectiveStep === 'checkout' && !createdOrder && (
              <button
                type="button"
                onClick={() => setStep('cart')}
                aria-label="ត្រឡប់ក្រោយ"
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#FAF9F6]"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className="text-base sm:text-lg font-semibold text-[#111111]">
              {effectiveStep === 'cart' && `កន្ត្រកទំនិញ (${items.reduce((a, b) => a + b.quantity, 0)})`}
              {effectiveStep === 'checkout' && 'ព័ត៌មានដឹកជញ្ជូន និងការទូទាត់'}
              {effectiveStep === 'payment' && 'វិក្កយបត្រ & ការទូទាត់ប្រាក់'}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="បិទ"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#111111] hover:bg-[#FAF9F6]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {effectiveStep === 'cart' && (
            <>
              {items.length === 0 ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FAF9F6] text-[#8A8478]">
                    <ShoppingBag className="h-7 w-7 stroke-[1.5]" />
                  </div>
                  <p className="mt-4 text-base font-medium text-[#111111]">
                    កន្ត្រកទំនិញរបស់អ្នកនៅទទេ
                  </p>
                  <p className="mt-1 text-sm text-[#6B6559]">
                    សូមជ្រើសរើសទំនិញដែលអ្នកពេញចិត្តដើម្បីបញ្ជាទិញ
                  </p>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="mt-5 h-11 rounded-xl bg-[#111111] px-6 text-sm font-medium text-white"
                  >
                    ត្រឡប់ទៅទិញទំនិញ
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#ECE8DF]">
                  {items.map((item, idx) => {
                    const unit =
                      item.product.discountPriceUsd !== null &&
                      item.product.discountPriceUsd < item.product.priceUsd
                        ? item.product.discountPriceUsd
                        : item.product.priceUsd;
                    return (
                      <div key={`${item.product.id}-${idx}`} className="flex gap-3.5 py-4">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#FAF9F6] border border-[#ECE8DF]">
                          <SafeImage
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex flex-1 flex-col justify-between min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#111111] line-clamp-1">
                                {item.product.name}
                              </p>
                              {(item.selectedSize || item.selectedColor) && (
                                <p className="mt-0.5 text-xs text-[#6B6559]">
                                  {[item.selectedSize, item.selectedColor].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              aria-label="លុបទំនិញ"
                              onClick={() => onRemoveItem(idx)}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#8A8478] hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center rounded-lg border border-[#E2DDD3] bg-[#FAF9F6]">
                              <button
                                type="button"
                                aria-label="បន្ថយ"
                                onClick={() => onUpdateQty(idx, -1)}
                                className="flex h-9 w-9 items-center justify-center text-[#111111]"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-7 text-center text-xs font-semibold tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                aria-label="បន្ថែម"
                                onClick={() => onUpdateQty(idx, 1)}
                                className="flex h-9 w-9 items-center justify-center text-[#111111]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <p className="text-sm font-semibold tabular-nums text-[#111111]">
                              {formatMoney(unit * item.quantity, currency, khrRate)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {effectiveStep === 'checkout' && (
            <form id="checkout-form" onSubmit={handleCheckoutSubmit} className="space-y-4">
              {/* Promo Coupon Box */}
              <div className="rounded-xl border border-[#ECE8DF] bg-[#FAF9F6] p-3.5 space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#4A463E]">
                  <Tag className="h-3.5 w-3.5 text-[#B8860B]" />
                  <span>មានកូដបញ្ចុះតម្លៃ (Promo Code)?</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="ឧ. OUDOM10"
                    className="h-10 flex-1 rounded-lg border border-[#E2DDD3] bg-white px-3 text-xs font-mono-num uppercase focus:border-[#111111] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={couponChecking || !couponInput.trim()}
                    className="h-10 rounded-lg bg-[#111111] px-4 text-xs font-semibold text-white disabled:opacity-45"
                  >
                    {couponChecking ? '...' : 'ប្រើកូដ'}
                  </button>
                </div>
                {couponError && <p className="text-[11px] text-red-700">{couponError}</p>}
                {appliedCoupon && (
                  <div className="flex items-center justify-between text-xs text-emerald-800">
                    <span>
                      បានប្រើកូដ <b>{appliedCoupon.code}</b> (-${couponDiscountUsd.toFixed(2)})
                    </span>
                    <button
                      type="button"
                      onClick={() => setAppliedCoupon(null)}
                      className="underline text-[11px]"
                    >
                      ដកចេញ
                    </button>
                  </div>
                )}
              </div>

              {/* Order Summary Box */}
              <div className="rounded-xl border border-[#ECE8DF] bg-[#FAF9F6] p-4 space-y-2 text-xs">
                <div className="flex justify-between text-[#4A463E]">
                  <span>សរុបមុខទំនិញ ({items.reduce((a, b) => a + b.quantity, 0)})</span>
                  <span className="font-mono-num">{formatMoney(subtotalUsd, currency, khrRate)}</span>
                </div>
                {discountSavingsUsd > 0 && (
                  <div className="flex justify-between text-[#9A6F04]">
                    <span>សន្សំបានពីការបញ្ចុះតម្លៃទំនិញ</span>
                    <span className="font-mono-num">
                      -{formatMoney(discountSavingsUsd, currency, khrRate)}
                    </span>
                  </div>
                )}
                {couponDiscountUsd > 0 && (
                  <div className="flex justify-between text-emerald-800 font-medium">
                    <span>បញ្ចុះតម្លៃតាមកូដ ({appliedCoupon?.code})</span>
                    <span className="font-mono-num">
                      -{formatMoney(couponDiscountUsd, currency, khrRate)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-[#4A463E]">
                  <span>ថ្លៃដឹកជញ្ជូន (ឥតគិតថ្លៃចាប់ពី ${freeShippingThresholdUsd})</span>
                  <span className="font-mono-num">
                    {shippingFeeUsd === 0
                      ? 'ឥតគិតថ្លៃ'
                      : formatMoney(shippingFeeUsd, currency, khrRate)}
                  </span>
                </div>
                <div className="border-t border-[#E2DDD3] pt-2 flex justify-between text-sm font-bold text-[#111111]">
                  <span>តម្លៃត្រូវបង់សរុប</span>
                  <span className="font-mono-num">{formatDualMoney(totalUsd, khrRate)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A463E] mb-1.5">
                  ឈ្មោះពេញអតិថិជន *
                </label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="ឧ. សុខ ចាន់ណា"
                  className="h-12 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-4 text-sm focus:border-[#111111] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A463E] mb-1.5">
                  លេខទូរស័ព្ទទំនាក់ទំនង *
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  autoComplete="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="012 345 678"
                  className="h-12 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-4 text-sm focus:border-[#111111] focus:bg-white focus:outline-none"
                />
              </div>

              {/* Delivery Zone */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#4A463E] mb-2">
                  <MapPin className="h-3.5 w-3.5 text-[#B8860B]" />
                  <span>តំបន់ដឹកជញ្ជូន *</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDeliveryZone('phnom_penh')}
                    className={`min-h-[48px] rounded-xl border px-3 py-2 text-left text-xs transition ${
                      deliveryZone === 'phnom_penh'
                        ? 'border-[#111111] bg-[#111111] text-white'
                        : 'border-[#E2DDD3] bg-[#FAF9F6] text-[#111111]'
                    }`}
                  >
                    <p className="font-semibold">រាជធានីភ្នំពេញ</p>
                    <p className="text-[11px] opacity-75 font-mono-num">
                      ${phnomPenhShippingUsd.toFixed(2)} (1-2 ម៉ោង)
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryZone('province')}
                    className={`min-h-[48px] rounded-xl border px-3 py-2 text-left text-xs transition ${
                      deliveryZone === 'province'
                        ? 'border-[#111111] bg-[#111111] text-white'
                        : 'border-[#E2DDD3] bg-[#FAF9F6] text-[#111111]'
                    }`}
                  >
                    <p className="font-semibold">តាមបណ្តាខេត្ត</p>
                    <p className="text-[11px] opacity-75 font-mono-num">
                      ${provinceShippingUsd.toFixed(2)} (1-2 ថ្ងៃ)
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A463E] mb-1.5">
                  អាសយដ្ឋានដឹកជញ្ជូន *
                </label>
                <textarea
                  required
                  rows={2}
                  autoComplete="street-address"
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="ផ្ទះលេខ... ផ្លូវ... សង្កាត់/ខណ្ឌ រាជធានី/ខេត្ត"
                  className="w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] p-3.5 text-sm focus:border-[#111111] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A463E] mb-1.5">
                  កំណត់សម្គាល់បន្ថែម (ជាជម្រើស)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ម៉ោងដែលងាយស្រួលទទួលទំនិញ..."
                  className="h-11 w-full rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] px-4 text-sm focus:border-[#111111] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A463E] mb-2">
                  ជ្រើសរើសវិធីសាស្ត្រទូទាត់ *
                </label>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('bank_qr')}
                    className={`flex w-full min-h-[58px] items-center gap-3 rounded-xl border p-3 text-left transition ${
                      paymentMethod === 'bank_qr'
                        ? 'border-[#111111] bg-[#111111] text-white'
                        : 'border-[#E2DDD3] bg-[#FAF9F6] text-[#111111] hover:border-[#111111]'
                    }`}
                  >
                    <QrCode className="h-5 w-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">ស្កេន KHQR / ផ្ទេរ ABA ផ្ទាល់ (ពិតប្រាកដ ១០០%)</p>
                      <p className="text-[11px] opacity-75">
                        ផ្ទេរចូលគណនី {abaBankInfo.accountName} តាមគ្រប់ធនាគារ រួចផ្ញើវិក្កយបត្រ
                      </p>
                    </div>
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cod')}
                      className={`flex min-h-[56px] items-center gap-2.5 rounded-xl border p-3 text-left transition ${
                        paymentMethod === 'cod'
                          ? 'border-[#111111] bg-[#111111] text-white'
                          : 'border-[#E2DDD3] bg-[#FAF9F6] text-[#111111] hover:border-[#111111]'
                      }`}
                    >
                      <Truck className="h-5 w-5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold">បង់ពេលទទួលទំនិញ (COD)</p>
                        <p className="text-[11px] opacity-75">សាច់ប្រាក់ ឬ QR ពេលដឹកដល់</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('aba_payway')}
                      className={`flex min-h-[56px] items-center gap-2.5 rounded-xl border p-3 text-left transition ${
                        paymentMethod === 'aba_payway'
                          ? 'border-[#111111] bg-[#111111] text-white'
                          : 'border-[#E2DDD3] bg-[#FAF9F6] text-[#111111] hover:border-[#111111]'
                      }`}
                    >
                      <CreditCard className="h-5 w-5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold">ABA PayWay API</p>
                        <p className="text-[11px] opacity-75">តម្រូវមាន Merchant Production</p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </form>
          )}

          {effectiveStep === 'payment' && createdOrder && (
            <div className="space-y-4">
              {/* Printable Receipt Header */}
              <div className="hidden print:block text-center border-b pb-3">
                <h1 className="text-xl font-bold">ឧត្តម Shop — វិក្កយបត្របញ្ជាទិញ</h1>
                <p className="text-xs text-neutral-600">{formatDateTimeKm(createdOrder.createdAt)}</p>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  createdOrder.paymentStatus === 'paid'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                    : createdOrder.paymentStatus === 'failed'
                    ? 'border-red-200 bg-red-50 text-red-950'
                    : 'border-amber-200 bg-amber-50 text-amber-950'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {createdOrder.paymentStatus === 'paid' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
                    ) : createdOrder.paymentStatus === 'failed' ? (
                      <AlertCircle className="h-5 w-5 text-red-700 shrink-0" />
                    ) : (
                      <ShieldCheck className="h-5 w-5 text-amber-700 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-bold">
                        {createdOrder.paymentStatus === 'paid'
                          ? 'ទូទាត់ជោគជ័យ (PAID)'
                          : createdOrder.paymentStatus === 'failed'
                          ? 'ការទូទាត់បរាជ័យ (FAILED)'
                          : 'រង់ចាំការទូទាត់ និងផ្ទៀងផ្ទាត់ (PENDING)'}
                      </p>
                      <p className="text-xs opacity-85 mt-0.5">
                        Order ID:{' '}
                        <span className="font-mono-num font-semibold">
                          {createdOrder.orderNumber}
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handlePrintReceipt}
                    className="print:hidden flex h-9 items-center gap-1.5 rounded-lg border border-black/15 bg-white px-3 text-xs font-medium text-[#111111]"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>វិក្កយបត្រ</span>
                  </button>
                </div>
              </div>

              {/* Order Invoice Details */}
              <div className="rounded-2xl border border-[#ECE8DF] bg-[#FAF9F6] p-4 space-y-2.5 text-xs">
                <div className="space-y-1 text-[#4A463E]">
                  <p>អតិថិជន៖ {createdOrder.customerName} ({createdOrder.customerPhone})</p>
                  <p>អាសយដ្ឋាន៖ {createdOrder.shippingAddress}</p>
                  <p>វិធីទូទាត់៖ <b className="text-[#111111]">{getPaymentMethodLabel(createdOrder.paymentMethod)}</b></p>
                </div>
                <div className="border-t border-[#E2DDD3] pt-2 space-y-1.5">
                  {createdOrder.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span className="truncate pr-2">
                        {item.name} × {item.quantity}
                      </span>
                      <span className="font-mono-num shrink-0">
                        ${item.lineTotalUsd.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {createdOrder.couponCode && (
                    <div className="flex justify-between text-emerald-800">
                      <span>កូដបញ្ចុះតម្លៃ ({createdOrder.couponCode})</span>
                      <span className="font-mono-num">
                        -${(createdOrder.couponDiscountUsd || 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-[#6B6559]">
                    <span>ដឹកជញ្ជូន</span>
                    <span className="font-mono-num">${createdOrder.shippingFeeUsd.toFixed(2)}</span>
                  </div>
                </div>
                <div className="border-t border-[#E2DDD3] pt-2 flex justify-between items-baseline">
                  <span className="font-semibold text-[#111111]">សរុបត្រូវបង់</span>
                  <div className="text-right">
                    <p className="text-xl font-bold font-mono-num text-[#111111]">
                      ${createdOrder.totalUsd.toFixed(2)}
                    </p>
                    <p className="text-[11px] font-mono-num text-[#6B6559]">
                      {createdOrder.totalKhr.toLocaleString('en-US')} ៛
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment Instructions & Actions by Method */}
              {createdOrder.paymentStatus !== 'paid' && (
                <div className="rounded-2xl border border-[#E2DDD3] bg-white p-4 space-y-3 print:hidden">
                  {createdOrder.paymentMethod === 'cod' || createdOrder.abaMode === 'cod' ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2 text-xs text-emerald-950">
                      <div className="flex items-center gap-2 font-bold text-emerald-900">
                        <Truck className="h-4 w-4 shrink-0" />
                        <span>ការបញ្ជាទិញបង់ប្រាក់ពេលដឹកដល់ (COD) ត្រូវបានកត់ត្រារួចរាល់!</span>
                      </div>
                      <p className="leading-relaxed">
                        អ្នកដឹកជញ្ជូននឹងទាក់ទងទៅលេខ{' '}
                        <b className="font-mono-num">{createdOrder.customerPhone}</b> មុនពេលមកដល់។ សូមរៀបចំទឹកប្រាក់ចំនួន{' '}
                        <b className="font-mono-num">${createdOrder.totalUsd.toFixed(2)}</b> (ឬ{' '}
                        <b className="font-mono-num">{createdOrder.totalKhr.toLocaleString('en-US')} ៛</b>) សម្រាប់ទូទាត់ពេលទទួលទំនិញ។
                      </p>
                    </div>
                  ) : createdOrder.abaMode === 'live' &&
                    (createdOrder.abaQrImage || createdOrder.abaQrString) ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-[#005B7F]/25 bg-[#005B7F]/5 p-4 text-center space-y-2.5">
                        <p className="text-xs font-bold text-[#005B7F]">
                          ស្កេន ABA KHQR ដើម្បីទូទាត់ (ABA PayWay Official)
                        </p>
                        {createdOrder.abaQrImage && (
                          <div className="mx-auto w-52 overflow-hidden rounded-xl border border-[#E5E0D5] bg-white p-2 shadow-sm">
                            <img
                              src={createdOrder.abaQrImage}
                              alt={`ABA KHQR ${createdOrder.orderNumber}`}
                              className="h-auto w-full object-contain"
                            />
                          </div>
                        )}
                        <p className="text-xs text-[#4A463E]">
                          គណនីទទួល៖ <b className="text-[#111111]">{abaBankInfo.accountName}</b> · ចំនួន{' '}
                          <b className="font-mono-num text-[#111111]">
                            ${createdOrder.totalUsd.toFixed(2)}
                          </b>
                        </p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {createdOrder.abaDeeplink && (
                            <a
                              href={createdOrder.abaDeeplink}
                              className="flex h-9 items-center gap-1.5 rounded-lg bg-[#005B7F] px-3.5 text-xs font-semibold text-white"
                            >
                              <Smartphone className="h-3.5 w-3.5" />
                              <span>បើក ABA Mobile</span>
                            </a>
                          )}
                          {createdOrder.abaQrString && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyText('qr', createdOrder.abaQrString || '')
                              }
                              className="flex h-9 items-center gap-1.5 rounded-lg border border-[#E2DDD3] bg-white px-3 text-xs font-medium text-[#111111]"
                            >
                              {copiedField === 'qr' ? (
                                <Check className="h-3.5 w-3.5 text-emerald-700" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                              <span>{copiedField === 'qr' ? 'បានចម្លង KHQR' : 'ចម្លង KHQR'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : createdOrder.abaMode === 'live' &&
                    createdOrder.abaCheckoutUrl &&
                    createdOrder.abaPayload ? (
                    <>
                      <p className="text-xs text-[#4A463E] leading-relaxed">
                        សូមចុចប៊ូតុងខាងក្រោមដើម្បីបន្តទៅកាន់ ABA PayWay ផ្លូវការ ដើម្បីទូទាត់។
                      </p>
                      <form
                        method="POST"
                        action={createdOrder.abaCheckoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {Object.entries(createdOrder.abaPayload).map(([k, v]) => (
                          <input key={k} type="hidden" name={k} value={v} />
                        ))}
                        <button
                          type="submit"
                          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#005B7F] text-sm font-semibold text-white transition hover:bg-[#004866]"
                        >
                          <CreditCard className="h-4 w-4" />
                          <span>បន្តទៅទូទាត់តាម ABA PayWay</span>
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="space-y-3">
                      {/* Currency Selector for Real Store KHQR */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#005B7F]">
                          ស្កេន KHQR ឬផ្ទេរប្រាក់ផ្ទាល់ (ពិតប្រាកដ)
                        </span>
                        <div className="flex items-center rounded-lg border border-[#E2DDD3] bg-[#FAF9F6] p-0.5 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => setQrCurrency('USD')}
                            className={`rounded-md px-2.5 py-1 transition ${
                              qrCurrency === 'USD'
                                ? 'bg-[#111111] text-white'
                                : 'text-[#6B6559] hover:text-[#111111]'
                            }`}
                          >
                            USD ($)
                          </button>
                          <button
                            type="button"
                            onClick={() => setQrCurrency('KHR')}
                            className={`rounded-md px-2.5 py-1 transition ${
                              qrCurrency === 'KHR'
                                ? 'bg-[#111111] text-white'
                                : 'text-[#6B6559] hover:text-[#111111]'
                            }`}
                          >
                            KHR (៛)
                          </button>
                        </div>
                      </div>

                      {/* Real Admin-Uploaded Shop KHQR Image (USD / KHR) */}
                      {(qrCurrency === 'USD' ? abaBankInfo.qrUsdImage : abaBankInfo.qrKhrImage) ? (
                        <div className="rounded-xl border border-[#005B7F]/25 bg-[#005B7F]/5 p-4 text-center space-y-2.5">
                          <div className="mx-auto w-56 overflow-hidden rounded-xl border border-[#E5E0D5] bg-white p-2 shadow-sm">
                            <SafeImage
                              src={
                                (qrCurrency === 'USD'
                                  ? abaBankInfo.qrUsdImage
                                  : abaBankInfo.qrKhrImage) || ''
                              }
                              alt={`Store KHQR ${qrCurrency}`}
                              className="h-auto w-full object-contain"
                            />
                          </div>
                          <p className="text-xs text-[#4A463E]">
                            ស្កេនតាម ABA, ACLEDA, Wing ឬ Bakong · បញ្ចូលទឹកប្រាក់{' '}
                            <b className="font-mono-num text-[#111111]">
                              {qrCurrency === 'USD'
                                ? `$${createdOrder.totalUsd.toFixed(2)}`
                                : `${createdOrder.totalKhr.toLocaleString('en-US')} ៛`}
                            </b>
                          </p>
                          <p className="text-[11px] text-[#6B6559]">
                            សូមដាក់លេខ <b className="font-mono-num text-[#111111]">{createdOrder.orderNumber}</b> ក្នុង Remark ពេលផ្ទេរ
                          </p>
                        </div>
                      ) : null}

                      {/* Direct Copyable ABA Account Card */}
                      <div className="rounded-xl border border-[#005B7F]/25 bg-[#005B7F]/5 p-3.5 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#005B7F]">
                            គណនីទទួលប្រាក់ ABA Bank
                          </span>
                          <span className="font-mono-num text-[11px] font-semibold text-[#4A463E]">
                            ID: {abaBankInfo.accountId}
                          </span>
                        </div>

                        <div className="rounded-lg bg-white border border-[#E5E0D5] p-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[#6B6559]">ឈ្មោះគណនី (ABA Name)</span>
                            <span className="font-bold text-[#111111]">
                              {abaBankInfo.accountName}
                            </span>
                          </div>

                          <div className="flex items-center justify-between border-t border-[#F2EFE9] pt-2">
                            <div>
                              <span className="text-[#6B6559] block text-[11px]">គណនីដុល្លារ ($)</span>
                              <span className="font-mono-num text-sm font-bold text-[#111111]">
                                {abaBankInfo.accountUsd}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyText('usd', abaBankInfo.accountUsd.replace(/\s+/g, ''))
                              }
                              className="flex h-8 items-center gap-1 rounded-lg border border-[#E2DDD3] px-2.5 text-[11px] font-medium hover:border-[#111111]"
                            >
                              {copiedField === 'usd' ? (
                                <Check className="h-3.5 w-3.5 text-emerald-700" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                              <span>{copiedField === 'usd' ? 'បានចម្លង' : 'ចម្លង'}</span>
                            </button>
                          </div>

                          <div className="flex items-center justify-between border-t border-[#F2EFE9] pt-2">
                            <div>
                              <span className="text-[#6B6559] block text-[11px]">គណនីប្រាក់រៀល (៛)</span>
                              <span className="font-mono-num text-sm font-bold text-[#111111]">
                                {abaBankInfo.accountKhr}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyText('khr', abaBankInfo.accountKhr.replace(/\s+/g, ''))
                              }
                              className="flex h-8 items-center gap-1 rounded-lg border border-[#E2DDD3] px-2.5 text-[11px] font-medium hover:border-[#111111]"
                            >
                              {copiedField === 'khr' ? (
                                <Check className="h-3.5 w-3.5 text-emerald-700" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                              <span>{copiedField === 'khr' ? 'បានចម្លង' : 'ចម្លង'}</span>
                            </button>
                          </div>
                        </div>

                        <p className="text-[11px] text-[#4A463E] leading-relaxed">
                          សូមផ្ទេរចំនួន{' '}
                          <b className="font-mono-num text-[#111111]">
                            ${createdOrder.totalUsd.toFixed(2)}
                          </b>{' '}
                          ({createdOrder.totalKhr.toLocaleString('en-US')} ៛) និងដាក់លេខ{' '}
                          <b className="font-mono-num text-[#111111]">{createdOrder.orderNumber}</b>{' '}
                          ក្នុងកំណត់សម្គាល់ Remark។
                        </p>
                      </div>

                      {/* Upload Payment Slip & Reference Proof (server-backed orders only) */}
                      {!createdOrder.id.startsWith('static_') && (
                        <div className="rounded-xl border border-[#E2DDD3] bg-[#FAF9F6] p-3.5 space-y-2.5">
                          <p className="text-xs font-semibold text-[#111111]">
                            បង្ហោះរូបភាពវិក្កយបត្រផ្ទេរប្រាក់ (Payment Slip)
                          </p>

                          {(slipDataUrl || createdOrder.paymentSlipUrl) && (
                            <div className="flex items-center gap-3 rounded-lg border border-[#E2DDD3] bg-white p-2">
                              <img
                                src={slipDataUrl || apiUrl(createdOrder.paymentSlipUrl || '')}
                                alt="Payment Slip Preview"
                                className="h-16 w-16 rounded-lg object-cover border border-[#ECE8DF]"
                              />
                              <div className="min-w-0 flex-1 text-[11px] text-[#4A463E]">
                                <p className="font-semibold text-[#111111]">
                                  {slipDataUrl
                                    ? 'រូបភាពវិក្កយបត្រត្រៀមរួចរាល់ — សូមចុចប៊ូតុងផ្ញើខាងក្រោម'
                                    : 'បានផ្ញើរូបភាពវិក្កយបត្រទៅហាងរួចរាល់'}
                                </p>
                                {createdOrder.paymentReference && (
                                  <p className="font-mono-num mt-0.5">
                                    Ref: {createdOrder.paymentReference}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[#E2DDD3] bg-white px-3 text-xs font-medium text-[#111111] hover:border-[#111111]">
                              <Upload className="h-3.5 w-3.5 text-[#005B7F]" />
                              <span>ជ្រើសរើសរូបភាពវិក្កយបត្រ</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleSlipFileChange}
                                className="hidden"
                              />
                            </label>
                          </div>

                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={transferRef}
                              onChange={(e) => setTransferRef(e.target.value)}
                              placeholder="លេខយោងផ្ទេរប្រាក់ (បើមាន)..."
                              className="h-10 flex-1 rounded-xl border border-[#E2DDD3] bg-white px-3 text-xs focus:border-[#111111] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleReportTransfer}
                              disabled={sendingTransferNote}
                              className="flex h-10 items-center gap-1.5 rounded-xl bg-[#005B7F] px-3.5 text-xs font-semibold text-white hover:bg-[#004866] disabled:opacity-50 shrink-0"
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span>{sendingTransferNote ? '...' : 'ផ្ញើភស្តុតាង'}</span>
                            </button>
                          </div>
                          {transferNoteSent && (
                            <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                              {transferNoteSent}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {abaNotice && (
                    <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                      {abaNotice}
                    </p>
                  )}

                  {!createdOrder.id.startsWith('static_') &&
                    (createdOrder.paymentMethod === 'aba_payway' ||
                      createdOrder.paymentMethod === 'aba_khqr') && (
                      <button
                        type="button"
                        onClick={handleVerifyPayment}
                        disabled={verifying}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#111111] bg-white text-xs font-semibold text-[#111111] hover:bg-[#FAF9F6] disabled:opacity-50"
                      >
                        {verifying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        <span>ផ្ទៀងផ្ទាត់ស្ថានភាពទូទាត់ពី Server</span>
                      </button>
                    )}

                  {verifyMessage && (
                    <p className="text-xs text-[#4A463E] bg-[#FAF9F6] p-2.5 rounded-lg border border-[#E2DDD3]">
                      {verifyMessage}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        {effectiveStep === 'cart' && items.length > 0 && (
          <div className="shrink-0 border-t border-[#ECE8DF] bg-white p-5 pb-safe space-y-3">
            <div className="space-y-1 text-xs text-[#6B6559]">
              <div className="flex justify-between">
                <span>សរុបរង</span>
                <span className="font-mono-num text-[#111111]">
                  {formatMoney(subtotalUsd, currency, khrRate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>ថ្លៃដឹកជញ្ជូនប៉ាន់ស្មាន</span>
                <span className="font-mono-num text-[#111111]">
                  {shippingFeeUsd === 0
                    ? 'ឥតគិតថ្លៃ'
                    : formatMoney(shippingFeeUsd, currency, khrRate)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-[#111111] pt-1">
                <span>តម្លៃសរុប</span>
                <span className="font-mono-num">{formatDualMoney(totalUsd, khrRate)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep('checkout')}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-[#111111] text-sm font-semibold text-white transition hover:bg-[#262626] active:scale-[0.99]"
            >
              បន្តទៅកាន់ការទូទាត់ (Checkout)
            </button>
          </div>
        )}

        {effectiveStep === 'checkout' && (
          <div className="shrink-0 border-t border-[#ECE8DF] bg-white p-5 pb-safe">
            <button
              type="submit"
              form="checkout-form"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#111111] text-sm font-semibold text-white transition hover:bg-[#262626] active:scale-[0.99] disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>
                បញ្ជាក់ការបញ្ជាទិញ · {formatMoney(totalUsd, currency, khrRate)}
              </span>
            </button>
          </div>
        )}

        {effectiveStep === 'payment' && (
          <div className="shrink-0 border-t border-[#ECE8DF] bg-white p-5 pb-safe print:hidden">
            <button
              type="button"
              onClick={handleClose}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-[#111111] text-sm font-semibold text-white"
            >
              ត្រឡប់ទៅទំព័រហាង
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
