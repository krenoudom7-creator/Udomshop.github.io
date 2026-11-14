import type { Order } from '../types/shop.ts';

function formatKhmerDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function isTelegramConfigured(): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  return Boolean(
    token &&
      chatId &&
      token !== 'YOUR_TELEGRAM_BOT_TOKEN' &&
      chatId !== 'YOUR_ADMIN_TELEGRAM_CHAT_ID'
  );
}

export async function sendRawTelegramMessage(htmlText: string): Promise<{ ok: boolean; error?: string }> {
  if (!isTelegramConfigured()) {
    return { ok: false, error: 'Telegram credentials not configured in environment variables.' };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN!.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID!.trim();

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = (await response.json()) as { ok?: boolean; description?: string };
    if (!response.ok || !data.ok) {
      console.error('Telegram API error:', data.description || response.statusText);
      return { ok: false, error: data.description || 'Telegram API error' };
    }
    return { ok: true };
  } catch (error) {
    console.error('Telegram notification request failed:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

export async function sendOrderTelegramNotification(
  order: Order,
  eventType: 'new_order' | 'payment_paid' | 'order_cancelled' | 'order_failed' | 'receipt_confirmed'
): Promise<boolean> {
  const headerMap = {
    new_order: '🛍️ <b>ឧត្តម Shop - New Order</b>',
    payment_paid: '✅ <b>ឧត្តម Shop - ទទួលបានការទូទាត់ជោគជ័យ (Paid)</b>',
    order_cancelled: '🚫 <b>ឧត្តម Shop - ការបញ្ជាទិញត្រូវបានលុប (Cancelled)</b>',
    order_failed: '❌ <b>ឧត្តម Shop - ការទូទាត់បរាជ័យ (Failed)</b>',
    receipt_confirmed: '📦✅ <b>ឧត្តម Shop - ភ្ញៀវបានបញ្ជាក់បង្កាន់ដៃទទួលទំនិញរួចរាល់</b>',
  };

  const itemLines = order.items
    .map((item, idx) => {
      const variantParts = [item.selectedSize, item.selectedColor].filter(Boolean);
      const variantLabel = variantParts.length ? ` (${escapeHtml(variantParts.join(' / '))})` : '';
      return `${idx + 1}. ${escapeHtml(item.name)}${variantLabel}\n   ចំនួន: ${item.quantity} × $${item.unitPriceUsd.toFixed(2)} = $${item.lineTotalUsd.toFixed(2)}`;
    })
    .join('\n');

  const paymentLabelMap: Record<Order['paymentMethod'], string> = {
    bank_qr: 'ស្កេន KHQR / ផ្ទេរ ABA ផ្ទាល់',
    cod: 'បង់ពេលទទួលទំនិញ (COD)',
    aba_khqr: 'ABA KHQR API',
    aba_payway: 'ABA PayWay API',
  };
  const paymentLabel = paymentLabelMap[order.paymentMethod] || order.paymentMethod;
  const statusLabel = order.paymentStatus.toUpperCase();
  const zoneLabel = order.deliveryZone === 'province' ? 'តាមខេត្ត' : 'ភ្នំពេញ';

  const message = [
    headerMap[eventType],
    '',
    `• <b>Order ID:</b> <code>${escapeHtml(order.orderNumber)}</code>`,
    `• <b>ឈ្មោះអតិថិជន:</b> ${escapeHtml(order.customerName)}`,
    `• <b>លេខទូរស័ព្ទ:</b> ${escapeHtml(order.customerPhone)}`,
    `• <b>តំបន់ដឹកជញ្ជូន:</b> ${zoneLabel}`,
    `• <b>អាសយដ្ឋាន:</b> ${escapeHtml(order.shippingAddress)}`,
    ...(order.locationMapUrl || (order.locationLat != null && order.locationLng != null)
      ? [
          `• <b>ទីតាំងលើផែនទី:</b> ${escapeHtml(
            order.locationMapUrl ||
              `https://www.google.com/maps?q=${order.locationLat},${order.locationLng}`
          )}`,
        ]
      : []),
    '',
    `<b>មុខទំនិញ:</b>`,
    itemLines,
    '',
    ...(order.couponCode
      ? [`• <b>កូដបញ្ចុះតម្លៃ (${escapeHtml(order.couponCode)}):</b> -$${(order.couponDiscountUsd || 0).toFixed(2)}`]
      : []),
    `• <b>ដឹកជញ្ជូន:</b> $${order.shippingFeeUsd.toFixed(2)}`,
    `• <b>តម្លៃសរុប:</b> <b>$${order.totalUsd.toFixed(2)}</b> (${order.totalKhr.toLocaleString('en-US')} ៛)`,
    `• <b>វិធីសាស្ត្រទូទាត់:</b> ${paymentLabel}`,
    `• <b>Payment Status:</b> ${statusLabel}`,
    ...(order.paymentReference
      ? [`• <b>លេខយោងផ្ទេរប្រាក់:</b> ${escapeHtml(order.paymentReference)}`]
      : []),
    `• <b>កាលបរិច្ឆេទ និងម៉ោង:</b> ${formatKhmerDateTime(order.createdAt)}`,
  ].join('\n');

  const result = await sendRawTelegramMessage(message);
  return result.ok;
}
