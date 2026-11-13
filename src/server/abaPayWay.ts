import crypto from 'crypto';
import type { CurrencyCode, OrderItem, PaymentMethod } from '../types/shop.ts';

export interface AbaPayWayConfig {
  merchantId: string;
  apiKey: string;
  purchaseUrl: string;
  checkUrl: string;
}

export function getAbaConfig(): AbaPayWayConfig | null {
  const merchantId = process.env.ABA_PAYWAY_MERCHANT_ID?.trim();
  const apiKey = process.env.ABA_PAYWAY_API_KEY?.trim();
  if (
    !merchantId ||
    !apiKey ||
    merchantId === 'YOUR_ABA_MERCHANT_ID' ||
    apiKey === 'YOUR_ABA_RSA_OR_HMAC_API_KEY'
  ) {
    return null;
  }

  return {
    merchantId,
    apiKey,
    purchaseUrl:
      process.env.ABA_PAYWAY_API_URL?.trim() ||
      'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase',
    checkUrl:
      process.env.ABA_PAYWAY_CHECK_URL?.trim() ||
      'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2',
  };
}

function getReqTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    now.getUTCFullYear() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds())
  );
}

export function signAbaHash(b4hash: string, apiKey: string): string {
  return crypto.createHmac('sha512', apiKey).update(b4hash).digest('base64');
}

export interface CreateAbaPurchaseParams {
  tranId: string;
  amount: string;
  currency: CurrencyCode;
  items: OrderItem[];
  shipping: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  returnUrl: string;
  continueSuccessUrl: string;
  callbackUrl: string;
}

export interface AbaPurchaseResult {
  configured: boolean;
  checkoutUrl?: string;
  qrString?: string;
  qrImage?: string;
  abapayDeeplink?: string;
  payload?: Record<string, string>;
  rawError?: string;
}

export async function createAbaPayWayPurchase(
  params: CreateAbaPurchaseParams
): Promise<AbaPurchaseResult> {
  const config = getAbaConfig();
  if (!config) {
    return { configured: false };
  }

  const reqTime = getReqTime();
  const nameParts = params.customerName.trim().split(/\s+/);
  const firstname = nameParts[0] || 'Customer';
  const lastname = nameParts.slice(1).join(' ') || 'OudomShop';

  const abaItems = Buffer.from(
    JSON.stringify(
      params.items.map((item) => ({
        name: item.name.slice(0, 60),
        quantity: String(item.quantity),
        price: item.unitPriceUsd.toFixed(2),
      }))
    )
  ).toString('base64');

  const paymentOption = params.paymentMethod === 'aba_khqr' ? 'abapay_khqr' : 'abapay';
  const returnUrlB64 = Buffer.from(params.callbackUrl).toString('base64');
  const cancelUrl = '';
  const returnDeeplink = '';
  const customFields = '';
  const returnParams = params.tranId;
  const type = 'purchase';
  const email = '';

  const b4hash =
    reqTime +
    config.merchantId +
    params.tranId +
    params.amount +
    abaItems +
    params.shipping +
    firstname +
    lastname +
    email +
    params.customerPhone +
    type +
    paymentOption +
    returnUrlB64 +
    cancelUrl +
    params.continueSuccessUrl +
    returnDeeplink +
    params.currency +
    customFields +
    returnParams;

  const hash = signAbaHash(b4hash, config.apiKey);

  const payload: Record<string, string> = {
    req_time: reqTime,
    merchant_id: config.merchantId,
    tran_id: params.tranId,
    firstname,
    lastname,
    email,
    phone: params.customerPhone,
    type,
    payment_option: paymentOption,
    amount: params.amount,
    shipping: params.shipping,
    items: abaItems,
    currency: params.currency,
    return_url: returnUrlB64,
    continue_success_url: params.continueSuccessUrl,
    return_params: returnParams,
    hash,
  };

  try {
    const formData = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
      formData.append(k, v);
    });

    const response = await fetch(config.purchaseUrl, {
      method: 'POST',
      body: formData,
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = (await response.json()) as {
        status?: { code?: string | number; message?: string };
        qrString?: string;
        qrImage?: string;
        abapay_deeplink?: string;
        checkout_qr_url?: string;
      };
      if (json.status?.code !== undefined && String(json.status.code) !== '00') {
        return {
          configured: true,
          checkoutUrl: config.purchaseUrl,
          payload,
          rawError: json.status.message || `PayWay error ${json.status.code}`,
        };
      }
      return {
        configured: true,
        checkoutUrl: config.purchaseUrl,
        qrString: json.qrString,
        qrImage: json.qrImage,
        abapayDeeplink: json.abapay_deeplink,
        payload,
      };
    }

    return {
      configured: true,
      checkoutUrl: config.purchaseUrl,
      payload,
    };
  } catch (error) {
    console.error('ABA PayWay purchase request failed:', error);
    return {
      configured: true,
      checkoutUrl: config.purchaseUrl,
      payload,
      rawError: error instanceof Error ? error.message : 'ABA PayWay connection error',
    };
  }
}

export interface AbaVerificationResult {
  configured: boolean;
  verifiedPaid: boolean;
  status: 'paid' | 'pending' | 'failed';
  apv?: string;
  message: string;
}

export async function verifyAbaTransaction(tranId: string): Promise<AbaVerificationResult> {
  const config = getAbaConfig();
  if (!config) {
    return {
      configured: false,
      verifiedPaid: false,
      status: 'pending',
      message: 'ABA PayWay Merchant credentials are not configured on the server.',
    };
  }

  const reqTime = getReqTime();
  const b4hash = reqTime + config.merchantId + tranId;
  const hash = signAbaHash(b4hash, config.apiKey);

  try {
    const response = await fetch(config.checkUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        req_time: reqTime,
        merchant_id: config.merchantId,
        tran_id: tranId,
        hash,
      }),
    });

    const json = (await response.json()) as {
      status?: { code?: string; message?: string; tran_id?: string };
      data?: {
        payment_status_code?: number;
        payment_status?: string;
        apv?: string;
      };
    };

    const paymentStatus = (json.data?.payment_status || '').toUpperCase();
    const paymentCode = json.data?.payment_status_code;

    if (json.status?.code === '00' && (paymentStatus === 'APPROVED' || paymentCode === 0)) {
      return {
        configured: true,
        verifiedPaid: true,
        status: 'paid',
        apv: json.data?.apv,
        message: 'Verified APPROVED by ABA PayWay Check Transaction API.',
      };
    }

    if (paymentStatus === 'DECLINED' || paymentStatus === 'CANCELLED' || paymentStatus === 'FAILED') {
      return {
        configured: true,
        verifiedPaid: false,
        status: 'failed',
        message: `Transaction status from ABA PayWay: ${paymentStatus}`,
      };
    }

    return {
      configured: true,
      verifiedPaid: false,
      status: 'pending',
      message: json.status?.message || `Payment status: ${paymentStatus || 'PENDING'}`,
    };
  } catch (error) {
    console.error('ABA PayWay verify transaction error:', error);
    return {
      configured: true,
      verifiedPaid: false,
      status: 'pending',
      message: error instanceof Error ? error.message : 'Unable to reach ABA PayWay verification API',
    };
  }
}
