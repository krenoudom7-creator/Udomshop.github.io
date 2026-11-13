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
  eventType: 'new_order' | 'payment_paid' | 'order_cancelled' | 'order_failed'
): Promise<boolean> {
  const headerMap = {
    new_order: '🛍️ <b>ឧត្តម Shop - New Order</b>',
    payment_paid: '✅ <b>ឧត្តម Shop - ទទួលបានការទូទាត់ជោគជ័យ (Paid)</b>',
    order_cancelled: '🚫 <b>ឧត្តម Shop - ការបញ្ជាទិញត្រូវបានលុប (Cancelled)</b>',
    order_failed: '❌ <b>ឧត្តម Shop - ការទូទាត់បរាជ័យ (Failed)</b>',
  };

  const itemLines = order.items
    .map((item, idx) => {
      const variantParts = [item.selectedSize, item.selectedColor].filter(Boolean);
      const variantLabel = variantParts.length ? ` (${escapeHtml(variantParts.join(' / '))})` : '';
      return `${idx + 1}. ${escapeHtml(item.name)}${variantLabel}\n   ចំនួន: ${item.quantity} × $${item.unitPriceUsd.toFixed(2)} = $${item.lineTotalUsd.toFixed(2)}`;
    })
    .join('\n');

  const paymentLabel = order.paymentMethod === 'aba_khqr' ? 'ABA KHQR' : 'ABA PayWay';
  const statusLabel = order.paymentStatus.toUpperCase();

  const message = [
    headerMap[eventType],
    '',
    `• <b>Order ID:</b> <code>${escapeHtml(order.orderNumber)}</code>`,
    `• <b>ឈ្មោះអតិថិជន:</b> ${escapeHtml(order.customerName)}`,
    `• <b>លេខទូរស័ព្ទ:</b> ${escapeHtml(order.customerPhone)}`,
    `• <b>អាសយដ្ឋាន:</b> ${escapeHtml(order.shippingAddress)}`,
    '',
    `<b>មុខទំនិញ:</b>`,
    itemLines,
    '',
    `• <b>ដឹកជញ្ជូន:</b> $${order.shippingFeeUsd.toFixed(2)}`,
    `• <b>តម្លៃសរុប:</b> <b>$${order.totalUsd.toFixed(2)}</b> (${order.totalKhr.toLocaleString('en-US')} ៛)`,
    `• <b>វិធីសាស្ត្រទូទាត់:</b> ${paymentLabel}`,
    `• <b>Payment Status:</b> ${statusLabel}`,
    `• <b>កាលបរិច្ឆេទ និងម៉ោង:</b> ${formatKhmerDateTime(order.createdAt)}`,
  ].join('\n');

  const result = await sendRawTelegramMessage(message);
  return result.ok;
}
