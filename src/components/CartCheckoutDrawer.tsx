import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import type { CartItem, CurrencyCode, Order, PaymentMethod } from '../types/shop.ts';
import { formatDualMoney, formatMoney } from '../utils/format.ts';
import { SafeImage } from './SafeImage.tsx';

interface CartCheckoutDrawerProps {
  open: boolean;
  items: CartItem[];
  currency: CurrencyCode;
  khrRate: number;
  freeShippingThresholdUsd: number;
  standardShippingFeeUsd: number;
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
  standardShippingFeeUsd,
  initialStep = 'cart',
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
}: CartCheckoutDrawerProps) {
  const [step, setStep] = useState<'cart' | 'checkout' | 'payment'>(initialStep);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('aba_payway');
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [abaNotice, setAbaNotice] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');

  if (!open) return null;

  const effectiveStep = createdOrder ? 'payment' : step === 'cart' && initialStep === 'checkout' && items.length > 0 ? 'checkout' : step;

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

  const shippingFeeUsd =
    items.length === 0 ? 0 : subtotalUsd >= freeShippingThresholdUsd ? 0 : standardShippingFeeUsd;
  const totalUsd = subtotalUsd + shippingFeeUsd;

  const handleCheckoutSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setAbaNotice('');
    setVerifyMessage('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          shippingAddress: shippingAddress.trim(),
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

      const data = (await response.json()) as {
        order?: Order;
        abaError?: string;
        error?: string;
      };

      if (!response.ok || !data.order) {
        setError(data.error || 'មិនអាចបង្កើតការបញ្ជាទិញបានទេ');
        return;
      }

      setCreatedOrder(data.order);
      if (data.abaError) {
        setAbaNotice(data.abaError);
      }
      setStep('payment');
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
      const res = await fetch(`/api/payments/verify/${createdOrder.id}`, {
        method: 'POST',
      });
      const data = (await res.json()) as {
        order?: Order;
        verification?: { verifiedPaid: boolean; status: string; message: string };
        error?: string;
      };
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

  const handleClose = () => {
    if (createdOrder) {
      setCreatedOrder(null);
      setStep('cart');
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="កន្ត្រកទំនិញ និងការទូទាត់"
    >
      <div
        className="flex h-full w-full sm:max-w-lg flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#ECE8DF] px-5">
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
              {effectiveStep === 'payment' && 'ការទូទាត់តាម ABA PayWay'}
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
              <div className="rounded-xl border border-[#ECE8DF] bg-[#FAF9F6] p-4 space-y-2 text-xs">
                <div className="flex justify-between text-[#4A463E]">
                  <span>សរុបមុខទំនិញ ({items.reduce((a, b) => a + b.quantity, 0)})</span>
                  <span className="font-mono-num">{formatMoney(subtotalUsd, currency, khrRate)}</span>
                </div>
                {discountSavingsUsd > 0 && (
                  <div className="flex justify-between text-[#9A6F04]">
                    <span>សន្សំបានពីការបញ្ចុះតម្លៃ</span>
                    <span className="font-mono-num">
                      -{formatMoney(discountSavingsUsd, currency, khrRate)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-[#4A463E]">
                  <span>ថ្លៃដឹកជញ្ជូន (ដឹកឥតគិតថ្លៃចាប់ពី ${freeShippingThresholdUsd})</span>
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
                  វិធីសាស្ត្រទូទាត់ (ABA Bank Official)
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('aba_payway')}
                    className={`flex min-h-[56px] items-center gap-2.5 rounded-xl border p-3 text-left transition ${
                      paymentMethod === 'aba_payway'
                        ? 'border-[#111111] bg-[#111111] text-white'
                        : 'border-[#E2DDD3] bg-[#FAF9F6] text-[#111111]'
                    }`}
                  >
                    <CreditCard className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold">ABA PayWay</p>
                      <p className="text-[11px] opacity-75">ABA Mobile / Card</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('aba_khqr')}
                    className={`flex min-h-[56px] items-center gap-2.5 rounded-xl border p-3 text-left transition ${
                      paymentMethod === 'aba_khqr'
                        ? 'border-[#111111] bg-[#111111] text-white'
                        : 'border-[#E2DDD3] bg-[#FAF9F6] text-[#111111]'
                    }`}
                  >
                    <Smartphone className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold">ABA KHQR</p>
                      <p className="text-[11px] opacity-75">ស្កេន QR Code</p>
                    </div>
                  </button>
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
              {/* Payment Status Banner */}
              <div
                className={`rounded-2xl border p-4 ${
                  createdOrder.paymentStatus === 'paid'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                    : createdOrder.paymentStatus === 'failed'
                    ? 'border-red-200 bg-red-50 text-red-950'
                    : 'border-amber-200 bg-amber-50 text-amber-950'
                }`}
              >
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
                      លេខកូដបញ្ជាទិញ៖{' '}
                      <span className="font-mono-num font-semibold">{createdOrder.orderNumber}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Amount Due */}
              <div className="rounded-2xl border border-[#ECE8DF] bg-[#FAF9F6] p-4 space-y-2">
                <p className="text-xs text-[#6B6559]">ចំនួនទឹកប្រាក់ត្រូវបង់ (គណនាពី Server)</p>
                <p className="text-2xl font-bold font-mono-num text-[#111111]">
                  ${createdOrder.totalUsd.toFixed(2)}
                </p>
                <p className="text-xs font-mono-num text-[#6B6559]">
                  ស្មើនឹង {createdOrder.totalKhr.toLocaleString('en-US')} ៛
                </p>
                <div className="pt-2 border-t border-[#E2DDD3] text-xs text-[#4A463E] space-y-1">
                  <p>អតិថិជន៖ {createdOrder.customerName} ({createdOrder.customerPhone})</p>
                  <p>ដឹកជញ្ជូនទៅ៖ {createdOrder.shippingAddress}</p>
                </div>
              </div>

              {/* ABA PayWay Official Checkout Actions */}
              {createdOrder.paymentStatus !== 'paid' && (
                <div className="rounded-2xl border border-[#E2DDD3] bg-white p-4 space-y-3">
                  {createdOrder.abaMode === 'live' && createdOrder.abaCheckoutUrl && createdOrder.abaPayload ? (
                    <>
                      <p className="text-xs text-[#4A463E] leading-relaxed">
                        សូមចុចប៊ូតុងខាងក្រោមដើម្បីបន្តទៅកាន់ ABA PayWay ផ្លូវការ ឬបើកកម្មវិធី ABA Mobile ដើម្បីទូទាត់។ ប្រព័ន្ធនឹងផ្ទៀងផ្ទាត់ការទូទាត់ដោយស្វ័យប្រវត្តិតាម Server Callback។
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

                      {createdOrder.abaQrString && (
                        <div className="rounded-xl bg-[#FAF9F6] p-3 text-xs text-[#4A463E]">
                          <p className="font-semibold mb-1">ABA KHQR String:</p>
                          <p className="break-all font-mono-num text-[11px]">
                            {createdOrder.abaQrString}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl bg-[#FAF9F6] p-3.5 text-xs text-[#4A463E] space-y-1.5">
                      <p className="font-semibold text-[#111111]">
                        ស្ថានភាព ABA PayWay Gateway
                      </p>
                      <p>
                        ការបញ្ជាទិញត្រូវបានរក្សាទុកក្នុងប្រព័ន្ធ Database និងផ្ញើដំណឹងទៅ Telegram Admin រួចរាល់។
                      </p>
                      <p className="text-[#6B6559]">
                        ដើម្បីទូទាត់ដោយផ្ទាល់តាម ABA PayWay Online API សូមម្ចាស់ហាងកំណត់{' '}
                        <code className="font-mono-num">ABA_PAYWAY_MERCHANT_ID</code> និង{' '}
                        <code className="font-mono-num">ABA_PAYWAY_API_KEY</code> ក្នុង Environment Variables។
                      </p>
                    </div>
                  )}

                  {abaNotice && (
                    <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                      {abaNotice}
                    </p>
                  )}

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
                    <span>ផ្ទៀងផ្ទាត់ស្ថានភាពទូទាត់ពី ABA Server</span>
                  </button>

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
                <span>ថ្លៃដឹកជញ្ជូន</span>
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
          <div className="shrink-0 border-t border-[#ECE8DF] bg-white p-5 pb-safe">
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
