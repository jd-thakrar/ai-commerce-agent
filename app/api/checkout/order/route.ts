import { NextRequest, NextResponse } from 'next/server';
import { activeCart, audit, razorpayRequest } from '@/lib/commerce';
import { supabaseAdmin } from '@/lib/supabase';

type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

export async function POST(request: NextRequest) {
  try {
    const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'NEXT_PUBLIC_RAZORPAY_KEY_ID']
      .filter((name) => !process.env[name]);
    if (missing.length) {
      return NextResponse.json({
        error: `Razorpay is not configured. Add ${missing.join(', ')} to .env.local and restart the server.`,
        missing,
      }, { status: 503 });
    }

    const body = await request.json();
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    if (!sessionId) return NextResponse.json({ error: 'session_id is required' }, { status: 400 });

    const cart = await activeCart(sessionId);
    const amount = Math.round((cart.total ?? 0) * 100);

    const { data: checkoutAudits } = await supabaseAdmin
      .from('audit_logs')
      .select('metadata')
      .eq('session_id', sessionId)
      .eq('action', 'CHECKOUT_STARTED')
      .order('created_at', { ascending: false })
      .limit(10);

    const previousOrderIds = (checkoutAudits || [])
      .map((entry) => {
        const metadata = entry.metadata as { order_id?: string; amount?: number } | null;
        return metadata?.amount === cart.total ? metadata.order_id : undefined;
      })
      .filter((orderId): orderId is string => Boolean(orderId));

    let existingOrderId: string | undefined;
    if (previousOrderIds.length) {
      const { data: existingOrder } = await supabaseAdmin
        .from('orders')
        .select('id')
        .in('id', previousOrderIds)
        .neq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      existingOrderId = existingOrder?.id;
    }

    const razorpayOrder = await razorpayRequest<RazorpayOrder>('/orders', {
      amount,
      currency: cart.currency,
      receipt: `tn_${sessionId.slice(0, 16)}_${Date.now()}`,
      notes: { session_id: sessionId },
    });

    const orderQuery = existingOrderId
      ? supabaseAdmin.from('orders').update({
          razorpay_order_id: razorpayOrder.id,
          amount: cart.total,
          currency: cart.currency,
          status: 'created',
        }).eq('id', existingOrderId)
      : supabaseAdmin.from('orders').insert({
          razorpay_order_id: razorpayOrder.id,
          amount: cart.total,
          currency: cart.currency,
          status: 'created',
        });

    const { data: order, error } = await orderQuery
      .select('id,razorpay_order_id,amount,currency,status')
      .single();

    if (error || !order) throw new Error('Unable to save checkout order.');
    await audit(sessionId, 'CHECKOUT_STARTED', 'Customer authorized checkout', { order_id: order.id, amount: cart.total });
    await audit(sessionId, 'RAZORPAY_ORDER_CREATED', 'Razorpay Test Mode order created', { order_id: order.id, razorpay_order_id: razorpayOrder.id, amount: cart.total, provider: 'razorpay' });
    return NextResponse.json({ key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start checkout.' }, { status: 400 });
  }
}
