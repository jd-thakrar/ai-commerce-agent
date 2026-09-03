import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getCart } from '@/lib/agent/tools';

export async function audit(
  sessionId: string,
  action: string,
  description: string,
  metadata: Record<string, unknown> = {}
) {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    session_id: sessionId,
    action,
    description,
    metadata,
  });

  if (error) console.error('Audit log failed:', error);
}

export async function activeCart(sessionId: string) {
  const cart = await getCart({ session_id: sessionId });
  if (!cart.success) throw new Error(cart.error);
  if (!cart.items?.length) throw new Error('Your cart is empty.');
  return cart;
}

export function razorpaySignature(orderId: string, paymentId: string) {
  return crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function razorpayRequest<T>(path: string, body: unknown) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) throw new Error('Razorpay is not configured.');

  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.description || 'Razorpay request failed.');
  return data as T;
}
