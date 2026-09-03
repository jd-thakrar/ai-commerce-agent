import { NextRequest, NextResponse } from 'next/server';
import { audit } from '@/lib/commerce';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id.trim() : '';
    if (!orderId) return NextResponse.json({ error: 'razorpay_order_id is required.' }, { status: 400 });

    const { data: order, error } = await supabaseAdmin.from('orders').update({ status: 'failed' })
      .eq('razorpay_order_id', orderId).neq('status', 'paid')
      .select('id,session_id,amount,status').maybeSingle();
    if (error || !order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    await audit(order.session_id, 'PAYMENT_FAILED', 'Razorpay payment was not completed', { order_id: order.id, razorpay_order_id: orderId, amount: order.amount, provider: 'razorpay' });
    return NextResponse.json({ success: true, status: order.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to record payment failure.' }, { status: 400 });
  }
}
