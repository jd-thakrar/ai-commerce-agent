import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { audit, safeEqual } from '@/lib/commerce';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 400 });

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!safeEqual(expected, signature)) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });

  try {
    const event = JSON.parse(rawBody);
    const payment = event?.payload?.payment?.entity;
    const orderEntity = event?.payload?.order?.entity;
    const razorpayOrderId = payment?.order_id || orderEntity?.id;
    if (!razorpayOrderId) return NextResponse.json({ received: true });

    const status = event.event === 'payment.captured' || event.event === 'order.paid' ? 'paid' : event.event === 'payment.failed' ? 'failed' : null;
    if (!status) return NextResponse.json({ received: true });

    const update = status === 'paid' && payment?.id ? { status, razorpay_payment_id: payment.id } : { status };
    const { data: order } = await supabaseAdmin.from('orders').update(update)
      .eq('razorpay_order_id', razorpayOrderId).neq('status', 'paid')
      .select('id,session_id,amount,status,razorpay_payment_id').maybeSingle();
    if (order) await audit(order.session_id, status === 'paid' ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED', `Razorpay webhook: ${event.event}`, { order_id: order.id, razorpay_order_id: razorpayOrderId, payment_id: order.razorpay_payment_id, amount: order.amount, provider: 'razorpay', event: event.event });
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }
}
