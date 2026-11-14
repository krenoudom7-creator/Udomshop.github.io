import {
  Check,
  CheckCircle2,
  CreditCard,
  Package,
  ShoppingBag,
  Truck,
  XCircle,
} from 'lucide-react';
import type { Order, OrderStatus } from '../types/shop.ts';
import { formatDateTimeKm } from '../utils/format.ts';

interface OrderProgressTimelineProps {
  order: Pick<
    Order,
    | 'orderStatus'
    | 'paymentStatus'
    | 'paymentMethod'
    | 'paymentSubmittedAt'
    | 'receiptConfirmed'
    | 'receiptConfirmedAt'
    | 'createdAt'
    | 'updatedAt'
  >;
  compact?: boolean;
}

interface MilestoneStep {
  key: OrderStatus;
  labelKm: string;
  descKm: string;
  icon: typeof ShoppingBag;
}

const DELIVERY_MILESTONES: MilestoneStep[] = [
  {
    key: 'pending',
    labelKm: 'បានបញ្ជាទិញ',
    descKm: 'ប្រព័ន្ធបានទទួលការបញ្ជាទិញរបស់អ្នក',
    icon: ShoppingBag,
  },
  {
    key: 'paid',
    labelKm: 'បញ្ជាក់ការទូទាត់',
    descKm: 'ហាងបានផ្ទៀងផ្ទាត់ការបង់ប្រាក់រួចរាល់',
    icon: CreditCard,
  },
  {
    key: 'processing',
    labelKm: 'កំពុងរៀបចំទំនិញ',
    descKm: 'ក្រុមការងារកំពុងត្រួតពិនិត្យ និងវេចខ្ចប់',
    icon: Package,
  },
  {
    key: 'shipping',
    labelKm: 'កំពុងដឹកជញ្ជូន',
    descKm: 'ទំនិញកំពុងធ្វើដំណើរទៅកាន់អាសយដ្ឋានអ្នក',
    icon: Truck,
  },
  {
    key: 'completed',
    labelKm: 'ដល់ដៃជោគជ័យ',
    descKm: 'អតិថិជនបានទទួលទំនិញរួចរាល់',
    icon: CheckCircle2,
  },
];

const STATUS_TO_STEP_INDEX: Record<OrderStatus, number> = {
  pending: 0,
  paid: 1,
  processing: 2,
  shipping: 3,
  completed: 4,
  cancelled: -1,
  failed: -1,
};

export function getOrderStageSummaryKm(
  order: Pick<Order, 'orderStatus' | 'paymentMethod' | 'paymentSubmittedAt' | 'receiptConfirmed'>
): string {
  switch (order.orderStatus) {
    case 'pending':
      if (order.paymentMethod === 'cod') {
        return 'ដំណាក់កាលទី ១/៥ · បានកត់ត្រាការបញ្ជាទិញ (COD) — រង់ចាំហាងរៀបចំដឹក';
      }
      if (order.paymentSubmittedAt) {
        return 'ដំណាក់កាលទី ១/៥ · បានផ្ញើវិក្កយបត្ររួចរាល់ — រង់ចាំហាងផ្ទៀងផ្ទាត់';
      }
      return 'ដំណាក់កាលទី ១/៥ · បានបញ្ជាទិញ — រង់ចាំការទូទាត់ និងផ្ទៀងផ្ទាត់';
    case 'paid':
      return 'ដំណាក់កាលទី ២/៥ · ហាងបានទទួលប្រាក់រួចរាល់ ត្រៀមវេចខ្ចប់ទំនិញ';
    case 'processing':
      return 'ដំណាក់កាលទី ៣/៥ · កំពុងត្រួតពិនិត្យគុណភាព និងវេចខ្ចប់ទំនិញ';
    case 'shipping':
      return 'ដំណាក់កាលទី ៤/៥ · កំពុងដឹកជញ្ជូន — រង់ចាំភ្ញៀវបញ្ជាក់បង្កាន់ដៃពេលទទួលទំនិញ';
    case 'completed':
      return 'ដំណាក់កាលទី ៥/៥ · ភ្ញៀវបានបញ្ជាក់បង្កាន់ដៃទទួលទំនិញជោគជ័យ!';
    case 'cancelled':
      return 'ការបញ្ជាទិញនេះត្រូវបានលុបចោល';
    case 'failed':
      return 'ការទូទាត់ ឬការបញ្ជាទិញមិនជោគជ័យ';
    default:
      return '';
  }
}

export function OrderProgressTimeline({ order, compact = false }: OrderProgressTimelineProps) {
  const isErrorState = order.orderStatus === 'cancelled' || order.orderStatus === 'failed';
  const currentIndex = STATUS_TO_STEP_INDEX[order.orderStatus] ?? 0;
  const stageText = getOrderStageSummaryKm(order);

  if (isErrorState) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-red-900">
        <div className="flex items-start gap-2.5">
          <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-bold">
              {order.orderStatus === 'cancelled'
                ? 'ការបញ្ជាទិញត្រូវបានលុបចោល (Cancelled)'
                : 'ការទូទាត់បរាជ័យ (Failed)'}
            </p>
            <p className="text-red-700">
              បច្ចុប្បន្នភាពចុងក្រោយ៖ {formatDateTimeKm(order.updatedAt || order.createdAt)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-[#E2DDD3] bg-white ${
        compact ? 'p-3 space-y-2.5' : 'p-4 space-y-3.5'
      }`}
    >
      {/* Current Point Callout */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#FAF9F6] border border-[#ECE8DF] px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {order.orderStatus !== 'completed' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C9A227] opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                order.orderStatus === 'completed' ? 'bg-emerald-600' : 'bg-[#B8860B]'
              }`}
            />
          </span>
          <p className="text-xs font-semibold text-[#111111] leading-snug">{stageText}</p>
        </div>
      </div>

      {/* 5-Stage Progress Steps */}
      <div className="space-y-2">
        {DELIVERY_MILESTONES.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = idx < currentIndex || order.orderStatus === 'completed';
          const isCurrent = idx === currentIndex && order.orderStatus !== 'completed';
          const isUpcoming = idx > currentIndex;

          const label =
            step.key === 'paid' && order.paymentMethod === 'cod' && isUpcoming
              ? 'ទូទាត់ពេលដឹកដល់ (COD)'
              : step.labelKm;

          return (
            <div key={step.key} className="relative flex items-start gap-3">
              {/* Vertical connector line */}
              {idx < DELIVERY_MILESTONES.length - 1 && (
                <div
                  aria-hidden="true"
                  className={`absolute left-3.5 top-7 bottom-[-10px] w-0.5 ${
                    idx < currentIndex ? 'bg-emerald-500' : 'bg-[#E5E0D5]'
                  }`}
                />
              )}

              {/* Step Node */}
              <div
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition ${
                  isCompleted
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : isCurrent
                    ? 'border-[#C9A227] bg-[#111111] text-[#C9A227] ring-4 ring-[#C9A227]/20'
                    : 'border-[#E2DDD3] bg-[#FAF9F6] text-[#8A8478]'
                }`}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>

              {/* Step Copy */}
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`text-xs font-semibold ${
                      isCompleted
                        ? 'text-emerald-800'
                        : isCurrent
                        ? 'text-[#111111]'
                        : 'text-[#8A8478]'
                    }`}
                  >
                    {idx + 1}. {label}
                  </p>
                  {isCurrent && (
                    <span className="shrink-0 rounded bg-[#C9A227]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#9A6F04]">
                      បច្ចុប្បន្ន
                    </span>
                  )}
                  {isCompleted && idx === currentIndex && (
                    <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      រួចរាល់
                    </span>
                  )}
                </div>
                {!compact && (
                  <p
                    className={`text-[11px] leading-relaxed ${
                      isUpcoming ? 'text-[#A39E93]' : 'text-[#6B6559]'
                    }`}
                  >
                    {step.key === 'pending' && order.paymentSubmittedAt
                      ? 'បានបញ្ជាទិញ និងផ្ញើវិក្កយបត្រទៅហាងរួចរាល់'
                      : step.key === 'completed' && order.receiptConfirmedAt
                      ? `ភ្ញៀវបានបញ្ជាក់បង្កាន់ដៃទទួលទំនិញ (${formatDateTimeKm(order.receiptConfirmedAt)})`
                      : step.key === 'completed'
                      ? 'សម្រាប់តែភ្ញៀវអ្នកកុម្ម៉ង់បញ្ជាក់បង្កាន់ដៃពេលទទួលទំនិញ'
                      : step.descKm}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-[#8A8478] border-t border-[#F2EFE9] pt-2">
        បច្ចុប្បន្នភាពចុងក្រោយ៖ {formatDateTimeKm(order.updatedAt || order.createdAt)}
      </p>
    </div>
  );
}
